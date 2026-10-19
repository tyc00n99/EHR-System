/**
 * Claim run: which notes are ready to bill, approving them into claims, building the 837P, handing
 * it to the clearinghouse (or to the office as a download for Waystar's portal), and recording what
 * went out. Takes a database so the tests run it against PGlite; every write goes through `audited`.
 *
 * Approval is one transaction (Oct 19, 2026, Phase 1): the authorizations involved are locked, the
 * readiness rules are evaluated against what is already reserved, units are reserved, the notes are
 * frozen and locked, and each claim gets an immutable version holding everything it was built from.
 * Money is integer cents throughout (`./money`). Every query on a billing table is scoped to the
 * organisation; the host's clinical tables are one organisation per database.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lt, lte, max, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { audited, type Actor, type Executor } from "@/db/audited";
import {
  authorizationUnits, billingProviders, claimBatches, claimLines, claimVersions, claims, clientDiagnoses, clientFundingSources,
  evvExceptions, evvPolicies, evvServiceRules, evvVisits, organizations, payers, people, serviceAgreements, staff, visits,
} from "@/db/schema";
import { ruleFor } from "@/evv/rules";
import { build837P, claimProblems, fileProblems, type BillingProvider, type ClaimInput, type Payer } from "./x12-837p";
import type { ClaimStatusUpdate, ClearinghouseAdapter } from "./clearinghouse";
import { centsToDecimal, lineCents, sumCents, toCents, type Cents } from "./money";
import { canonical, LIVE_CLAIM, lockNotes, sha256, unlockNotes } from "./notes";
import { DEFAULT_PROFILE, payerProfile } from "./profiles";
import { blocking, coverageFor, findOverlaps, readiness, resolvePayer, setupReadiness, warnings, type Check, type Coverage, type EvvFacts, type Overlap } from "./readiness";

export type LineState = "ready" | "hold" | "claimed";

export interface BillableLine {
  visitId: string;
  personId: string;
  personName: string;
  agreementId: string;
  serviceCode: string;
  modifiers: string[];
  units: number;
  rateCents: Cents;
  amountCents: Cents;
  /** Central date of service, YYYY-MM-DD. */
  date: string;
  staffName: string;
  state: LineState;
  /** Why it is held, when it is, as sentences. */
  holds: string[];
  /** Checks that flag the line without holding it. */
  warnings: Check[];
  /** What the EVV record says, for the billing screen's EVV column. */
  evv: EvvFacts;
  /** The rules behind `holds`, with their source and where to fix them. */
  checks: Check[];
  payerId: string | null;
  locked: boolean;
  /** The live claim holding it, when claimed. */
  claim: { id: string; status: string } | null;
}

const centralDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** A refusal raised inside the approval transaction; rolls it back and becomes `{ ok: false }`. */
class Refusal extends Error { constructor(public problems: string[]) { super(problems.join("; ")); } }

interface Row {
  visitId: string; personId: string; personFirst: string; personLast: string; dob: string; sex: string | null; pmi: string;
  address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null;
  staffId: string; returnedAt: Date | null; clockOutAt: Date | null;
  agreementId: string; agreementNumber: string; agStatus: string; agStart: string; agEnd: string; agCode: string; agModifiers: string[]; agUnits: number; agArchivedAt: Date | null; unitRate: string;
  serviceCode: string; modifiers: string[]; units: number;
  placeOfService: string; renderingIdType: "npi" | "umpi"; renderingId: string; staffFirst: string; staffLast: string;
  clockInAt: Date; clientSignedAt: Date | null; staffSignedAt: Date | null; manualEntry: boolean; manualEvidenceAt: Date | null; lockedAt: Date | null;
}

async function loadRows(db: Executor, where: { from?: Date; to?: Date; visitIds?: string[] }): Promise<Row[]> {
  const conds = [eq(visits.status, "completed")];
  if (where.from) conds.push(gte(visits.clockInAt, where.from));
  if (where.to) conds.push(lte(visits.clockInAt, where.to));
  if (where.visitIds) conds.push(inArray(visits.id, where.visitIds.length ? where.visitIds : [randomUUID()]));
  return db
    .select({
      visitId: visits.id, staffId: visits.staffId, returnedAt: visits.returnedAt, clockOutAt: visits.clockOutAt, personId: people.id, personFirst: people.firstName, personLast: people.lastName, dob: people.dob, sex: people.sexAtBirth, pmi: visits.pmi,
      address1: people.address1, address2: people.address2, city: people.city, state: people.state, zip: people.zip,
      agreementId: serviceAgreements.id, agreementNumber: serviceAgreements.agreementNumber, agStatus: serviceAgreements.status, agStart: serviceAgreements.startDate, agEnd: serviceAgreements.endDate,
      agCode: serviceAgreements.serviceCode, agModifiers: serviceAgreements.modifiers, agUnits: serviceAgreements.authorizedUnits, agArchivedAt: serviceAgreements.archivedAt, unitRate: serviceAgreements.unitRate,
      serviceCode: visits.serviceCode, modifiers: visits.modifiers, units: visits.units,
      placeOfService: visits.placeOfService, renderingIdType: visits.renderingIdType, renderingId: visits.renderingId, staffFirst: staff.firstName, staffLast: staff.lastName,
      clockInAt: visits.clockInAt, clientSignedAt: visits.clientSignedAt, staffSignedAt: visits.staffSignedAt, manualEntry: visits.manualEntry, manualEvidenceAt: visits.manualEvidenceAt, lockedAt: visits.lockedAt,
    })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(staff, eq(visits.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(and(...conds))
    .orderBy(visits.clockInAt) as Promise<Row[]>;
}

/**
 * Creates what billing needs to exist for an organisation, once: the billing provider (copied from
 * the organisation's own details) and the Minnesota DHS fee-for-service payer. Idempotent.
 */
export async function ensureBillingDefaults(db: Executor, orgId: string, actor: Actor = { userId: null }) {
  const a = audited(db, actor);
  let [provider] = await db.select().from(billingProviders).where(eq(billingProviders.organizationId, orgId));
  if (!provider) {
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    if (!org) throw new Error("Organization not found");
    provider = await a.insert(billingProviders, {
      organizationId: orgId, legalName: org.name, taxId: org.taxId, npi: org.npi, umpi: org.umpi,
      address1: org.address1, address2: org.address2, city: org.city, state: org.state, zip: org.zip, phone: org.phone,
    });
  } else {
    // Fill only what the billing provider is missing from the organisation (Settings), so fixing a
    // gap in Settings reaches billing, while nothing billing already holds is overwritten.
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const gaps: Record<string, string> = {};
    if (org) for (const [k, v] of [["taxId", org.taxId], ["npi", org.npi], ["umpi", org.umpi], ["address1", org.address1], ["city", org.city], ["state", org.state], ["zip", org.zip], ["phone", org.phone]] as const) {
      if (v && !provider[k]) gaps[k] = v;
    }
    if (Object.keys(gaps).length) provider = await a.update(billingProviders, provider.id, gaps);
  }
  let [payer] = await db.select().from(payers).where(and(eq(payers.organizationId, orgId), eq(payers.key, DEFAULT_PROFILE.key)));
  if (!payer) {
    payer = await a.insert(payers, {
      organizationId: orgId, key: DEFAULT_PROFILE.key, name: DEFAULT_PROFILE.name, kind: DEFAULT_PROFILE.kind,
      profileKey: DEFAULT_PROFILE.key, profileVersion: DEFAULT_PROFILE.version, isDefault: true,
    });
  } else if (payer.profileKey === DEFAULT_PROFILE.key && payer.profileVersion !== DEFAULT_PROFILE.version) {
    // The payer follows the latest reviewed profile; claim versions keep the one they were built with.
    payer = await a.update(payers, payer.id, { profileVersion: DEFAULT_PROFILE.version });
  }
  return { provider, defaultPayer: payer };
}

interface Context {
  dx: Map<string, string[]>;
  coverage: Map<string, Coverage[]>;
  used: Map<string, number>;
  live: Map<string, { id: string; status: string }>;
  defaultPayerId: string | null;
  /** payer id → what a missing or unaccepted EVV record does on that payer. */
  evvAggregator: Map<string, "block" | "warn" | "off">;
  holdNoncompliant: boolean;
  evv: Map<string, EvvFacts>;
  overlaps: Map<string, { caregiver: Overlap[]; service: Overlap[] }>;
}

const NO_EVV: EvvFacts = { required: false, recorded: false, compliance: null, submission: null, openExceptions: 0, evvVisitId: null };

async function loadContext(db: Executor, orgId: string, rows: Row[]): Promise<Context> {
  const personIds = [...new Set(rows.map((r) => r.personId))];
  const agreementIds = [...new Set(rows.map((r) => r.agreementId))];
  const visitIds = rows.map((r) => r.visitId);
  const none = [randomUUID()];
  const ids = (xs: string[]) => (xs.length ? xs : none);
  const times = rows.flatMap((r) => [+r.clockInAt, +(r.clockOutAt ?? r.clockInAt)]);
  const lo = new Date(times.length ? Math.min(...times) : 0);
  const hi = new Date(times.length ? Math.max(...times) : 0);
  const [dxRows, covRows, usedRows, liveRows, payerRows, [policy], ruleRows, evvRows, spanRows] = await Promise.all([
    db.select().from(clientDiagnoses).where(and(inArray(clientDiagnoses.personId, ids(personIds)), isNull(clientDiagnoses.archivedAt))),
    db.select().from(clientFundingSources).where(inArray(clientFundingSources.personId, ids(personIds))),
    db.select({ agreementId: authorizationUnits.serviceAgreementId, units: sql<number>`coalesce(sum(${authorizationUnits.units}), 0)::int` }).from(authorizationUnits)
      .where(and(eq(authorizationUnits.organizationId, orgId), inArray(authorizationUnits.serviceAgreementId, ids(agreementIds)), ne(authorizationUnits.state, "released")))
      .groupBy(authorizationUnits.serviceAgreementId),
    db.select({ visitId: claimLines.visitId, id: claims.id, status: claims.status }).from(claimLines).innerJoin(claims, eq(claimLines.claimId, claims.id))
      .where(and(eq(claims.organizationId, orgId), inArray(claimLines.visitId, ids(visitIds)), inArray(claims.status, [...LIVE_CLAIM]))),
    db.select({ id: payers.id, isDefault: payers.isDefault, profileKey: payers.profileKey, profileVersion: payers.profileVersion }).from(payers).where(and(eq(payers.organizationId, orgId), eq(payers.active, true))),
    db.select({ hold: evvPolicies.billingHoldOnNoncompliant }).from(evvPolicies).where(and(eq(evvPolicies.organizationId, orgId), eq(evvPolicies.state, "MN"))),
    db.select().from(evvServiceRules).where(eq(evvServiceRules.organizationId, orgId)),
    db.select({
      id: evvVisits.id, visitId: evvVisits.visitId, evvRequired: evvVisits.evvRequired, compliance: evvVisits.complianceStatus, submission: evvVisits.submissionStatus, sharedCare: evvVisits.sharedCare,
      open: sql<number>`(select count(*)::int from ${evvExceptions} where ${evvExceptions.evvVisitId} = ${evvVisits.id} and ${evvExceptions.status} = 'open')`,
    }).from(evvVisits).where(and(eq(evvVisits.organizationId, orgId), ne(evvVisits.status, "voided"), inArray(evvVisits.visitId, ids(visitIds)))),
    // Every completed note that shares minutes with the window, to find overlaps across clients.
    db.select({ visitId: visits.id, personId: visits.personId, first: people.firstName, last: people.lastName, staffId: visits.staffId, serviceCode: visits.serviceCode, start: visits.clockInAt, end: visits.clockOutAt,
      sharedCare: sql<boolean>`coalesce((select bool_or(${evvVisits.sharedCare}) from ${evvVisits} where ${evvVisits.visitId} = ${visits.id} and ${evvVisits.status} <> 'voided'), false)` })
      .from(visits).innerJoin(people, eq(visits.personId, people.id))
      .where(and(eq(visits.status, "completed"), lt(visits.clockInAt, hi), gt(visits.clockOutAt, lo))),
  ]);
  dxRows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  const dx = new Map<string, string[]>();
  for (const r of dxRows) (dx.get(r.personId) ?? dx.set(r.personId, []).get(r.personId)!).push(r.icdCode);
  const coverage = new Map<string, Coverage[]>();
  for (const c of covRows) {
    (coverage.get(c.personId) ?? coverage.set(c.personId, []).get(c.personId)!).push({
      id: c.id, payerId: c.payerId, payerName: c.payer, waiver: c.waiver, memberId: c.memberId, priority: c.priority, startDate: c.startDate, endDate: c.endDate, relationshipToSubscriber: c.relationshipToSubscriber,
    });
  }

  const evvByVisit = new Map(evvRows.filter((e) => e.visitId).map((e) => [e.visitId!, e]));
  const evv = new Map<string, EvvFacts>();
  for (const r of rows) {
    const e = evvByVisit.get(r.visitId);
    // The EVV visit's own flag decides; with no EVV visit, the DHS rule for the code does.
    const required = e ? e.evvRequired : !!ruleFor(ruleRows, r.serviceCode, r.modifiers, centralDate(r.clockInAt))?.requiresEvv;
    evv.set(r.visitId, e
      ? { required, recorded: true, compliance: e.compliance, submission: e.submission, openExceptions: Number(e.open), evvVisitId: e.id }
      : { ...NO_EVV, required });
  }
  const overlaps = findOverlaps(spanRows.map((v) => ({ visitId: v.visitId, personId: v.personId, personName: `${v.first} ${v.last}`, staffId: v.staffId, serviceCode: v.serviceCode, start: v.start, end: v.end, sharedCare: Boolean(v.sharedCare) })));

  return {
    dx, coverage, evv, overlaps,
    used: new Map(usedRows.map((r) => [r.agreementId, Number(r.units)])),
    live: new Map(liveRows.map((r) => [r.visitId, { id: r.id, status: r.status }])),
    defaultPayerId: payerRows.find((p) => p.isDefault)?.id ?? null,
    evvAggregator: new Map(payerRows.map((p) => [p.id, profileOrNull(p.profileKey, p.profileVersion)?.evvAggregatorRecord ?? "warn"])),
    holdNoncompliant: policy?.hold ?? false,
  };
}

const profileOrNull = (key: string, version: string) => { try { return payerProfile(key, version); } catch { return null; } };

interface Evaluated { row: Row; date: string; checks: Check[]; coverage: Coverage | null; payerId: string | null; claim: { id: string; status: string } | null }

/**
 * Adds, ahead of `rows`, every earlier note on the same authorizations that holds no units yet, so
 * units are counted in date order whether the screen shows one pay period or a biller approves a
 * handful of notes. The added rows are evaluated but never returned or approved.
 */
async function withEarlier(db: Executor, rows: Row[]): Promise<{ all: Row[]; earlier: Set<string> }> {
  if (!rows.length) return { all: rows, earlier: new Set() };
  const latest = new Date(Math.max(...rows.map((r) => +r.clockInAt)));
  const found = await db.select({ id: visits.id }).from(visits).where(and(
    eq(visits.status, "completed"),
    inArray(visits.serviceAgreementId, [...new Set(rows.map((r) => r.agreementId))]),
    notInArray(visits.id, rows.map((r) => r.visitId)),
    lt(visits.clockInAt, latest),
    sql`not exists (select 1 from ${authorizationUnits} au where au.visit_id = ${visits.id} and au.state <> 'released')`,
  ));
  if (!found.length) return { all: rows, earlier: new Set() };
  const extra = await loadRows(db, { visitIds: found.map((f) => f.id) });
  return { all: [...extra, ...rows].sort((a, b) => +a.clockInAt - +b.clockInAt), earlier: new Set(extra.map((r) => r.visitId)) };
}

/**
 * Runs the readiness rules over rows in date order. Units are counted cumulatively per
 * authorization: billed and reserved units first, then each earlier note that is itself ready.
 * A held note consumes nothing, so of two notes that together overrun it, the later one is held.
 * Rows in `earlier` take part in the count and are dropped from the result.
 */
function evaluate(rows: Row[], ctx: Context, earlier: Set<string> = new Set()): Evaluated[] {
  const used = new Map(ctx.used);
  const fromEarlier = new Map<string, number>();
  const out: Evaluated[] = [];
  for (const r of rows) {
    const date = centralDate(r.clockInAt);
    const claim = ctx.live.get(r.visitId) ?? null;
    const coverage = coverageFor(date, ctx.coverage.get(r.personId) ?? []);
    const payerId = resolvePayer(coverage, ctx.defaultPayerId);
    if (claim) { if (!earlier.has(r.visitId)) out.push({ row: r, date, checks: [], coverage, payerId, claim }); continue; }
    const checks = readiness({
      date, personId: r.personId, visitId: r.visitId, staffId: r.staffId, renderingId: r.renderingId, returnedAt: r.returnedAt,
      units: r.units, staffSignedAt: r.staffSignedAt, clientSignedAt: r.clientSignedAt, manualEntry: r.manualEntry, manualEvidenceAt: r.manualEvidenceAt,
      pmi: r.pmi, address: { address1: r.address1, city: r.city, zip: r.zip }, diagnoses: ctx.dx.get(r.personId) ?? [], coverage, payerId,
      serviceCode: r.serviceCode, modifiers: r.modifiers,
      agreement: { status: r.agStatus, startDate: r.agStart, endDate: r.agEnd, serviceCode: r.agCode, modifiers: r.agModifiers, authorizedUnits: r.agUnits, archivedAt: r.agArchivedAt },
      unitsUsed: used.get(r.agreementId) ?? 0, unitsPendingEarlier: fromEarlier.get(r.agreementId) ?? 0,
      evv: ctx.evv.get(r.visitId) ?? NO_EVV,
      evvPolicy: { aggregator: (payerId && ctx.evvAggregator.get(payerId)) || "warn", holdNoncompliant: ctx.holdNoncompliant },
      overlaps: ctx.overlaps.get(r.visitId) ?? { caregiver: [], service: [] },
    });
    if (!blocking(checks).length) {
      used.set(r.agreementId, (used.get(r.agreementId) ?? 0) + r.units);
      if (earlier.has(r.visitId)) fromEarlier.set(r.agreementId, (fromEarlier.get(r.agreementId) ?? 0) + r.units);
    }
    if (!earlier.has(r.visitId)) out.push({ row: r, date, checks, coverage, payerId, claim });
  }
  return out;
}

/** Every completed note in the range with its billing state. */
export async function billableLines(db: Executor, orgId: string, from: Date, to: Date): Promise<BillableLine[]> {
  const { all, earlier } = await withEarlier(db, await loadRows(db, { from, to }));
  const ctx = await loadContext(db, orgId, all);
  return evaluate(all, ctx, earlier).map(({ row: r, date, checks, payerId, claim }) => {
    const rate = toCents(r.unitRate);
    const holds = blocking(checks).map((c) => c.message);
    return {
      visitId: r.visitId, personId: r.personId, personName: `${r.personFirst} ${r.personLast}`, agreementId: r.agreementId,
      serviceCode: r.serviceCode, modifiers: r.modifiers, units: r.units, rateCents: rate, amountCents: lineCents(r.units, rate),
      date, staffName: `${r.staffFirst} ${r.staffLast}`, payerId, locked: !!r.lockedAt,
      state: claim ? "claimed" : holds.length ? "hold" : "ready", holds, warnings: warnings(checks), checks, claim, evv: ctx.evv.get(r.visitId) ?? NO_EVV,
    };
  });
}

function providerFrom(p: typeof billingProviders.$inferSelect): BillingProvider {
  return { name: p.legalName, taxId: p.taxId, npi: p.npi, umpi: p.umpi, address1: p.address1, city: p.city, state: p.state, zip: p.zip, phone: p.phone };
}

interface Built { claimId: string; personId: string; agreementId: string; payerId: string; coverage: Coverage; rateCents: Cents; input: ClaimInput; rows: Row[] }

function group(items: Evaluated[], dx: Map<string, string[]>, filingIndicator: string): Built[] {
  const by = new Map<string, Evaluated[]>();
  for (const e of items) {
    const k = `${e.row.personId}|${e.row.agreementId}|${e.payerId}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(e);
  }
  return [...by.values()].map((es) => {
    const claimId = randomUUID();
    const f = es[0].row;
    const rateCents = toCents(f.unitRate);
    return {
      claimId, personId: f.personId, agreementId: f.agreementId, payerId: es[0].payerId!, coverage: es[0].coverage!, rateCents, rows: es.map((e) => e.row),
      input: {
        patientControlNumber: `EV${claimId.replace(/-/g, "").slice(0, 18).toUpperCase()}`,
        patient: { firstName: f.personFirst, lastName: f.personLast, dob: f.dob, sex: f.sex, pmi: f.pmi, address1: f.address1, address2: f.address2, city: f.city, state: f.state, zip: f.zip },
        priorAuth: f.agreementNumber,
        diagnoses: dx.get(f.personId) ?? [],
        placeOfService: f.placeOfService,
        frequencyCode: "1",
        claimFilingIndicator: filingIndicator,
        lines: es.map(({ row: v, date }) => ({
          ref: v.visitId, serviceCode: v.serviceCode, modifiers: v.modifiers, units: v.units, amountCents: lineCents(v.units, toCents(v.unitRate)), date,
          rendering: { type: v.renderingIdType, id: v.renderingId, firstName: v.staffFirst, lastName: v.staffLast },
        })),
      },
    };
  });
}

export type RunResult =
  | { ok: true; batchId: string; claims: number; lines: number; totalCents: Cents; method: "clearinghouse" | "download"; message?: string }
  | { ok: false; problems: string[] };

const uniqueViolation = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x?.code === "23505" || x?.cause?.code === "23505";
};

/**
 * Approves the chosen notes into claims and either sends the 837P through the clearinghouse or
 * records it as downloaded for a manual upload. Notes that are held or already on a live claim are
 * skipped. A clearinghouse that is not ready refuses before anything is written; a send that fails
 * after approval is undone (claims voided, units released, notes unlocked) and the attempt is kept.
 */
export async function runClaims(db: Db, opts: { orgId: string; actor: Actor; adapter: ClearinghouseAdapter; visitIds: string[]; method: "clearinghouse" | "download"; now?: Date }): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const cfg = opts.adapter.config;
  if (opts.method === "clearinghouse") {
    const h = opts.adapter.health();
    if (!h.ok) return { ok: false, problems: h.problems };
  }
  await ensureBillingDefaults(db, opts.orgId, opts.actor);

  let approved: { batchId: string; file: string; controlNumber: number; built: Built[] };
  try {
    approved = await db.transaction(async (tx) => {
      const ids = [...new Set(opts.visitIds)];
      let rows = await loadRows(tx, { visitIds: ids });
      // Serialise approvals that draw on the same authorizations, then read again under the lock.
      const agreementIds = [...new Set(rows.map((r) => r.agreementId))];
      if (agreementIds.length) await tx.select({ id: serviceAgreements.id }).from(serviceAgreements).where(inArray(serviceAgreements.id, agreementIds)).for("update");
      rows = await loadRows(tx, { visitIds: ids });
      const { all, earlier } = await withEarlier(tx, rows);
      const ctx = await loadContext(tx, opts.orgId, all);
      const eligible = evaluate(all, ctx, earlier).filter((e) => !e.claim && !blocking(e.checks).length);
      if (!eligible.length) throw new Refusal(["None of the chosen notes are ready to bill."]);

      const [providerRow] = await tx.select().from(billingProviders).where(eq(billingProviders.organizationId, opts.orgId));
      const payerIds = [...new Set(eligible.map((e) => e.payerId!))];
      const payerRows = await tx.select().from(payers).where(and(eq(payers.organizationId, opts.orgId), inArray(payers.id, payerIds)));
      if (payerRows.length !== 1) throw new Refusal(payerRows.length ? ["These notes bill different payers. Send one payer at a time."] : ["The payer for these notes is not set up."]);
      const payerRow = payerRows[0];
      const profile = payerProfile(payerRow.profileKey, payerRow.profileVersion);
      const provider = providerFrom(providerRow);
      // The clearinghouse's payer ID is never guessed: the payer row's, else the configured one.
      const payer: Payer = { name: payerRow.name, id: payerRow.clearinghousePayerId ?? cfg.payerId };
      const problems = fileProblems(provider, payer, { senderId: cfg.submitterId, receiverId: cfg.receiverId });
      const built = group(eligible, ctx.dx, profile.claimFilingIndicator);
      for (const b of built) for (const p of claimProblems(b.input)) problems.push(`${b.input.patient.firstName} ${b.input.patient.lastName}: ${p}`);
      if (problems.length) throw new Refusal(problems);

      const [{ last }] = await tx.select({ last: max(claimBatches.controlNumber) }).from(claimBatches).where(eq(claimBatches.organizationId, opts.orgId));
      const controlNumber = (last ?? 0) + 1;
      const envelope = { senderId: cfg.submitterId, receiverId: cfg.receiverId, receiverName: cfg.receiverName, controlNumber, usage: cfg.usage, now };
      const file = build837P(provider, payer, envelope, built.map((b) => b.input));
      const notes = await lockNotes(tx, opts.actor, eligible.map((e) => e.row.visitId), "Approved for billing", now);

      const a = audited(tx, opts.actor);
      const allLines = built.flatMap((b) => b.input.lines);
      const totalCents = sumCents(allLines.map((l) => l.amountCents));
      const batch = await a.insert(claimBatches, {
        organizationId: opts.orgId, method: opts.method, clearinghouse: opts.adapter.key, controlNumber, usage: cfg.usage, fileText: file,
        claimCount: built.length, lineCount: allLines.length, total: centsToDecimal(totalCents), sentBy: opts.actor.userId,
      });
      for (const b of built) {
        const claimCents = sumCents(b.input.lines.map((l) => l.amountCents));
        await a.insert(claims, { id: b.claimId, organizationId: opts.orgId, batchId: batch.id, personId: b.personId, serviceAgreementId: b.agreementId, payerId: b.payerId, patientControlNumber: b.input.patientControlNumber, total: centsToDecimal(claimCents), status: "sent", statusAt: now });
        const f = b.rows[0];
        const snapshot = {
          profile: { key: profile.key, version: profile.version, verified: profile.verified },
          provider, payer: { id: payerRow.id, name: payerRow.name, clearinghousePayerId: payer.id },
          envelope: { controlNumber, usage: cfg.usage, senderId: cfg.submitterId, receiverId: cfg.receiverId, receiverName: cfg.receiverName, builtAt: now.toISOString() },
          coverage: b.coverage,
          agreement: { id: b.agreementId, number: f.agreementNumber, serviceCode: f.agCode, modifiers: f.agModifiers, authorizedUnits: f.agUnits, rateCents: b.rateCents, startDate: f.agStart, endDate: f.agEnd },
          diagnoses: b.input.diagnoses.slice(0, 12).map((code, i) => ({ code, pointer: i + 1 })),
          claim: b.input,
          notes: b.rows.map((r) => notes.get(r.visitId)!),
        };
        const version = await a.insert(claimVersions, {
          organizationId: opts.orgId, claimId: b.claimId, versionNo: 1, frequencyCode: "1", payerId: b.payerId,
          profileKey: profile.key, profileVersion: profile.version, snapshot, snapshotHash: sha256(canonical(snapshot)), totalCents: claimCents, createdBy: opts.actor.userId,
        });
        await a.update(claims, b.claimId, { currentVersionId: version.id });
        for (const [i, l] of b.input.lines.entries()) {
          await a.insert(claimLines, { claimId: b.claimId, claimVersionId: version.id, visitId: l.ref, lineNumber: i + 1, serviceCode: l.serviceCode, modifiers: l.modifiers, units: l.units, amount: centsToDecimal(l.amountCents), serviceDate: l.date });
          // A download is handed over now; a clearinghouse send moves to billed once it is delivered.
          await a.insert(authorizationUnits, { organizationId: opts.orgId, serviceAgreementId: b.agreementId, visitId: l.ref, claimVersionId: version.id, units: l.units, state: opts.method === "download" ? "billed" : "reserved" });
        }
      }
      return { batchId: batch.id, file, controlNumber, built };
    });
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, problems: e.problems };
    if (uniqueViolation(e)) return { ok: false, problems: ["Some of these notes were approved by someone else a moment ago. Refresh and try again."] };
    throw e;
  }

  const lines = approved.built.reduce((n, b) => n + b.input.lines.length, 0);
  const totalCents = sumCents(approved.built.flatMap((b) => b.input.lines.map((l) => l.amountCents)));
  if (opts.method === "download") return { ok: true, batchId: approved.batchId, claims: approved.built.length, lines, totalCents, method: "download" };

  const outcome = await opts.adapter.submit(approved.file, { controlNumber: approved.controlNumber, claimCount: approved.built.length }).catch((e: unknown) => ({ status: "failed" as const, message: e instanceof Error ? e.message : "Send failed" }));
  if (outcome.status !== "sent") {
    const why = outcome.status === "blocked" ? outcome.problems : [outcome.message];
    await undoApproval(db, opts.orgId, opts.actor, approved.batchId, `Not delivered: ${why.join("; ")}`, now);
    return { ok: false, problems: why };
  }
  await db.transaction(async (tx) => {
    const a = audited(tx, opts.actor);
    await a.update(claimBatches, approved.batchId, { externalId: outcome.externalId, message: outcome.message ?? null });
    const versionIds = (await tx.select({ id: claimVersions.id }).from(claimVersions).innerJoin(claims, eq(claimVersions.claimId, claims.id)).where(eq(claims.batchId, approved.batchId))).map((v) => v.id);
    await setUnits(tx, opts.actor, opts.orgId, versionIds, "billed");
  });
  return { ok: true, batchId: approved.batchId, claims: approved.built.length, lines, totalCents, method: "clearinghouse", message: outcome.message };
}

async function setUnits(tx: Executor, actor: Actor, orgId: string, versionIds: string[], state: "billed" | "released") {
  if (!versionIds.length) return;
  const rows = await tx.select({ id: authorizationUnits.id }).from(authorizationUnits)
    .where(and(eq(authorizationUnits.organizationId, orgId), inArray(authorizationUnits.claimVersionId, versionIds), ne(authorizationUnits.state, "released")));
  const a = audited(tx, actor);
  for (const r of rows) await a.update(authorizationUnits, r.id, { state });
}

/** Voids a batch's claims, releases their units and unlocks their notes. */
async function undoApproval(db: Db, orgId: string, actor: Actor, batchId: string, message: string, now: Date) {
  await db.transaction(async (tx) => {
    const a = audited(tx, actor);
    const rows = await tx.select({ id: claims.id, status: claims.status }).from(claims).where(and(eq(claims.organizationId, orgId), eq(claims.batchId, batchId)));
    const claimIds = rows.map((c) => c.id);
    for (const c of rows) if (c.status !== "void") await a.update(claims, c.id, { status: "void", statusAt: now, statusMessage: message });
    const versionIds = claimIds.length ? (await tx.select({ id: claimVersions.id }).from(claimVersions).where(inArray(claimVersions.claimId, claimIds))).map((v) => v.id) : [];
    await setUnits(tx, actor, orgId, versionIds, "released");
    const visitIds = claimIds.length ? (await tx.select({ visitId: claimLines.visitId }).from(claimLines).where(inArray(claimLines.claimId, claimIds))).map((l) => l.visitId) : [];
    await unlockNotes(tx, actor, visitIds);
    await a.update(claimBatches, batchId, { voidedAt: now, voidedBy: actor.userId, message });
  });
}

/**
 * Takes a batch back: its claims become void, their units are released and their notes return to
 * "Ready to send". For a file that was downloaded but never uploaded, or uploaded and withdrawn.
 * A paid claim cannot be taken back; it needs a void claim to the payer instead.
 */
export async function voidBatch(db: Db, orgId: string, actor: Actor, batchId: string, now = new Date()): Promise<{ ok: boolean; message?: string }> {
  const [batch] = await db.select({ id: claimBatches.id, voidedAt: claimBatches.voidedAt }).from(claimBatches).where(and(eq(claimBatches.id, batchId), eq(claimBatches.organizationId, orgId)));
  if (!batch) return { ok: false, message: "That file was not found." };
  if (batch.voidedAt) return { ok: false, message: "That file was already taken back." };
  const rows = await db.select({ status: claims.status }).from(claims).where(and(eq(claims.organizationId, orgId), eq(claims.batchId, batchId)));
  if (rows.some((c) => c.status === "paid")) return { ok: false, message: "A claim in this file has been paid. Void it with the payer instead." };
  await undoApproval(db, orgId, actor, batchId, "Taken back in EVVora", now);
  return { ok: true };
}

/**
 * Reads acknowledgments and remittances from the clearinghouse and moves claims along. Only claims
 * of this organisation, sent through this adapter, are matched, by exact patient control number.
 * A rejected or denied claim releases its units; its notes stay locked (fixes are addenda).
 */
export async function pollClaimStatus(db: Db, orgId: string, actor: Actor, adapter: ClearinghouseAdapter, now = new Date()): Promise<{ updated: number }> {
  const open = await db.select({ id: claims.id, patientControlNumber: claims.patientControlNumber, status: claims.status }).from(claims)
    .innerJoin(claimBatches, eq(claims.batchId, claimBatches.id))
    .where(and(eq(claims.organizationId, orgId), inArray(claims.status, ["sent", "accepted"]), eq(claimBatches.method, "clearinghouse"), eq(claimBatches.clearinghouse, adapter.key)));
  if (!open.length) return { updated: 0 };
  const updates: ClaimStatusUpdate[] = await adapter.statusUpdates(open);
  const byPcn = new Map(open.map((c) => [c.patientControlNumber, c]));
  let updated = 0;
  for (const u of updates) {
    const c = byPcn.get(u.patientControlNumber);
    if (!c || c.status === u.status) continue;
    await db.transaction(async (tx) => {
      await audited(tx, actor).update(claims, c.id, {
        status: u.status, statusAt: now, statusMessage: u.message ?? null,
        ...(u.payerClaimNumber ? { payerClaimNumber: u.payerClaimNumber } : {}),
        ...(u.paidCents != null ? { paidAmount: centsToDecimal(u.paidCents) } : {}),
      });
      if (u.status === "rejected" || u.status === "denied") {
        const versionIds = (await tx.select({ id: claimVersions.id }).from(claimVersions).where(eq(claimVersions.claimId, c.id))).map((v) => v.id);
        await setUnits(tx, actor, orgId, versionIds, "released");
      }
    });
    c.status = u.status;
    updated += 1;
  }
  return { updated };
}

/**
 * Prepares a replacement (frequency 7) or void (frequency 8) version of an adjudicated claim, linked
 * to the version it replaces and carrying the payer's claim number. It is recorded, not sent:
 * sending corrections arrives with the claim lifecycle (Phase 4).
 */
export async function prepareCorrection(db: Db, opts: { orgId: string; actor: Actor; claimId: string; kind: "replace" | "void" }): Promise<{ ok: true; versionId: string } | { ok: false; message: string }> {
  const [c] = await db.select().from(claims).where(and(eq(claims.id, opts.claimId), eq(claims.organizationId, opts.orgId)));
  if (!c || !c.currentVersionId) return { ok: false, message: "That claim was not found." };
  if (!["accepted", "paid", "denied"].includes(c.status)) return { ok: false, message: "Only a claim the payer has accepted, paid or denied can be replaced or voided." };
  if (!c.payerClaimNumber) return { ok: false, message: "The payer's claim number is not on file yet, and a replacement or void must cite it." };
  const [current] = await db.select().from(claimVersions).where(eq(claimVersions.id, c.currentVersionId));
  const frequency = opts.kind === "replace" ? "7" : "8";
  const profile = payerProfile(current.profileKey, current.profileVersion);
  if (!profile.frequencyCodes.includes(frequency)) return { ok: false, message: `${profile.name} does not take frequency ${frequency} claims.` };
  const prior = current.snapshot as { claim: ClaimInput } & Record<string, unknown>;
  const snapshot = { ...prior, claim: { ...prior.claim, frequencyCode: frequency, originalClaimNumber: c.payerClaimNumber }, replaces: { versionId: current.id, payerClaimNumber: c.payerClaimNumber } };
  const [{ last }] = await db.select({ last: max(claimVersions.versionNo) }).from(claimVersions).where(eq(claimVersions.claimId, c.id));
  const v = await audited(db, opts.actor).insert(claimVersions, {
    organizationId: opts.orgId, claimId: c.id, versionNo: (last ?? 1) + 1, frequencyCode: frequency, replacesVersionId: current.id, payerId: current.payerId,
    profileKey: current.profileKey, profileVersion: current.profileVersion, snapshot, snapshotHash: sha256(canonical(snapshot)), totalCents: current.totalCents, createdBy: opts.actor.userId,
  });
  return { ok: true, versionId: v.id };
}

export interface SentClaim {
  id: string; batchId: string; personId: string; personName: string; totalCents: Cents; status: string; statusMessage: string | null; statusAt: Date | null;
  method: "clearinghouse" | "download"; clearinghouse: string; controlNumber: number; sentAt: Date; lines: number; firstDate: string; lastDate: string;
}

/** This organisation's claims whose service dates fall in the range, newest file first. Void ones are left out. */
export async function sentClaims(db: Executor, orgId: string, fromDate: string, toDate: string): Promise<SentClaim[]> {
  const rows = await db
    .select({
      id: claims.id, batchId: claims.batchId, personId: claims.personId, first: people.firstName, last: people.lastName, total: claims.total, status: claims.status, statusMessage: claims.statusMessage, statusAt: claims.statusAt,
      method: claimBatches.method, clearinghouse: claimBatches.clearinghouse, controlNumber: claimBatches.controlNumber, sentAt: claimBatches.createdAt, serviceDate: claimLines.serviceDate,
    })
    .from(claims)
    .innerJoin(claimBatches, eq(claims.batchId, claimBatches.id))
    .innerJoin(people, eq(claims.personId, people.id))
    .innerJoin(claimLines, eq(claimLines.claimId, claims.id))
    .where(and(eq(claims.organizationId, orgId), notInArray(claims.status, ["void"]), gte(claimLines.serviceDate, fromDate), lte(claimLines.serviceDate, toDate)))
    .orderBy(desc(claimBatches.createdAt));
  const out = new Map<string, SentClaim>();
  for (const r of rows) {
    const c = out.get(r.id);
    if (c) { c.lines += 1; if (r.serviceDate < c.firstDate) c.firstDate = r.serviceDate; if (r.serviceDate > c.lastDate) c.lastDate = r.serviceDate; continue; }
    out.set(r.id, { id: r.id, batchId: r.batchId, personId: r.personId, personName: `${r.first} ${r.last}`, totalCents: toCents(r.total), status: r.status, statusMessage: r.statusMessage, statusAt: r.statusAt, method: r.method, clearinghouse: r.clearinghouse, controlNumber: r.controlNumber, sentAt: r.sentAt, lines: 1, firstDate: r.serviceDate, lastDate: r.serviceDate });
  }
  return [...out.values()];
}

export interface AuthorizationSummary {
  agreementId: string;
  agreementNumber: string;
  personId: string;
  personName: string;
  serviceCode: string;
  modifiers: string[];
  status: string;
  startDate: string;
  endDate: string;
  authorized: number;
  billed: number;
  reserved: number;
  /** Units on notes in view that are ready, and that are held. */
  readyInView: number;
  heldInView: number;
  /** Authorized minus billed and reserved. */
  left: number;
  flags: { tone: "danger" | "warn"; message: string }[];
}

/**
 * Units on each authorization the lines in view draw on: billed, reserved, ready and held, what is
 * left, and whether it is ending or nearly used. `today` is a Central date (YYYY-MM-DD).
 */
export async function authorizationSummaries(db: Executor, orgId: string, lines: BillableLine[], today: string): Promise<AuthorizationSummary[]> {
  const ids = [...new Set(lines.map((l) => l.agreementId))];
  if (!ids.length) return [];
  const [ags, units] = await Promise.all([
    db.select({ ag: serviceAgreements, first: people.firstName, last: people.lastName }).from(serviceAgreements).innerJoin(people, eq(serviceAgreements.personId, people.id)).where(inArray(serviceAgreements.id, ids)),
    db.select({ agreementId: authorizationUnits.serviceAgreementId, state: authorizationUnits.state, units: sql<number>`coalesce(sum(${authorizationUnits.units}), 0)::int` }).from(authorizationUnits)
      .where(and(eq(authorizationUnits.organizationId, orgId), inArray(authorizationUnits.serviceAgreementId, ids), ne(authorizationUnits.state, "released")))
      .groupBy(authorizationUnits.serviceAgreementId, authorizationUnits.state),
  ]);
  const plus30 = new Date(`${today}T12:00:00Z`);
  plus30.setUTCDate(plus30.getUTCDate() + 30);
  const soon = plus30.toISOString().slice(0, 10);
  return ags.map(({ ag, first, last }) => {
    const sumState = (st: string) => units.filter((u) => u.agreementId === ag.id && u.state === st).reduce((n, u) => n + Number(u.units), 0);
    const mine = lines.filter((l) => l.agreementId === ag.id);
    const billed = sumState("billed"), reserved = sumState("reserved");
    const left = ag.authorizedUnits - billed - reserved;
    const readyInView = mine.filter((l) => l.state === "ready").reduce((n, l) => n + l.units, 0);
    const heldInView = mine.filter((l) => l.state === "hold").reduce((n, l) => n + l.units, 0);
    const flags: AuthorizationSummary["flags"] = [];
    if (ag.archivedAt || ag.status !== "active") flags.push({ tone: "danger", message: `Authorization is ${ag.archivedAt ? "archived" : ag.status}` });
    else if (ag.endDate < today) flags.push({ tone: "danger", message: `Ended ${ag.endDate}` });
    else if (ag.endDate <= soon) flags.push({ tone: "warn", message: `Ends ${ag.endDate}` });
    if (left <= 0) flags.push({ tone: "danger", message: "No units left" });
    else if (readyInView > left) flags.push({ tone: "danger", message: `Ready notes need ${readyInView} units; ${left} left` });
    else if ((billed + reserved + readyInView) / ag.authorizedUnits >= 0.75) flags.push({ tone: "warn", message: `${Math.round(((billed + reserved + readyInView) / ag.authorizedUnits) * 100)}% used with the ready notes` });
    return {
      agreementId: ag.id, agreementNumber: ag.agreementNumber, personId: ag.personId, personName: `${first} ${last}`, serviceCode: ag.serviceCode, modifiers: ag.modifiers,
      status: ag.archivedAt ? "archived" : ag.status, startDate: ag.startDate, endDate: ag.endDate, authorized: ag.authorizedUnits, billed, reserved, readyInView, heldInView, left, flags,
    };
  }).sort((a, b) => b.flags.length - a.flags.length || a.endDate.localeCompare(b.endDate));
}

/** Agency-level readiness for the billing screen: provider identifiers and the payer's routing. */
export async function billingSetup(db: Executor, orgId: string): Promise<Check[]> {
  const [[provider], [payer]] = await Promise.all([
    db.select().from(billingProviders).where(eq(billingProviders.organizationId, orgId)),
    db.select().from(payers).where(and(eq(payers.organizationId, orgId), eq(payers.isDefault, true), eq(payers.active, true))),
  ]);
  return setupReadiness({
    provider: provider ?? null,
    payer: payer ? { name: payer.name, clearinghousePayerId: payer.clearinghousePayerId, profileVerified: profileOrNull(payer.profileKey, payer.profileVersion)?.verified ?? false } : null,
  });
}
