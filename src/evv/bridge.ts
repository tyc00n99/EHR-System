/**
 * Bridges the host app's existing clock-in / clock-out / manual-entry / edit / void flows into the
 * EVV domain, so a caregiver using the web clock today produces the same canonical records the
 * mobile app will. The 245D note (`visits`) stays the note; the EVV visit shares its id and
 * links back through `visitId`. A failure here is logged without PHI and never blocks the note.
 */
import { getDb } from "@/db";
import type { Visit } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth";
import { defaultOrganizationId, makeCtx } from "./context";
import { correctVisit, voidVisit } from "./corrections";
import { clockIn, clockOut, type ClockEventInput } from "./ingest";
import { derivedEventId } from "./shared-care";
import { utcOffsetMinutes } from "./time";
import { loadVisit } from "./visits";

async function ctxFor(user: CurrentUser) {
  const db = await getDb();
  return makeCtx(db, await defaultOrganizationId(db), user.id);
}

const safely = async (what: string, fn: () => Promise<unknown>) => {
  try { await fn(); } catch (e) { console.warn(`evv bridge ${what} skipped:`, e instanceof Error ? e.message : "unknown"); }
};

const locationTypeFor = (placeOfService: string): ClockEventInput["locationType"] => (placeOfService === "12" ? "home" : "community");

function event(visitId: string, kind: "clock_in" | "clock_out", at: Date, fix: { lat?: number | null; lng?: number | null; accuracy?: number | null }, placeOfService: string, method: ClockEventInput["verificationMethod"], manualReason?: string): ClockEventInput {
  return {
    eventId: derivedEventId(visitId, kind), idempotencyKey: `web:${visitId}:${kind}`, deviceCapturedAt: at.toISOString(), deviceUtcOffsetMinutes: utcOffsetMinutes(at),
    latitude: fix.lat ?? undefined, longitude: fix.lng ?? undefined, accuracyMeters: fix.accuracy ?? undefined, locationSource: fix.lat != null ? "gps" : "none",
    locationType: locationTypeFor(placeOfService), verificationMethod: method, offline: false, metadata: { channel: "web" }, manualReason,
  };
}

/** After the web clock-in wrote its `visits` row. */
export function mirrorClockIn(row: Visit, user: CurrentUser) {
  return safely("clock-in", async () => {
    const ctx = await ctxFor(user);
    await clockIn(ctx, row.id, event(row.id, "clock_in", row.clockInAt, { lat: row.clockInLat, lng: row.clockInLng, accuracy: row.clockInAccuracyM }, row.placeOfService, "mobile"), { userId: user.id, staffId: row.staffId, role: user.role },
      { personId: row.personId, serviceAgreementId: row.serviceAgreementId, shiftId: row.shiftId, visitId: row.id, staffId: row.staffId });
  });
}

/** After the web clock-out updated the `visits` row. */
export function mirrorClockOut(row: Visit, user: CurrentUser) {
  return safely("clock-out", async () => {
    if (!row.clockOutAt) return;
    const ctx = await ctxFor(user);
    if (!(await loadVisit(ctx, row.id))) await mirrorClockIn(row, user);
    await clockOut(ctx, row.id, event(row.id, "clock_out", row.clockOutAt, { lat: row.clockOutLat, lng: row.clockOutLng, accuracy: row.clockOutAccuracyM }, row.placeOfService, "mobile"), { userId: user.id, staffId: row.staffId, role: user.role });
  });
}

/** A supervisor keyed the whole visit in: both events are manual, and say so. */
export function mirrorManualVisit(row: Visit, user: CurrentUser) {
  return safely("manual visit", async () => {
    const ctx = await ctxFor(user);
    const reason = row.manualEntryReason ?? "Manual entry";
    const actor = { userId: user.id, staffId: row.staffId, role: user.role };
    await clockIn(ctx, row.id, event(row.id, "clock_in", row.clockInAt, { lat: row.clockInLat, lng: row.clockInLng, accuracy: row.clockInAccuracyM }, row.placeOfService, "manual", reason), actor, { personId: row.personId, serviceAgreementId: row.serviceAgreementId, visitId: row.id, staffId: row.staffId });
    if (row.clockOutAt) await clockOut(ctx, row.id, event(row.id, "clock_out", row.clockOutAt, { lat: row.clockOutLat, lng: row.clockOutLng, accuracy: row.clockOutAccuracyM }, row.placeOfService, "manual", reason), actor);
  });
}

/** A supervisor edited times or place on the note: the EVV visit gets a correction with the same reason. */
export function mirrorEdit(visitId: string, user: CurrentUser, reason: string, changes: Record<string, { from: unknown; to: unknown }>) {
  return safely("edit", async () => {
    const ctx = await ctxFor(user);
    const evv = await loadVisit(ctx, visitId);
    if (!evv) return;
    const patch: Record<string, unknown> = {};
    if (changes.clockInAt) patch.clockInAt = new Date(changes.clockInAt.to as Date).toISOString();
    if (changes.clockOutAt) patch.clockOutAt = new Date(changes.clockOutAt.to as Date).toISOString();
    if (changes.placeOfService) patch.locationType = locationTypeFor(String(changes.placeOfService.to));
    if (!Object.keys(patch).length) return;
    await correctVisit(ctx, visitId, { reasonCode: "SUPERVISOR_REVIEW", explanation: reason.length >= 10 ? reason : `${reason} (edited on the 245D note)`, changes: patch });
  });
}

export function mirrorVoid(visitId: string, user: CurrentUser, reason: string) {
  return safely("void", async () => {
    const ctx = await ctxFor(user);
    if (await loadVisit(ctx, visitId)) await voidVisit(ctx, visitId, reason);
  });
}
