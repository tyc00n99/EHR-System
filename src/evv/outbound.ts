/**
 * Everything an aggregator needs that the canonical visit row does not carry directly: identifiers
 * in the aggregator's format, the member's address, the decrypted coordinates of each call, the DHS
 * reason codes for a manual or corrected visit, and (when turned on) the billing block. Built fresh
 * for every attempt, held only in memory, and hashed — never stored — once it is a payload.
 *
 * The rules here come from the HHAeXchange Minnesota specification (rev. 10/28/2024):
 *  - an end of the visit is an EVV "call" only when it was electronically captured (mobile with a GPS
 *    fix, IVR with a caller ID, or FOB); otherwise that end is "manually confirmed" and the visit
 *    must carry an `editVisit` reason (business requirement 8);
 *  - a clock-out call without a clock-in call is rejected (101053), so it is sent as manual too;
 *  - the call time is the original event's, never a corrected time: HHAX refuses changed clock data
 *    (101052). A correction changes the *visit* times and adds the edit reason instead.
 */
import { and, asc, desc, eq, isNull, notInArray } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { decryptField } from "@/lib/crypto";
import type { OutboundAddress, OutboundCall, OutboundCaregiver, OutboundExtras } from "./adapters/types";
import { getProfile, type EvvCtx } from "./context";
import { DEFAULT_EDIT_ACTION, dhsReasonForManualText, isDhsEditAction, isDhsEditReason, waiverDutyFor, type DhsEditAction, type DhsEditReason } from "./dhs-codes";

/** ≤ 20 characters (HHAX `caregiver.identifier` for ExternalID, 101093/102029). Stable per staff row. */
export const caregiverExternalId = (staffId: string) => staffId.replace(/-/g, "").slice(0, 20).toUpperCase();
/** ≤ 30 characters (HHAX `externalVisitId`, 101094). Stable per visit. */
export const externalVisitId = (visitId: string) => visitId.replace(/-/g, "").slice(0, 30).toUpperCase();
/** The vendor-assigned EVVMSID: "~" + alphanumerics and hyphens, ≤ 64 after the tilde. A UUID is unique across agencies. */
export const externalEvvmsid = (visitId: string) => `~${visitId}`;

export const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

function coordsOf(e: EvvEvent): { lat: number; lng: number } | null {
  if (!e.locationEncrypted) return null;
  try {
    const c = JSON.parse(decryptField(e.locationEncrypted)) as { lat?: number; lng?: number };
    return typeof c.lat === "number" && typeof c.lng === "number" ? { lat: c.lat, lng: c.lng } : null;
  } catch { return null; }
}

/** One end as a call, or null when it is a manual confirmation. */
export function callFor(e: EvvEvent | null, ivrPhone: string | null): OutboundCall | null {
  if (!e?.effectiveAt) return null;
  const atUtc = e.effectiveAt.toISOString();
  if (e.verificationMethod === "mobile") {
    const c = coordsOf(e);
    return c ? { atUtc, method: "mobile", lat: c.lat, lng: c.lng, phone: null } : null;
  }
  if (e.verificationMethod === "ivr") {
    const phone = digits(e.registeredLocationRef).slice(-10) || digits(ivrPhone).slice(-10);
    return phone.length === 10 ? { atUtc, method: "ivr", lat: null, lng: null, phone } : null;
  }
  if (e.verificationMethod === "fob") return { atUtc, method: "fob", lat: null, lng: null, phone: null };
  return null; // manual, live_in, imported, other: confirmed by a person, not a device
}

/** The DHS edit codes a visit's payload must carry, or null for a clean electronically verified visit. */
export function editFor(visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, calls: { clockIn: OutboundCall | null; clockOut: OutboundCall | null }): { reasonCode: string; actionCode: string; notes: string | null } | null {
  const manualText = [events.clockIn, events.clockOut].map((e) => (e?.metadata as { manualReason?: string } | null)?.manualReason).find(Boolean) ?? null;
  const clip = (s: string | null) => (s ? s.slice(0, 256) : null);
  if (visit.editReasonCode) return { reasonCode: visit.editReasonCode, actionCode: visit.editActionCode ?? DEFAULT_EDIT_ACTION, notes: clip(visit.editNote ?? manualText) };
  const meta = [events.clockIn, events.clockOut].map((e) => e?.metadata as { dhsReasonCode?: string; dhsActionCode?: string } | null).find((m) => isDhsEditReason(m?.dhsReasonCode));
  if (meta?.dhsReasonCode) return { reasonCode: meta.dhsReasonCode, actionCode: isDhsEditAction(meta.dhsActionCode) ? meta.dhsActionCode : DEFAULT_EDIT_ACTION, notes: clip(manualText) };
  if (visit.liveIn && (!calls.clockIn || !calls.clockOut)) return { reasonCode: "222", actionCode: "110", notes: "Live-in caregiver" };
  if (visit.manualEntry && manualText) { const d = dhsReasonForManualText(manualText); return { reasonCode: d.reason, actionCode: d.action, notes: clip(manualText) }; }
  if (!calls.clockIn || !calls.clockOut) {
    // An end with an event but no usable fix: the phone was there and could not place the caregiver.
    const reason: DhsEditReason = events.clockIn && events.clockOut ? "217" : !calls.clockIn && !calls.clockOut ? "210" : !calls.clockIn ? "208" : "209";
    const action: DhsEditAction = DEFAULT_EDIT_ACTION;
    return { reasonCode: reason, actionCode: action, notes: clip(manualText) };
  }
  if (visit.corrected) return { reasonCode: "222", actionCode: DEFAULT_EDIT_ACTION, notes: "Corrected after capture" };
  return null;
}

async function memberAddress(ctx: EvvCtx, personId: string): Promise<{ address: OutboundAddress | null; ivrPhone: string | null }> {
  const locs = await ctx.db.select().from(schema.clientLocations).where(eq(schema.clientLocations.personId, personId));
  const home = locs.find((l) => l.isDefault && l.type === "home") ?? locs.find((l) => l.type === "home") ?? locs.find((l) => l.isDefault) ?? null;
  if (home?.address1 && home.city && home.zip) return { address: { line1: home.address1, line2: home.address2, city: home.city, state: home.state, zip: home.zip }, ivrPhone: home.ivrPhone };
  const [p] = await ctx.db.select({ a1: schema.people.address1, a2: schema.people.address2, city: schema.people.city, state: schema.people.state, zip: schema.people.zip }).from(schema.people).where(eq(schema.people.id, personId)).limit(1);
  if (p?.a1 && p.city && p.zip) return { address: { line1: p.a1, line2: p.a2, city: p.city, state: p.state ?? "MN", zip: p.zip }, ivrPhone: home?.ivrPhone ?? null };
  return { address: null, ivrPhone: home?.ivrPhone ?? null };
}

/**
 * The billing block, sent only when HHAX_SEND_BILLING=1 (see docs/evv-hhax-spec-notes.md: HHAX treats an
 * invoice number as "billed in the provider's system" and marks the visit billed overnight, so it is
 * off until HHAX confirms how that interacts with claims sent through Waystar).
 */
async function billingFor(ctx: EvvCtx, visit: EvvVisit, env: NodeJS.ProcessEnv): Promise<OutboundExtras["billing"]> {
  if (env.HHAX_SEND_BILLING !== "1" || !visit.visitId) return null;
  const [line] = await ctx.db.select({ units: schema.claimLines.units, amount: schema.claimLines.amount, pcn: schema.claims.patientControlNumber, unitRate: schema.serviceAgreements.unitRate, unitMinutes: schema.serviceAgreements.unitMinutes })
    .from(schema.claimLines).innerJoin(schema.claims, eq(schema.claims.id, schema.claimLines.claimId)).innerJoin(schema.serviceAgreements, eq(schema.serviceAgreements.id, schema.claims.serviceAgreementId))
    .where(and(eq(schema.claimLines.visitId, visit.visitId), notInArray(schema.claims.status, ["void", "rejected", "denied"]))).orderBy(desc(schema.claimLines.createdAt)).limit(1);
  if (!line) return null;
  const diagnoses = await ctx.db.select({ code: schema.clientDiagnoses.icdCode }).from(schema.clientDiagnoses).where(and(eq(schema.clientDiagnoses.personId, visit.personId), isNull(schema.clientDiagnoses.archivedAt))).orderBy(desc(schema.clientDiagnoses.isPrimary), asc(schema.clientDiagnoses.createdAt));
  const hourly = Number(line.unitRate) * (60 / (line.unitMinutes || 15));
  return {
    // The claim's patient control number without its "EV" prefix: exactly 18 characters, so HHAX never truncates it.
    invoiceNumber: line.pcn.replace(/^EV/, "").slice(0, 18),
    totalBilledAmount: Number(line.amount), totalUnitsBilled: line.units, contractRate: Math.round(hourly * 100) / 100,
    diagnosisCodes: diagnoses.map((d) => d.code.replace(/\./g, "")).slice(0, 26),
  };
}

/** Builds the extras for one visit at its current version. */
export async function buildExtras(ctx: EvvCtx, visit: EvvVisit, events: { clockIn: EvvEvent | null; clockOut: EvvEvent | null }, env: NodeJS.ProcessEnv = process.env): Promise<OutboundExtras> {
  const { profile } = await getProfile(ctx);
  const { address, ivrPhone } = await memberAddress(ctx, visit.personId);
  let clockIn = callFor(events.clockIn, ivrPhone);
  let clockOut = callFor(events.clockOut, ivrPhone);
  if (clockOut && !clockIn) clockOut = null; // 101053: a clock-out call needs a clock-in call
  const payer = visit.payerId ? (await ctx.db.select({ ext: schema.evvPayers.externalPayerId }).from(schema.evvPayers).where(eq(schema.evvPayers.id, visit.payerId)).limit(1))[0] : null;
  const qualifier = profile.officeQualifier === "NPI" || profile.officeQualifier === "UMPI" ? profile.officeQualifier : "FederalTaxID";
  const start = visit.clockInAt?.toISOString() ?? null;
  const end = visit.clockOutAt?.toISOString() ?? null;
  const duty = env.HHAX_SEND_TASKS === "1" && payer?.ext === "MIWS" ? waiverDutyFor(visit.serviceCode, visit.modifiers) : null;
  return {
    office: { qualifier, identifier: qualifier === "FederalTaxID" ? digits(visit.providerTaxId || profile.federalTaxId) : (profile.officeIdentifier ?? "").trim() },
    payerExternalId: payer?.ext ?? null,
    caregiverExternalId: caregiverExternalId(visit.staffId),
    externalVisitId: externalVisitId(visit.id),
    externalEvvmsid: externalEvvmsid(visit.id),
    serviceAddress: address,
    locationType: visit.locationType === "home" || visit.locationType === "protected" ? "Home" : visit.locationType ? "Community" : null,
    clockIn, clockOut,
    visitStartUtc: start, visitEndUtc: end,
    // MN DHS does not require a schedule; HHAX does, and the specification says to copy the visit times
    // in. Copying (rather than sending the booked shift) also keeps 101091 — schedule on the visit day — from firing.
    scheduleStartUtc: start, scheduleEndUtc: end,
    edit: editFor(visit, events, { clockIn, clockOut }),
    residingCaregiver: visit.liveIn,
    performedTasks: duty ? [duty] : [],
    billing: await billingFor(ctx, visit, env),
  };
}

const GENDER: Record<string, OutboundCaregiver["gender"]> = { female: "Female", male: "Male" };

/** The caregiver record for the aggregator. */
export async function buildCaregiver(ctx: EvvCtx, staffId: string): Promise<OutboundCaregiver | null> {
  const [s] = await ctx.db.select().from(schema.staff).where(eq(schema.staff.id, staffId)).limit(1);
  if (!s) return null;
  const { profile } = await getProfile(ctx);
  const phone = digits(s.phone).slice(-10);
  return {
    staffId, externalId: caregiverExternalId(staffId), providerTaxId: digits(profile.federalTaxId),
    firstName: s.firstName, lastName: s.lastName, dateOfBirth: s.dob, gender: GENDER[s.gender] ?? "Other",
    email: s.email?.trim() || null, phone: phone.length === 10 ? phone : null, umpi: s.umpi?.trim() || null,
    address: { line1: s.address1, line2: s.address2, city: s.city, state: s.state, zip: digits(s.zip) },
  };
}
