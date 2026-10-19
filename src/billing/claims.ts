/**
 * Claim run: which notes are ready to bill, grouping them into claims, building the 837P, handing it
 * to the clearinghouse (or to the office as a download for Waystar's portal), and recording what
 * went out. Takes a database so the tests run it against PGlite; every write goes through `audited`.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, max, notInArray } from "drizzle-orm";
import type { Db } from "@/db";
import { audited, type Actor } from "@/db/audited";
import { claimBatches, claimLines, claims, clientDiagnoses, organizations, people, serviceAgreements, staff, visits } from "@/db/schema";
import { build837P, claimProblems, fileProblems, type BillingProvider, type ClaimInput } from "./x12-837p";
import type { ClaimStatusUpdate, ClearinghouseAdapter } from "./clearinghouse";

/** Claim statuses that still hold the note: it must not be billed again while one exists. */
const LIVE = ["sent", "accepted", "paid"] as const;

export type LineState = "ready" | "hold" | "claimed";

export interface BillableLine {
  visitId: string;
  personId: string;
  personName: string;
  agreementId: string;
  serviceCode: string;
  modifiers: string[];
  units: number;
  unitRate: number;
  amount: number;
  /** Central date of service, YYYY-MM-DD. */
  date: string;
  staffName: string;
  state: LineState;
  /** Why it is held, when it is. */
  holds: string[];
  /** The live claim holding it, when claimed. */
  claim: { id: string; status: string } | null;
}

const centralDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

interface Row {
  visitId: string; personId: string; personFirst: string; personLast: string; dob: string; sex: string | null; pmi: string;
  address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null;
  agreementId: string; agreementNumber: string; serviceCode: string; modifiers: string[]; units: number; unitRate: string;
  placeOfService: string; renderingIdType: "npi" | "umpi"; renderingId: string; staffFirst: string; staffLast: string;
  clockInAt: Date; clientSignedAt: Date | null; staffSignedAt: Date | null; manualEntry: boolean; manualEvidenceAt: Date | null;
}

async function loadRows(db: Db, where: { from?: Date; to?: Date; visitIds?: string[] }): Promise<Row[]> {
  const conds = [eq(visits.status, "completed")];
  if (where.from) conds.push(gte(visits.clockInAt, where.from));
  if (where.to) conds.push(lte(visits.clockInAt, where.to));
  if (where.visitIds) conds.push(inArray(visits.id, where.visitIds.length ? where.visitIds : [randomUUID()]));
  return db
    .select({
      visitId: visits.id, personId: people.id, personFirst: people.firstName, personLast: people.lastName, dob: people.dob, sex: people.sexAtBirth, pmi: visits.pmi,
      address1: people.address1, address2: people.address2, city: people.city, state: people.state, zip: people.zip,
      agreementId: serviceAgreements.id, agreementNumber: serviceAgreements.agreementNumber, serviceCode: visits.serviceCode, modifiers: visits.modifiers, units: visits.units, unitRate: serviceAgreements.unitRate,
      placeOfService: visits.placeOfService, renderingIdType: visits.renderingIdType, renderingId: visits.renderingId, staffFirst: staff.firstName, staffLast: staff.lastName,
      clockInAt: visits.clockInAt, clientSignedAt: visits.clientSignedAt, staffSignedAt: visits.staffSignedAt, manualEntry: visits.manualEntry, manualEvidenceAt: visits.manualEvidenceAt,
    })
    .from(visits)
    .innerJoin(people, eq(visits.personId, people.id))
    .innerJoin(staff, eq(visits.staffId, staff.id))
    .innerJoin(serviceAgreements, eq(visits.serviceAgreementId, serviceAgreements.id))
    .where(and(...conds))
    .orderBy(visits.clockInAt) as Promise<Row[]>;
}

async function liveClaimsFor(db: Db, visitIds: string[]) {
  if (!visitIds.length) return new Map<string, { id: string; status: string }>();
  const rows = await db
    .select({ visitId: claimLines.visitId, id: claims.id, status: claims.status })
    .from(claimLines)
    .innerJoin(claims, eq(claimLines.claimId, claims.id))
    .where(and(inArray(claimLines.visitId, visitIds), inArray(claims.status, [...LIVE])));
  return new Map(rows.map((r) => [r.visitId, { id: r.id, status: r.status }]));
}

async function diagnosesFor(db: Db, personIds: string[]) {
  const out = new Map<string, string[]>();
  if (!personIds.length) return out;
  const rows = await db.select().from(clientDiagnoses).where(and(inArray(clientDiagnoses.personId, personIds), isNull(clientDiagnoses.archivedAt)));
  rows.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  for (const r of rows) (out.get(r.personId) ?? out.set(r.personId, []).get(r.personId)!).push(r.icdCode);
  return out;
}

function holdsFor(r: Row, diagnoses: string[] | undefined): string[] {
  const h: string[] = [];
  if (!r.staffSignedAt) h.push("Caregiver has not signed");
  if (!r.clientSignedAt) h.push("Not signed by client");
  if (r.manualEntry && !r.manualEvidenceAt) h.push("Manual entry: evidence not confirmed");
  if (r.units <= 0) h.push("No units");
  if (!diagnoses?.length) h.push("No diagnosis on the client's profile");
  if (!r.address1 || !r.city || !r.zip) h.push("Client's address is incomplete");
  return h;
}

/** Every completed note in the range with its billing state. */
export async function billableLines(db: Db, from: Date, to: Date): Promise<BillableLine[]> {
  const rows = await loadRows(db, { from, to });
  const [live, dx] = await Promise.all([liveClaimsFor(db, rows.map((r) => r.visitId)), diagnosesFor(db, [...new Set(rows.map((r) => r.personId))])]);
  return rows.map((r) => {
    const claim = live.get(r.visitId) ?? null;
    const holds = claim ? [] : holdsFor(r, dx.get(r.personId));
    const rate = Number(r.unitRate);
    return {
      visitId: r.visitId, personId: r.personId, personName: `${r.personFirst} ${r.personLast}`, agreementId: r.agreementId,
      serviceCode: r.serviceCode, modifiers: r.modifiers, units: r.units, unitRate: rate, amount: Math.round(r.units * rate * 100) / 100,
      date: centralDate(r.clockInAt), staffName: `${r.staffFirst} ${r.staffLast}`,
      state: claim ? "claimed" : holds.length ? "hold" : "ready", holds, claim,
    };
  });
}

function providerFrom(org: typeof organizations.$inferSelect): BillingProvider {
  return { name: org.name, taxId: org.taxId, npi: org.npi, umpi: org.umpi, address1: org.address1, city: org.city, state: org.state, zip: org.zip, phone: org.phone };
}

interface Built { claimId: string; input: ClaimInput; personId: string; agreementId: string; visits: Row[] }

function group(rows: Row[], dx: Map<string, string[]>): Built[] {
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.personId}|${r.agreementId}`;
    (by.get(k) ?? by.set(k, []).get(k)!).push(r);
  }
  return [...by.values()].map((vs) => {
    const claimId = randomUUID();
    const f = vs[0];
    return {
      claimId, personId: f.personId, agreementId: f.agreementId, visits: vs,
      input: {
        patientControlNumber: `EV${claimId.replace(/-/g, "").slice(0, 18).toUpperCase()}`,
        patient: { firstName: f.personFirst, lastName: f.personLast, dob: f.dob, sex: f.sex, pmi: f.pmi, address1: f.address1, address2: f.address2, city: f.city, state: f.state, zip: f.zip },
        priorAuth: f.agreementNumber,
        diagnoses: dx.get(f.personId) ?? [],
        placeOfService: f.placeOfService,
        lines: vs.map((v) => ({
          ref: v.visitId, serviceCode: v.serviceCode, modifiers: v.modifiers, units: v.units, amount: Math.round(v.units * Number(v.unitRate) * 100) / 100, date: centralDate(v.clockInAt),
          rendering: { type: v.renderingIdType, id: v.renderingId, firstName: v.staffFirst, lastName: v.staffLast },
        })),
      },
    };
  });
}

export type RunResult =
  | { ok: true; batchId: string; claims: number; lines: number; total: number; method: "clearinghouse" | "download"; message?: string }
  | { ok: false; problems: string[] };

/**
 * Builds one 837P from the chosen notes and either sends it through the clearinghouse or records it
 * as downloaded for a manual upload. Notes that are held or already on a live claim are skipped.
 * Nothing is written unless the file went out (or was handed over as a download).
 */
export async function runClaims(db: Db, opts: { orgId: string; actor: Actor; adapter: ClearinghouseAdapter; visitIds: string[]; method: "clearinghouse" | "download"; now?: Date }): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const rows = await loadRows(db, { visitIds: opts.visitIds });
  const [live, dx] = await Promise.all([liveClaimsFor(db, rows.map((r) => r.visitId)), diagnosesFor(db, [...new Set(rows.map((r) => r.personId))])]);
  const eligible = rows.filter((r) => !live.has(r.visitId) && holdsFor(r, dx.get(r.personId)).length === 0);
  if (!eligible.length) return { ok: false, problems: ["None of the chosen notes are ready to bill."] };

  const [org] = await db.select().from(organizations).where(eq(organizations.id, opts.orgId));
  if (!org) return { ok: false, problems: ["Organization is not configured."] };
  const provider = providerFrom(org);
  const cfg = opts.adapter.config;
  const payer = { name: cfg.payerName, id: cfg.payerId };
  const problems = fileProblems(provider, payer, { senderId: cfg.submitterId, receiverId: cfg.receiverId });
  const built = group(eligible, dx);
  for (const b of built) for (const p of claimProblems(b.input)) problems.push(`${b.input.patient.firstName} ${b.input.patient.lastName}: ${p}`);
  if (problems.length) return { ok: false, problems };

  const [{ last }] = await db.select({ last: max(claimBatches.controlNumber) }).from(claimBatches).where(eq(claimBatches.organizationId, opts.orgId));
  const controlNumber = (last ?? 0) + 1;
  const file = build837P(provider, payer, { senderId: cfg.submitterId, receiverId: cfg.receiverId, receiverName: cfg.receiverName, controlNumber, usage: cfg.usage, now }, built.map((b) => b.input));

  let externalId: string | null = null;
  let message: string | undefined;
  if (opts.method === "clearinghouse") {
    const outcome = await opts.adapter.submit(file, { controlNumber, claimCount: built.length });
    if (outcome.status === "blocked") return { ok: false, problems: outcome.problems };
    if (outcome.status === "failed") return { ok: false, problems: [outcome.message] };
    externalId = outcome.externalId;
    message = outcome.message;
  }

  const total = built.reduce((n, b) => n + b.input.lines.reduce((m, l) => m + l.amount, 0), 0);
  const lines = built.reduce((n, b) => n + b.input.lines.length, 0);
  const batchId = await db.transaction(async (tx) => {
    const a = audited(tx, opts.actor);
    const batch = await a.insert(claimBatches, {
      organizationId: opts.orgId, method: opts.method, clearinghouse: opts.adapter.key, controlNumber, usage: cfg.usage, fileText: file,
      claimCount: built.length, lineCount: lines, total: total.toFixed(2), externalId, message: message ?? null, sentBy: opts.actor.userId,
    });
    for (const b of built) {
      const claimTotal = b.input.lines.reduce((n, l) => n + l.amount, 0);
      await a.insert(claims, { id: b.claimId, organizationId: opts.orgId, batchId: batch.id, personId: b.personId, serviceAgreementId: b.agreementId, patientControlNumber: b.input.patientControlNumber, total: claimTotal.toFixed(2), status: "sent", statusAt: now });
      for (const [i, l] of b.input.lines.entries()) {
        await a.insert(claimLines, { claimId: b.claimId, visitId: l.ref, lineNumber: i + 1, serviceCode: l.serviceCode, modifiers: l.modifiers, units: l.units, amount: l.amount.toFixed(2), serviceDate: l.date });
      }
    }
    return batch.id;
  });
  return { ok: true, batchId, claims: built.length, lines, total, method: opts.method, message };
}

/**
 * Takes a batch back: its claims become void and its notes return to "Ready to send". For a file
 * that was downloaded but never uploaded, or uploaded and withdrawn. A paid claim cannot be voided.
 */
export async function voidBatch(db: Db, actor: Actor, batchId: string, now = new Date()): Promise<{ ok: boolean; message?: string }> {
  const rows = await db.select().from(claims).where(eq(claims.batchId, batchId));
  if (rows.some((c) => c.status === "paid")) return { ok: false, message: "A claim in this file has been paid. Void it with the payer instead." };
  await db.transaction(async (tx) => {
    const a = audited(tx, actor);
    for (const c of rows) if (c.status !== "void") await a.update(claims, c.id, { status: "void", statusAt: now, statusMessage: "Taken back in EVVora", updatedAt: now });
    await a.update(claimBatches, batchId, { voidedAt: now, voidedBy: actor.userId, updatedAt: now });
  });
  return { ok: true };
}

/** Reads acknowledgments and remittances from the clearinghouse and moves claims along. */
export async function pollClaimStatus(db: Db, actor: Actor, adapter: ClearinghouseAdapter, now = new Date()): Promise<{ updated: number }> {
  const open = await db.select({ id: claims.id, patientControlNumber: claims.patientControlNumber, status: claims.status }).from(claims)
    .innerJoin(claimBatches, eq(claims.batchId, claimBatches.id))
    .where(and(inArray(claims.status, ["sent", "accepted"]), eq(claimBatches.method, "clearinghouse"), eq(claimBatches.clearinghouse, adapter.key)));
  if (!open.length) return { updated: 0 };
  const updates: ClaimStatusUpdate[] = await adapter.statusUpdates(open);
  const byPcn = new Map(open.map((c) => [c.patientControlNumber, c]));
  let updated = 0;
  for (const u of updates) {
    const c = byPcn.get(u.patientControlNumber);
    if (!c || c.status === u.status) continue;
    await audited(db, actor).update(claims, c.id, {
      status: u.status, statusAt: now, statusMessage: u.message ?? null, updatedAt: now,
      ...(u.payerClaimNumber ? { payerClaimNumber: u.payerClaimNumber } : {}),
      ...(u.paidAmount != null ? { paidAmount: u.paidAmount.toFixed(2) } : {}),
    });
    updated += 1;
  }
  return { updated };
}

export interface SentClaim {
  id: string; batchId: string; personId: string; personName: string; total: number; status: string; statusMessage: string | null; statusAt: Date | null;
  method: "clearinghouse" | "download"; clearinghouse: string; controlNumber: number; sentAt: Date; lines: number; firstDate: string; lastDate: string;
}

/** Claims whose service dates fall in the range, newest file first. Void ones are left out. */
export async function sentClaims(db: Db, fromDate: string, toDate: string): Promise<SentClaim[]> {
  const rows = await db
    .select({
      id: claims.id, batchId: claims.batchId, personId: claims.personId, first: people.firstName, last: people.lastName, total: claims.total, status: claims.status, statusMessage: claims.statusMessage, statusAt: claims.statusAt,
      method: claimBatches.method, clearinghouse: claimBatches.clearinghouse, controlNumber: claimBatches.controlNumber, sentAt: claimBatches.createdAt, serviceDate: claimLines.serviceDate,
    })
    .from(claims)
    .innerJoin(claimBatches, eq(claims.batchId, claimBatches.id))
    .innerJoin(people, eq(claims.personId, people.id))
    .innerJoin(claimLines, eq(claimLines.claimId, claims.id))
    .where(and(notInArray(claims.status, ["void"]), gte(claimLines.serviceDate, fromDate), lte(claimLines.serviceDate, toDate)))
    .orderBy(desc(claimBatches.createdAt));
  const out = new Map<string, SentClaim>();
  for (const r of rows) {
    const c = out.get(r.id);
    if (c) { c.lines += 1; if (r.serviceDate < c.firstDate) c.firstDate = r.serviceDate; if (r.serviceDate > c.lastDate) c.lastDate = r.serviceDate; continue; }
    out.set(r.id, { id: r.id, batchId: r.batchId, personId: r.personId, personName: `${r.first} ${r.last}`, total: Number(r.total), status: r.status, statusMessage: r.statusMessage, statusAt: r.statusAt, method: r.method, clearinghouse: r.clearinghouse, controlNumber: r.controlNumber, sentAt: r.sentAt, lines: 1, firstDate: r.serviceDate, lastDate: r.serviceDate });
  }
  return [...out.values()];
}
