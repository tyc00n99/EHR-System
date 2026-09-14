/**
 * Clock-in and clock-out ingestion. An event is what a device asserted; this file records it
 * exactly once, decides what it means for the visit, and never throws it away because it is
 * noncompliant. Hard rejections are reserved for events that are not authentic for this visit
 * (wrong caregiver, wrong tenant, malformed) or that cannot be applied (already clocked in).
 */
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { EvvEvent, EvvVisit } from "@/db/schema";
import { encryptField } from "@/lib/crypto";
import { evvAudit, eventIntegrityHash } from "./audit";
import { getPolicy, getRules, writer, type EvvCtx } from "./context";
import { classifyLocation, validCoordinates } from "./geo";
import { localDate, minutesBetween } from "./time";
import { REASON, type Coordinates } from "./types";
import { unitsFor } from "./units";
import { applyVersion, createVisit, evaluateVisit, EvvError, loadVisit, openException, requireVisit, type CreateVisitInput } from "./visits";

const uuid = z.uuid();
export const clockEventSchema = z.object({
  eventId: uuid,
  idempotencyKey: z.string().min(8).max(200),
  deviceCapturedAt: z.string().datetime({ offset: true }),
  deviceUtcOffsetMinutes: z.number().int().min(-14 * 60).max(14 * 60).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  accuracyMeters: z.number().min(0).max(100_000).optional(),
  locationPermissionDenied: z.boolean().optional(),
  locationSource: z.enum(["gps", "network", "ivr", "fob", "manual", "none"]).optional(),
  locationType: z.enum(["home", "community", "alternate", "protected"]),
  verificationMethod: z.enum(["mobile", "ivr", "fob", "live_in", "manual", "other"]),
  registeredLocationRef: z.string().max(100).optional(),
  deviceId: z.string().max(200).optional(),
  offline: z.boolean().optional(),
  /** App version, OS, connectivity — never coordinates or names. */
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  /** Why a manual entry was made. Required when verificationMethod is "manual". */
  manualReason: z.string().max(500).optional(),
}).refine((e) => e.verificationMethod !== "manual" || Boolean(e.manualReason?.trim()), { message: "A manual entry needs a reason", path: ["manualReason"] });
export type ClockEventInput = z.infer<typeof clockEventSchema>;

/** Who is clocking. Office roles may act for a caregiver they name; caregivers act as themselves. */
export interface ClockActor { userId: string | null; staffId: string; role: "admin" | "supervisor" | "dsp" }

export interface ClockResult {
  visit: EvvVisit;
  event: EvvEvent;
  /** The same event was already stored; nothing changed. */
  duplicate: boolean;
  /** Reason codes raised at ingestion (not the full compliance evaluation). */
  flags: string[];
}

async function existingEvent(ctx: EvvCtx, eventId: string, idempotencyKey: string): Promise<EvvEvent | null> {
  const [byId] = await ctx.db.select().from(schema.evvEvents).where(and(eq(schema.evvEvents.organizationId, ctx.orgId), eq(schema.evvEvents.eventId, eventId))).limit(1);
  if (byId) return byId;
  const [byKey] = await ctx.db.select().from(schema.evvEvents).where(and(eq(schema.evvEvents.organizationId, ctx.orgId), eq(schema.evvEvents.idempotencyKey, idempotencyKey))).limit(1);
  return byKey ?? null;
}

async function homeFor(ctx: EvvCtx, personId: string): Promise<{ point: { lat: number; lng: number } | null; protectedAddress: boolean }> {
  const rows = await ctx.db.select().from(schema.clientLocations).where(eq(schema.clientLocations.personId, personId));
  const home = rows.find((r) => r.isDefault && r.type === "home") ?? rows.find((r) => r.type === "home") ?? rows.find((r) => r.isDefault) ?? null;
  return { point: home && home.lat != null && home.lng != null ? { lat: home.lat, lng: home.lng } : null, protectedAddress: Boolean(home?.protectedAddress) };
}

async function assertCaregiverMayAct(ctx: EvvCtx, actor: ClockActor, visit: EvvVisit): Promise<void> {
  if (actor.role === "dsp" && actor.staffId !== visit.staffId) throw new EvvError(403, "CAREGIVER_MISMATCH", "This visit belongs to a different caregiver.");
  if (actor.role === "dsp") {
    const [a] = await ctx.db.select({ id: schema.assignments.id }).from(schema.assignments).where(and(eq(schema.assignments.staffId, actor.staffId), eq(schema.assignments.personId, visit.personId), eq(schema.assignments.active, true))).limit(1);
    if (!a) throw new EvvError(403, "NOT_ASSIGNED", "This client is not assigned to you.");
  }
}

interface Timing { effectiveAt: Date; delayed: boolean; implausible: boolean; delayMinutes: number }

/** Decides when an event happened. The device time is kept unless it is in the future beyond tolerance. */
function timing(ctx: EvvCtx, input: ClockEventInput, policy: { realTimeToleranceMinutes: number; maxFutureSkewMinutes: number }): Timing {
  const received = ctx.now();
  const device = new Date(input.deviceCapturedAt);
  const skew = minutesBetween(received, device); // positive = device ahead of server
  const implausible = Number.isNaN(device.getTime()) || skew > policy.maxFutureSkewMinutes;
  const delayMinutes = Math.max(0, -skew);
  return { effectiveAt: implausible ? received : device, delayed: delayMinutes > policy.realTimeToleranceMinutes, implausible, delayMinutes };
}

async function storeEvent(ctx: EvvCtx, visit: EvvVisit, type: "clock_in" | "clock_out", input: ClockEventInput, actor: ClockActor, t: Timing): Promise<{ event: EvvEvent; flags: string[] }> {
  const policy = await getPolicy(ctx, "MN");
  const home = await homeFor(ctx, visit.personId);
  const coords: Coordinates | null = validCoordinates({ lat: input.latitude, lng: input.longitude, accuracy: input.accuracyMeters ?? null }) ? { lat: input.latitude!, lng: input.longitude!, accuracy: input.accuracyMeters ?? null } : null;
  const locationType = home.protectedAddress && input.locationType === "home" ? "protected" : input.locationType;
  const loc = classifyLocation({ coordinates: coords, permissionDenied: Boolean(input.locationPermissionDenied), locationType, home: home.point, registeredLocationRef: input.registeredLocationRef ?? null, method: input.verificationMethod, policy });
  const received = ctx.now();
  const flags: string[] = [];
  if (t.implausible) flags.push(REASON.IMPLAUSIBLE_TIMESTAMP);
  if (t.delayed) flags.push(REASON.DELAYED_SYNC);

  const base = {
    organizationId: ctx.orgId, evvVisitId: visit.id, eventId: input.eventId, idempotencyKey: input.idempotencyKey, type,
    deviceCapturedAt: Number.isNaN(new Date(input.deviceCapturedAt).getTime()) ? null : new Date(input.deviceCapturedAt),
    deviceUtcOffsetMinutes: input.deviceUtcOffsetMinutes ?? null, serverReceivedAt: received, effectiveAt: t.effectiveAt,
    locationEncrypted: coords ? encryptField(JSON.stringify(coords)) : null, accuracyMeters: coords?.accuracy ?? null,
    locationSource: input.locationSource ?? (coords ? "gps" : input.locationPermissionDenied ? "none" : "none"), locationType, locationState: loc.state, distanceFromHomeMeters: loc.distanceFromHomeMeters,
    registeredLocationRef: input.registeredLocationRef ?? null, verificationMethod: input.verificationMethod, deviceId: input.deviceId ?? null,
    offline: Boolean(input.offline), delayed: t.delayed, actorUserId: actor.userId, actorStaffId: actor.staffId,
    metadata: { ...(input.metadata ?? {}), ...(input.manualReason ? { manualReason: input.manualReason } : {}), delayMinutes: t.delayMinutes },
  };
  const integrityHash = eventIntegrityHash({ eventId: base.eventId, type, deviceCapturedAt: base.deviceCapturedAt, serverReceivedAt: received, effectiveAt: t.effectiveAt, locationEncrypted: base.locationEncrypted, verificationMethod: input.verificationMethod, actorStaffId: actor.staffId, evvVisitId: visit.id });
  // Direct insert: the events table is append-only by design and is its own record.
  const [event] = await ctx.db.insert(schema.evvEvents).values({ ...base, integrityHash }).returning();
  await evvAudit(ctx, `event.${type}`, visit.id, { eventId: event.id, locationState: loc.state, verificationMethod: input.verificationMethod, offline: event.offline, delayed: event.delayed, implausible: t.implausible });
  return { event, flags };
}

/** A visit the same caregiver already has open, other than this one. */
async function openVisitFor(ctx: EvvCtx, staffId: string, exceptId: string): Promise<EvvVisit | null> {
  const [v] = await ctx.db.select().from(schema.evvVisits).where(and(eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.staffId, staffId), eq(schema.evvVisits.status, "in_progress"), ne(schema.evvVisits.id, exceptId))).limit(1);
  return v ?? null;
}

/**
 * Clock in. When the visit id is unknown and `create` is supplied, the visit is created with
 * that id (a client-generated UUID from an offline app). Returns the stored event; a repeat of
 * the same event returns the original with `duplicate: true`.
 */
export async function clockIn(ctx: EvvCtx, visitId: string, raw: unknown, actor: ClockActor, create?: Omit<CreateVisitInput, "id" | "staffId"> & { staffId?: string }): Promise<ClockResult> {
  const input = clockEventSchema.parse(raw);
  const dup = await existingEvent(ctx, input.eventId, input.idempotencyKey);
  if (dup) {
    if (dup.evvVisitId !== visitId || dup.type !== "clock_in") throw new EvvError(409, "IDEMPOTENCY_CONFLICT", "That event id was already used for a different event.");
    return { visit: await requireVisit(ctx, visitId), event: dup, duplicate: true, flags: [] };
  }
  let visit = await loadVisit(ctx, visitId);
  if (!visit) {
    if (!create) throw new EvvError(404, "VISIT_NOT_FOUND", "Visit not found. Send the visit details to create it.");
    visit = await createVisit(ctx, { ...create, id: visitId, staffId: create.staffId ?? actor.staffId, liveIn: create.liveIn ?? input.verificationMethod === "live_in", manualEntry: input.verificationMethod === "manual" });
  }
  await assertCaregiverMayAct(ctx, actor, visit);
  if (visit.status === "voided") throw new EvvError(409, "VISIT_VOIDED", "This visit was voided.");
  if (visit.clockInEventId) throw new EvvError(409, "ALREADY_CLOCKED_IN", "This visit is already clocked in.");

  const policy = await getPolicy(ctx, "MN");
  const t = timing(ctx, input, policy);
  const { event, flags } = await storeEvent(ctx, visit, "clock_in", input, actor, t);
  const patch: Partial<EvvVisit> = {
    clockInAt: t.effectiveAt, clockInEventId: event.id, serviceDate: localDate(t.effectiveAt, visit.timeZone),
    locationType: event.locationType, verificationMethod: input.verificationMethod,
    manualEntry: visit.manualEntry || input.verificationMethod === "manual", liveIn: visit.liveIn || input.verificationMethod === "live_in",
    status: "in_progress",
  };

  // A clock-out that arrived first: reconcile if the order is safe, otherwise ask a person.
  if (visit.status === "awaiting_clock_in" && visit.clockOutAt) {
    if (visit.clockOutAt > t.effectiveAt) {
      patch.status = "completed";
      flags.push(REASON.OUT_OF_ORDER_EVENTS);
    } else {
      patch.status = "in_progress";
      patch.clockOutAt = null; patch.clockOutEventId = null; // the stored clock-out event remains; the visit cannot end before it starts
      await openException(ctx, visit.id, REASON.OUT_OF_ORDER_EVENTS, "Clock-out was received before clock-in and is not after it; review both events.", "error");
      flags.push(REASON.OUT_OF_ORDER_EVENTS);
    }
  }
  visit = await applyVersion(ctx, visit, patch, "clock_in", event.id);
  if (patch.status === "completed") visit = await finalize(ctx, visit);

  const open = await openVisitFor(ctx, visit.staffId, visit.id);
  if (open && !(visit.sharedCareGroupId && open.sharedCareGroupId === visit.sharedCareGroupId)) { await openException(ctx, visit.id, REASON.OVERLAPPING_VISIT, "Another visit by this caregiver was still open at clock-in."); flags.push(REASON.OVERLAPPING_VISIT); }
  if (t.implausible) await openException(ctx, visit.id, REASON.IMPLAUSIBLE_TIMESTAMP, "Device time was ahead of the server beyond the allowed skew; server time was used.", "warning");
  if (t.delayed) await openException(ctx, visit.id, REASON.DELAYED_SYNC, `Received ${t.delayMinutes} minutes after capture.`, "info");
  await checkContext(ctx, visit, flags);
  visit = await evaluateVisit(ctx, visit.id);
  return { visit, event, duplicate: false, flags };
}

/** Clock out. A clock-out with no clock-in yet is stored and the visit waits for the delayed clock-in. */
export async function clockOut(ctx: EvvCtx, visitId: string, raw: unknown, actor: ClockActor): Promise<ClockResult> {
  const input = clockEventSchema.parse(raw);
  const dup = await existingEvent(ctx, input.eventId, input.idempotencyKey);
  if (dup) {
    if (dup.evvVisitId !== visitId || dup.type !== "clock_out") throw new EvvError(409, "IDEMPOTENCY_CONFLICT", "That event id was already used for a different event.");
    return { visit: await requireVisit(ctx, visitId), event: dup, duplicate: true, flags: [] };
  }
  let visit = await requireVisit(ctx, visitId);
  await assertCaregiverMayAct(ctx, actor, visit);
  if (visit.status === "voided") throw new EvvError(409, "VISIT_VOIDED", "This visit was voided.");
  if (visit.clockOutEventId) throw new EvvError(409, "ALREADY_CLOCKED_OUT", "This visit is already clocked out.");

  const policy = await getPolicy(ctx, "MN");
  const t = timing(ctx, input, policy);
  const { event, flags } = await storeEvent(ctx, visit, "clock_out", input, actor, t);

  if (!visit.clockInEventId) {
    // Offline ordering: the clock-in has not arrived. Hold the clock-out on the visit and wait.
    visit = await applyVersion(ctx, visit, { clockOutAt: t.effectiveAt, clockOutEventId: event.id, status: "awaiting_clock_in", locationType: visit.locationType ?? event.locationType, verificationMethod: visit.verificationMethod ?? input.verificationMethod }, "clock_out", event.id);
    await openException(ctx, visit.id, REASON.OUT_OF_ORDER_EVENTS, "Clock-out arrived before the clock-in. It will reconcile when the clock-in syncs.", "info");
    flags.push(REASON.OUT_OF_ORDER_EVENTS);
    visit = await evaluateVisit(ctx, visit.id);
    return { visit, event, duplicate: false, flags };
  }
  if (visit.clockInAt && t.effectiveAt <= visit.clockInAt) {
    // The event is kept; the visit cannot be closed on a time before it started.
    await openException(ctx, visit.id, REASON.IMPLAUSIBLE_TIMESTAMP, "Clock-out time is not after clock-in. Correct one of them.", "error");
    flags.push(REASON.IMPLAUSIBLE_TIMESTAMP);
    visit = await evaluateVisit(ctx, visit.id);
    return { visit, event, duplicate: false, flags };
  }
  visit = await applyVersion(ctx, visit, { clockOutAt: t.effectiveAt, clockOutEventId: event.id, status: "completed", manualEntry: visit.manualEntry || input.verificationMethod === "manual" }, "clock_out", event.id);
  if (t.implausible) await openException(ctx, visit.id, REASON.IMPLAUSIBLE_TIMESTAMP, "Device time was ahead of the server beyond the allowed skew; server time was used.", "warning");
  if (t.delayed) await openException(ctx, visit.id, REASON.DELAYED_SYNC, `Received ${t.delayMinutes} minutes after capture.`, "info");
  visit = await finalize(ctx, visit);
  await checkContext(ctx, visit, flags);
  visit = await evaluateVisit(ctx, visit.id);
  return { visit, event, duplicate: false, flags };
}

/** After both ends exist: duration, units, plausibility, then queue for the aggregator. */
export async function finalize(ctx: EvvCtx, visit: EvvVisit): Promise<EvvVisit> {
  if (!visit.clockInAt || !visit.clockOutAt) return visit;
  const policy = await getPolicy(ctx, "MN");
  const durationMinutes = minutesBetween(visit.clockInAt, visit.clockOutAt);
  const units = unitsFor(visit.unitType ?? "fifteen_minute", visit.clockInAt, visit.clockOutAt);
  if (durationMinutes > policy.maxVisitMinutes || durationMinutes < policy.minVisitMinutes) await openException(ctx, visit.id, REASON.IMPLAUSIBLE_DURATION, `${durationMinutes} minutes.`, "warning");
  const next = await writer(ctx).update(schema.evvVisits, visit.id, { durationMinutes, units, resubmissionRequired: visit.evvRequired });
  await evvAudit(ctx, "visit.finalize", visit.id, { durationMinutes, units });
  if (next.evvRequired) {
    const { enqueueSubmission } = await import("./submission");
    await enqueueSubmission(ctx, next, "create");
  }
  return next;
}

/** Facts about the client, service and authorization that do not block the event but must be flagged. */
async function checkContext(ctx: EvvCtx, visit: EvvVisit, flags: string[]): Promise<void> {
  const [person] = await ctx.db.select({ status: schema.people.status }).from(schema.people).where(eq(schema.people.id, visit.personId)).limit(1);
  if (person && person.status !== "active") { await openException(ctx, visit.id, "CLIENT_NOT_ACTIVE", `Client status is ${person.status}.`); flags.push("CLIENT_NOT_ACTIVE"); }
  if (visit.serviceAgreementId && visit.serviceDate) {
    const [a] = await ctx.db.select().from(schema.serviceAgreements).where(eq(schema.serviceAgreements.id, visit.serviceAgreementId)).limit(1);
    if (a && (a.status !== "active" || a.startDate > visit.serviceDate || a.endDate < visit.serviceDate)) { await openException(ctx, visit.id, REASON.AUTHORIZATION_EXPIRED, `Agreement ${a.agreementNumber} is ${a.status}, ${a.startDate} to ${a.endDate}.`); flags.push(REASON.AUTHORIZATION_EXPIRED); }
  }
  const rules = await getRules(ctx);
  if (visit.serviceRuleId && !rules.find((r) => r.id === visit.serviceRuleId && r.active)) { await openException(ctx, visit.id, "SERVICE_RULE_INACTIVE", "The rule that classified this service is no longer active."); flags.push("SERVICE_RULE_INACTIVE"); }
}
