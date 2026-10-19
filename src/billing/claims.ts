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
import { and, desc, eq, gte, inArray, isNull, lte, max, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { audited, type Actor, type Executor } from "@/db/audited";
import {
  authorizationUnits, billingProviders, claimBatches, claimLines, claimVersions, claims, clientDiagnoses, clientFundingSources,
  organizations, payers, people, serviceAgreements, staff, visits,
} from "@/db/schema";
import { build837P, claimProblems, fileProblems, type BillingProvider, type ClaimInput, type Payer } from "./x12-837p";
import type { ClaimStatusUpdate, ClearinghouseAdapter } from "./clearinghouse";
import { centsToDecimal, lineCents, sumCents, toCents, type Cents } from "./money";
import { canonical, LIVE_CLAIM, lockNotes, sha256, unlockNotes } from "./notes";
import { DEFAULT_PROFILE, payerProfile } from "./profiles";
import { blocking, coverageFor, readiness, resolvePayer, type Check, type Coverage } from "./readiness";

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
      visitId: visits.id, personId: people.id, personFirst: people.firstName, personLast: people.lastName, dob: people.dob, sex: people.sexAtBirth, pmi: visits.pmi,
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
  }
  let [payer] = await db.select().from(payers).where(and(eq(payers.organizationId, orgId), eq(payers.key, DEFAULT_PROFILE.key)));
  if (!payer) {
    payer = await a.insert(payers, {
      organizationId: orgId, key: DEFAULT_PROFILE.key, name: DEFAULT_PROFILE.name, kind: DEFAULT_PROFILE.kind,
      profileKey: DEFAULT_PROFILE.key, profileVersion: DEFAULT_PROFILE.version, isDefault: true,
    });
  }
  return { provider, defaultPayer: payer };
}

interface Context {
  dx: Map<string, string[]>;
  coverage: Map<string, Coverage[]>;
  used: Map<string, number>;
  live: Map<string, { id: string; status: string }>;
  defaultPayerId: string | null;
}

async function loadContext(db: Executor, orgId: string, rows: Row[]): Promise<Context> {
  const personIds = [...new Set(rows.map((r) => r.personId))];
  const agreementIds = [...new Set(rows.map((r) => r.agreementId))];
  const visitIds = rows.map((r) => r.visitId);
  const none = [randomUUID()];
  const [dxRows, covRows, usedRows, liveRows, [defaultPayer]] = await Promise.all([
    db.select().from(clientDiagnoses).where(and(inArray(clientDiagnoses.personId, personIds.length ? personIds : none), isNull(clientDiagnoses.archivedAt))),
    db.select().from(clientFundingSources).where(inArray(clientFundingSources.personId, personIds.length ? personIds : none)),
    db.select({ agreementId: authorizationUnits.serviceAgreementId, units: sql<number>`coalesce(sum(${authorizationUnits.units}), 0)::int` }).from(authorizationUnits)
      .where(and(eq(authorizationUnits.organizationId, orgId), inArray(authorizationUnits.serviceAgreementId, agreementIds.length ? agreementIds : none), ne(authorizationUnits.state, "released")))
      .groupBy(authorizationUnits.serviceAgreementId),
    db.select({ visitId: claimLines.visitId, id: claims.id, status: claims.status }).from(claimLines).innerJoin(claims, eq(claimLines.claimId, claims.id))
      .where(and(eq(claims.organizationId, orgId), inArray(claimLines.visitId, visitIds.length ? visitIds : none), inArray(claims.status, [...LIVE_CLAIM]))),
    db.select({ id: payers.id }).from(payers).where(and(eq(payers.organizationId, orgId), eq(payers.isDefault, true), eq(payers.active, true))),
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
  return {
    dx, coverage,
    used: new Map(usedRows.map((r) => [r.agreementId, Number(r.units)])),
    live: new Map(liveRows.map((r) => [r.visitId, { id: r.id, status: r.status }])),
    defaultPayerId: defaultPayer?.id ?? null,
  };
}

interface Evaluated { row: Row; date: string; checks: Check[]; coverage: Coverage | null; payerId: string | null; claim: { id: string; status: string } | null }

/**
 * Runs the readiness rules over rows in date order. Units are counted cumulatively per
 * authorization, so of two notes that together overrun it, the later one is held.
 */
function evaluate(rows: Row[], ctx: Context): Evaluated[] {
  const used = new Map(ctx.used);
  return rows.map((r) => {
    const date = centralDate(r.clockInAt);
    const claim = ctx.live.get(r.visitId) ?? null;
    const coverage = coverageFor(date, ctx.coverage.get(r.personId) ?? []);
    const payerId = resolvePayer(coverage, ctx.defaultPayerId);
    if (claim) return { row: r, date, checks: [], coverage, payerId, claim };
    const checks = readiness({
      date, personId: r.personId, units: r.units, staffSignedAt: r.staffSignedAt, clientSignedAt: r.clientSignedAt, manualEntry: r.manualEntry, manualEvidenceAt: r.manualEvidenceAt,
      pmi: r.pmi, address: { address1: r.address1, city: r.city, zip: r.zip }, diagnoses: ctx.dx.get(r.personId) ?? [], coverage, payerId,
      serviceCode: r.serviceCode, modifiers: r.modifiers,
      agreement: { status: r.agStatus, startDate: r.agStart, endDate: r.agEnd, serviceCode: r.agCode, modifiers: r.agModifiers, authorizedUnits: r.agUnits, archivedAt: r.agArchivedAt },
      unitsUsed: used.get(r.agreementId) ?? 0,
    });
    if (!blocking(checks).length) used.set(r.agreementId, (used.get(r.agreementId) ?? 0) + r.units);
    return { row: r, date, checks, coverage, payerId, claim };
  });
}

/** Every completed note in the range with its billing state. */
export async function billableLines(db: Executor, orgId: string, from: Date, to: Date): Promise<BillableLine[]> {
  const rows = await loadRows(db, { from, to });
  const ctx = await loadContext(db, orgId, rows);
  return evaluate(rows, ctx).map(({ row: r, date, checks, payerId, claim }) => {
    const rate = toCents(r.unitRate);
    const holds = blocking(checks).map((c) => c.message);
    return {
      visitId: r.visitId, personId: r.personId, personName: `${r.personFirst} ${r.personLast}`, agreementId: r.agreementId,
      serviceCode: r.serviceCode, modifiers: r.modifiers, units: r.units, rateCents: rate, amountCents: lineCents(r.units, rate),
      date, staffName: `${r.staffFirst} ${r.staffLast}`, payerId, locked: !!r.lockedAt,
      state: claim ? "claimed" : holds.length ? "hold" : "ready", holds, checks, claim,
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
      const ctx = await loadContext(tx, opts.orgId, rows);
      const eligible = evaluate(rows, ctx).filter((e) => !e.claim && !blocking(e.checks).length);
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
