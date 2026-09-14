/**
 * Corrections. Nothing is overwritten: the prior version stays in evv_visit_versions, the
 * original events stay in evv_events, and the correction row holds from/to for every field with
 * the reason and who made it. A corrected visit is, by Minnesota's policy, noncompliant unless an
 * exemption applies — that is the engine's call, made on re-evaluation.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { EvvVisit } from "@/db/schema";
import { evvAudit } from "./audit";
import { writer, type EvvCtx } from "./context";
import { localDate, minutesBetween } from "./time";
import { CORRECTABLE_FIELDS, CORRECTION_REASONS, REASON } from "./types";
import { unitsFor } from "./units";
import { applyVersion, evaluateVisit, EvvError, requireVisit } from "./visits";

export const correctionSchema = z.object({
  reasonCode: z.enum(CORRECTION_REASONS),
  explanation: z.string().min(10, "Explain the correction in at least a sentence").max(2000),
  changes: z.object({
    clockInAt: z.string().datetime({ offset: true }).optional(),
    clockOutAt: z.string().datetime({ offset: true }).optional(),
    locationType: z.enum(["home", "community", "alternate", "protected"]).optional(),
    serviceCode: z.string().min(4).max(6).optional(),
    modifiers: z.array(z.string().length(2)).max(4).optional(),
    staffId: z.uuid().optional(),
    personId: z.uuid().optional(),
    serviceAgreementId: z.uuid().optional(),
    verificationMethod: z.enum(["mobile", "ivr", "fob", "live_in", "manual", "other"]).optional(),
  }).refine((c) => Object.keys(c).length > 0, "Nothing to correct"),
});
export type CorrectionInput = z.infer<typeof correctionSchema>;

export async function correctVisit(ctx: EvvCtx, visitId: string, raw: unknown): Promise<{ visit: EvvVisit; correction: schema.EvvCorrection }> {
  const input = correctionSchema.parse(raw);
  const visit = await requireVisit(ctx, visitId);
  if (visit.status === "voided") throw new EvvError(409, "VISIT_VOIDED", "A voided visit cannot be corrected. Un-void it first.");
  if (!ctx.actorUserId) throw new EvvError(401, "ACTOR_REQUIRED", "A signed-in user must make corrections.");

  const patch: Partial<EvvVisit> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of CORRECTABLE_FIELDS) {
    const to = input.changes[field];
    if (to === undefined) continue;
    const from = visit[field];
    let value: unknown = to;
    if (field === "clockInAt" || field === "clockOutAt") value = new Date(to as string);
    if (field === "serviceCode") value = String(to).toUpperCase();
    if (field === "modifiers") value = (to as string[]).map((m) => m.toUpperCase());
    if (JSON.stringify(from instanceof Date ? from.toISOString() : from) === JSON.stringify(value instanceof Date ? value.toISOString() : value)) continue;
    changes[field] = { from: from instanceof Date ? from.toISOString() : from, to: value instanceof Date ? value.toISOString() : value };
    (patch as Record<string, unknown>)[field] = value;
  }
  if (!Object.keys(changes).length) throw new EvvError(422, "NO_CHANGE", "The correction changes nothing.");

  const clockInAt = patch.clockInAt ?? visit.clockInAt;
  const clockOutAt = patch.clockOutAt ?? visit.clockOutAt;
  if (clockInAt && clockOutAt && clockOutAt <= clockInAt) throw new EvvError(422, "CLOCK_ORDER", "Clock-out must be after clock-in.");
  if (patch.clockInAt) patch.serviceDate = localDate(patch.clockInAt, visit.timeZone);
  if (clockInAt && clockOutAt) { patch.durationMinutes = minutesBetween(clockInAt, clockOutAt); patch.units = unitsFor(visit.unitType ?? "fifteen_minute", clockInAt, clockOutAt); }
  if (patch.personId) {
    const [p] = await ctx.db.select({ pmi: schema.people.pmi }).from(schema.people).where(eq(schema.people.id, patch.personId)).limit(1);
    if (!p) throw new EvvError(404, "CLIENT_NOT_FOUND", "Client not found.");
    patch.memberId = p.pmi;
  }
  patch.corrected = true;
  patch.resubmissionRequired = visit.evvRequired;
  if (patch.verificationMethod === "manual") patch.manualEntry = true;

  const next = await applyVersion(ctx, visit, patch, "correction", null);
  const correction = await writer(ctx).insert(schema.evvCorrections, {
    organizationId: ctx.orgId, evvVisitId: visit.id, priorVersion: visit.version, resultingVersion: next.version, changes,
    reasonCode: input.reasonCode, explanation: input.explanation, correctedBy: ctx.actorUserId, makesNoncompliant: !visit.liveIn, resubmissionRequired: visit.evvRequired,
  });
  await evvAudit(ctx, "visit.correct", visit.id, { fields: Object.keys(changes), reasonCode: input.reasonCode, priorVersion: visit.version, resultingVersion: next.version });
  const evaluated = await evaluateVisit(ctx, visit.id);
  if (evaluated.evvRequired && evaluated.status === "completed") {
    const { enqueueSubmission } = await import("./submission");
    await enqueueSubmission(ctx, evaluated, "update");
  }
  return { visit: evaluated, correction };
}

/** Reversible administrative void. The row, its events and versions stay; the aggregator is told. */
export async function voidVisit(ctx: EvvCtx, visitId: string, reason: string): Promise<EvvVisit> {
  if (!reason?.trim() || reason.trim().length < 5) throw new EvvError(422, "REASON_REQUIRED", "A reason is required to void a visit.");
  const visit = await requireVisit(ctx, visitId);
  if (visit.status === "voided") return visit;
  const next = await applyVersion(ctx, visit, { status: "voided", voidedAt: ctx.now(), voidedBy: ctx.actorUserId, voidReason: reason.trim(), resubmissionRequired: visit.evvRequired && Boolean(visit.externalReferenceId) }, "void", null);
  await evvAudit(ctx, "visit.void", visit.id, { priorStatus: visit.status });
  if (next.externalReferenceId) {
    const { enqueueSubmission } = await import("./submission");
    await enqueueSubmission(ctx, next, "void");
  }
  return evaluateVisit(ctx, visit.id);
}

export async function unvoidVisit(ctx: EvvCtx, visitId: string, reason: string): Promise<EvvVisit> {
  if (!reason?.trim()) throw new EvvError(422, "REASON_REQUIRED", "A reason is required.");
  const visit = await requireVisit(ctx, visitId);
  if (visit.status !== "voided") return visit;
  const status: EvvVisit["status"] = visit.clockOutEventId && visit.clockInEventId ? "completed" : visit.clockInEventId ? "in_progress" : visit.clockOutEventId ? "awaiting_clock_in" : "planned";
  const next = await applyVersion(ctx, visit, { status, voidedAt: null, voidedBy: null, voidReason: null, resubmissionRequired: visit.evvRequired }, "unvoid", null);
  await evvAudit(ctx, "visit.unvoid", visit.id, { reason: REASON.VOIDED, note: reason.slice(0, 200) });
  return evaluateVisit(ctx, next.id);
}
