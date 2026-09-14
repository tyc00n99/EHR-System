/**
 * The EVV visit service: creating a canonical visit, writing versions, evaluating compliance and
 * keeping the exception list in step. Ingestion (clock events), corrections, review and
 * submission each build on this file; none of them writes an evv_visits row directly.
 */
import { and, desc, eq, gt, gte, inArray, lt, lte, ne, or } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { checkAuthorization, billingReadiness } from "./authorization";
import { evvAudit } from "./audit";
import { evaluateCompliance } from "./compliance";
import { defaultPayerId, getPolicy, getProfile, getRules, writer, type EvvCtx } from "./context";
import { ruleFor } from "./rules";
import { localDate } from "./time";
import { REASON, type ReasonCode } from "./types";

export class EvvError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

/** Loads one visit inside the tenant. Anything outside the tenant is simply not found. */
export async function loadVisit(ctx: EvvCtx, id: string): Promise<EvvVisit | null> {
  const [v] = await ctx.db.select().from(schema.evvVisits).where(and(eq(schema.evvVisits.id, id), eq(schema.evvVisits.organizationId, ctx.orgId))).limit(1);
  return v ?? null;
}

export async function requireVisit(ctx: EvvCtx, id: string): Promise<EvvVisit> {
  const v = await loadVisit(ctx, id);
  if (!v) throw new EvvError(404, "VISIT_NOT_FOUND", "Visit not found.");
  return v;
}

export async function loadEvents(ctx: EvvCtx, evvVisitId: string): Promise<EvvEvent[]> {
  return ctx.db.select().from(schema.evvEvents).where(and(eq(schema.evvEvents.organizationId, ctx.orgId), eq(schema.evvEvents.evvVisitId, evvVisitId))).orderBy(schema.evvEvents.serverReceivedAt);
}

export interface CreateVisitInput {
  id?: string;
  personId: string;
  staffId: string;
  serviceAgreementId?: string | null;
  serviceCode?: string;
  modifiers?: string[];
  shiftId?: string | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  payerId?: string | null;
  liveIn?: boolean;
  sharedCareGroupId?: string | null;
  visitId?: string | null;
  imported?: boolean;
  manualEntry?: boolean;
}

/** Creates a planned visit with provider identifiers snapshotted and the governing rule resolved. */
export async function createVisit(ctx: EvvCtx, input: CreateVisitInput): Promise<EvvVisit> {
  const [person] = await ctx.db.select({ id: schema.people.id, pmi: schema.people.pmi, status: schema.people.status }).from(schema.people).where(eq(schema.people.id, input.personId)).limit(1);
  if (!person) throw new EvvError(404, "CLIENT_NOT_FOUND", "Client not found.");
  const [member] = await ctx.db.select({ id: schema.staff.id, npi: schema.staff.npi, umpi: schema.staff.umpi, active: schema.staff.active }).from(schema.staff).where(eq(schema.staff.id, input.staffId)).limit(1);
  if (!member) throw new EvvError(404, "CAREGIVER_NOT_FOUND", "Caregiver not found.");

  let serviceCode = input.serviceCode?.toUpperCase() ?? "";
  let modifiers = (input.modifiers ?? []).map((m) => m.toUpperCase());
  if (input.serviceAgreementId) {
    const [a] = await ctx.db.select().from(schema.serviceAgreements).where(eq(schema.serviceAgreements.id, input.serviceAgreementId)).limit(1);
    if (!a) throw new EvvError(404, "AUTHORIZATION_NOT_FOUND", "Service agreement not found.");
    if (a.personId !== person.id) throw new EvvError(409, "AUTHORIZATION_MISMATCH", "That service agreement belongs to a different client.");
    if (!serviceCode) { serviceCode = a.serviceCode.toUpperCase(); modifiers = a.modifiers.map((m) => m.toUpperCase()); }
  }
  if (!serviceCode) throw new EvvError(422, "SERVICE_REQUIRED", "A service code or a service agreement is required.");

  const { profile, identifiers } = await getProfile(ctx);
  const [org] = await ctx.db.select().from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1);
  const billing = identifiers.find((i) => i.type === "umpi") ?? identifiers.find((i) => i.type === "npi") ?? null;
  const rules = await getRules(ctx);
  const today = localDate(ctx.now(), profile.timeZone);
  const rule = ruleFor(rules, serviceCode, modifiers, today, input.payerId ?? null);

  const row = await writer(ctx).insert(schema.evvVisits, {
    ...(input.id ? { id: input.id } : {}),
    organizationId: ctx.orgId,
    providerMedicaidId: profile.medicaidProviderId,
    providerTaxId: profile.federalTaxId || org?.taxId || "",
    billingIdType: billing?.type ?? (org?.umpi ? "umpi" : org?.npi ? "npi" : null),
    billingId: billing?.value ?? org?.umpi ?? org?.npi ?? null,
    personId: person.id,
    memberId: person.pmi,
    staffId: member.id,
    serviceAgreementId: input.serviceAgreementId ?? null,
    shiftId: input.shiftId ?? null,
    visitId: input.visitId ?? null,
    sharedCareGroupId: input.sharedCareGroupId ?? null,
    serviceCode, modifiers,
    payerId: input.payerId ?? (await defaultPayerId(ctx)),
    serviceRuleId: rule?.id ?? null,
    evvRequired: Boolean(rule?.requiresEvv),
    unitType: rule?.unitType ?? "fifteen_minute",
    sharedCare: Boolean(rule?.sharedCare) || Boolean(input.sharedCareGroupId),
    scheduledStartAt: input.scheduledStartAt ?? null,
    scheduledEndAt: input.scheduledEndAt ?? null,
    timeZone: profile.timeZone,
    liveIn: Boolean(input.liveIn),
    imported: Boolean(input.imported),
    manualEntry: Boolean(input.manualEntry),
    status: "planned",
    createdBy: ctx.actorUserId,
  });
  await writeVersion(ctx, row, "create", null);
  await evvAudit(ctx, "visit.create", row.id, { serviceCode, modifiers, evvRequired: row.evvRequired, ruleId: rule?.id ?? null, imported: row.imported });
  return row;
}

/** Appends the immutable snapshot for the visit's current version. */
export async function writeVersion(ctx: EvvCtx, visit: EvvVisit, cause: string, causedByEventId: string | null): Promise<void> {
  await ctx.db.insert(schema.evvVisitVersions).values({ organizationId: ctx.orgId, evvVisitId: visit.id, version: visit.version, snapshot: visit, cause, causedByEventId, createdBy: ctx.actorUserId });
}

/** Applies a change as a new version: bumps `version`, updates the row, snapshots it. */
export async function applyVersion(ctx: EvvCtx, visit: EvvVisit, patch: Partial<EvvVisit>, cause: string, causedByEventId: string | null): Promise<EvvVisit> {
  const next = await writer(ctx).update(schema.evvVisits, visit.id, { ...patch, version: visit.version + 1 });
  await writeVersion(ctx, next, cause, causedByEventId);
  return next;
}

/** A documented live-in relationship covering the visit's date, or null. */
export async function liveInRelationshipFor(ctx: EvvCtx, personId: string, staffId: string, isoDate: string) {
  const rows = await ctx.db.select().from(schema.evvLiveInRelationships).where(and(eq(schema.evvLiveInRelationships.organizationId, ctx.orgId), eq(schema.evvLiveInRelationships.personId, personId), eq(schema.evvLiveInRelationships.staffId, staffId), eq(schema.evvLiveInRelationships.active, true)));
  return rows.find((r) => r.effectiveFrom <= isoDate && (!r.effectiveTo || r.effectiveTo >= isoDate)) ?? null;
}

/** Other visits by the same caregiver that overlap this one in time (shared-care siblings excluded). */
export async function overlappingVisits(ctx: EvvCtx, visit: EvvVisit): Promise<EvvVisit[]> {
  if (!visit.clockInAt) return [];
  const policy = await getPolicy(ctx, "MN");
  // An open visit is presumed to run until now, but never longer than a plausible visit: a
  // forgotten clock-out from last week must not make every visit since then "overlapping".
  const presumedEnd = (v: EvvVisit) => v.clockOutAt ?? new Date(Math.min(ctx.now().getTime(), v.clockInAt!.getTime() + policy.maxVisitMinutes * 60_000));
  const end = presumedEnd(visit);
  const rows = await ctx.db.select().from(schema.evvVisits).where(and(
    eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.staffId, visit.staffId), ne(schema.evvVisits.id, visit.id), ne(schema.evvVisits.status, "voided"),
    inArray(schema.evvVisits.status, ["in_progress", "completed"]), lt(schema.evvVisits.clockInAt, end),
    or(gt(schema.evvVisits.clockOutAt, visit.clockInAt), and(eq(schema.evvVisits.status, "in_progress"), gte(schema.evvVisits.clockInAt, new Date(0)))),
  ));
  return rows.filter((r) => !(visit.sharedCareGroupId && r.sharedCareGroupId === visit.sharedCareGroupId)).filter((r) => presumedEnd(r) > visit.clockInAt!);
}

/** Another visit with the same client, caregiver and clock-in within a minute: a duplicate. */
export async function duplicateVisits(ctx: EvvCtx, visit: EvvVisit): Promise<EvvVisit[]> {
  if (!visit.clockInAt) return [];
  const lo = new Date(visit.clockInAt.getTime() - 60_000), hi = new Date(visit.clockInAt.getTime() + 60_000);
  return ctx.db.select().from(schema.evvVisits).where(and(
    eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.staffId, visit.staffId), eq(schema.evvVisits.personId, visit.personId), ne(schema.evvVisits.id, visit.id), ne(schema.evvVisits.status, "voided"),
    gte(schema.evvVisits.clockInAt, lo), lte(schema.evvVisits.clockInAt, hi),
  ));
}

export async function latestSubmission(ctx: EvvCtx, evvVisitId: string) {
  const [s] = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.evvVisitId, evvVisitId))).orderBy(desc(schema.evvSubmissions.createdAt)).limit(1);
  return s ?? null;
}

/** Reasons that open an exception a person must look at. Informational reasons do not. */
const EXCEPTION_REASONS = new Set<ReasonCode>([
  REASON.MISSING_START_LOCATION, REASON.MISSING_END_LOCATION, REASON.MANUAL_ENTRY, REASON.CORRECTED_VISIT, REASON.NOT_VERIFIED_REAL_TIME, REASON.INVALID_VERIFICATION_METHOD,
  REASON.OUTSIDE_GEOFENCE, REASON.LOCATION_ACCURACY_INSUFFICIENT, REASON.LOCATION_PERMISSION_DENIED, REASON.CAREGIVER_MISMATCH, REASON.PROVIDER_IDENTIFIER_MISSING,
  REASON.AUTHORIZATION_MISMATCH, REASON.AUTHORIZATION_EXPIRED, REASON.AUTHORIZATION_UNITS_EXCEEDED, REASON.SERVICE_CODE_MISMATCH, REASON.DUPLICATE_VISIT, REASON.OVERLAPPING_VISIT,
  REASON.SHARED_CARE_DATA_INCOMPLETE, REASON.AGGREGATOR_REJECTION, REASON.LIVE_IN_NOT_DOCUMENTED, REASON.IMPORTED_NOT_VERIFIED, REASON.IMPLAUSIBLE_TIMESTAMP, REASON.IMPLAUSIBLE_DURATION, REASON.OUT_OF_ORDER_EVENTS,
]);
const SEVERITY: Partial<Record<ReasonCode, "info" | "warning" | "error">> = { DELAYED_SYNC: "info", OUT_OF_ORDER_EVENTS: "warning", MANUAL_ENTRY: "warning", CORRECTED_VISIT: "warning", NOT_VERIFIED_REAL_TIME: "warning", AGGREGATOR_REJECTION: "error", CAREGIVER_MISMATCH: "error", DUPLICATE_VISIT: "error" };

/** Opens an exception of this type unless one is already open for the visit. */
export async function openException(ctx: EvvCtx, evvVisitId: string, type: ReasonCode | string, detail: string | null = null, severity: "info" | "warning" | "error" = SEVERITY[type as ReasonCode] ?? "warning"): Promise<void> {
  const [existing] = await ctx.db.select({ id: schema.evvExceptions.id }).from(schema.evvExceptions).where(and(eq(schema.evvExceptions.organizationId, ctx.orgId), eq(schema.evvExceptions.evvVisitId, evvVisitId), eq(schema.evvExceptions.type, type), inArray(schema.evvExceptions.status, ["open", "acknowledged"]))).limit(1);
  if (existing) return;
  await writer(ctx).insert(schema.evvExceptions, { organizationId: ctx.orgId, evvVisitId, type, severity, detail });
  await evvAudit(ctx, "exception.open", evvVisitId, { type, severity });
}

/** Raised by ingestion from facts the evaluator cannot see again; a person closes these. */
const INGESTION_ONLY = new Set<string>([REASON.OUT_OF_ORDER_EVENTS, REASON.IMPLAUSIBLE_TIMESTAMP, REASON.IMPLAUSIBLE_DURATION, REASON.DELAYED_SYNC]);

/** Closes open exceptions of engine-reported types the latest evaluation no longer reports. */
async function resolveStaleExceptions(ctx: EvvCtx, evvVisitId: string, current: Set<string>): Promise<void> {
  const open = await ctx.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.organizationId, ctx.orgId), eq(schema.evvExceptions.evvVisitId, evvVisitId), eq(schema.evvExceptions.status, "open")));
  for (const e of open) {
    if (EXCEPTION_REASONS.has(e.type as ReasonCode) && !INGESTION_ONLY.has(e.type) && !current.has(e.type)) {
      await writer(ctx).update(schema.evvExceptions, e.id, { status: "resolved", resolvedAt: ctx.now(), resolvedBy: ctx.actorUserId, resolutionNote: "No longer reported by the compliance evaluation." });
      await evvAudit(ctx, "exception.auto_resolve", evvVisitId, { type: e.type });
    }
  }
}

/**
 * Evaluates compliance and billing readiness for a visit, persists both, and syncs exceptions.
 * Evaluation does not bump the version: the facts of the visit did not change, only what we
 * conclude from them. Returns the updated row.
 */
export async function evaluateVisit(ctx: EvvCtx, visitId: string): Promise<EvvVisit> {
  const visit = await requireVisit(ctx, visitId);
  const events = await loadEvents(ctx, visit.id);
  const clockIn = events.find((e) => e.id === visit.clockInEventId) ?? null;
  const clockOut = events.find((e) => e.id === visit.clockOutEventId) ?? null;
  const policy = await getPolicy(ctx, "MN");
  const rules = await getRules(ctx);
  const rule = visit.serviceRuleId ? rules.find((r) => r.id === visit.serviceRuleId) ?? null : null;
  const { profile, identifiers } = await getProfile(ctx);
  const [org] = await ctx.db.select({ npi: schema.organizations.npi, umpi: schema.organizations.umpi }).from(schema.organizations).where(eq(schema.organizations.id, ctx.orgId)).limit(1);
  const providerIdentifiersOk = Boolean(visit.providerTaxId) && (identifiers.length > 0 || Boolean(org?.npi || org?.umpi)) && Boolean(profile.medicaidProviderId || identifiers.length || org?.npi || org?.umpi);
  const liveIn = visit.liveIn && visit.serviceDate ? await liveInRelationshipFor(ctx, visit.personId, visit.staffId, visit.serviceDate) : null;
  const [overlap, dup, submission] = await Promise.all([overlappingVisits(ctx, visit), duplicateVisits(ctx, visit), latestSubmission(ctx, visit.id)]);
  const authorization = visit.status === "completed" ? await checkAuthorization(ctx, visit) : null;

  const result = evaluateCompliance({
    visit, clockIn, clockOut, policy, rule, liveInDocumented: Boolean(liveIn), overlapping: overlap.length > 0, duplicate: dup.length > 0,
    aggregatorRejected: ["rejected", "correction_required", "permanently_failed"].includes(submission?.status ?? ""), providerIdentifiersOk, authorization,
  });
  const reasonSet = new Set<string>(result.reasons);
  for (const r of result.reasons) if (EXCEPTION_REASONS.has(r)) await openException(ctx, visit.id, r);
  if (result.status !== "INCOMPLETE") await resolveStaleExceptions(ctx, visit.id, reasonSet);
  const [{ open }] = await ctx.db.select({ open: schema.evvExceptions.id }).from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, visit.id), eq(schema.evvExceptions.status, "open"))).then((rows) => [{ open: rows.length }]);
  const billing = billingReadiness({ visit, compliance: result, authorization, submission, openExceptions: open, policy });

  const updated = await writer(ctx).update(schema.evvVisits, visit.id, {
    complianceStatus: result.status, complianceReasons: result.reasons, complianceEvaluatedAt: ctx.now(),
    billingReadiness: billing.readiness, billingReasons: billing.reasons,
    liveInRelationshipId: liveIn?.id ?? null,
  });
  await evvAudit(ctx, "visit.evaluate", visit.id, { complianceStatus: result.status, reasons: result.reasons, billingReadiness: billing.readiness });
  return updated;
}
