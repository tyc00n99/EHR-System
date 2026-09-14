/**
 * Asynchronous, idempotent, retryable submission. Rows in evv_submissions are the queue; a cron
 * route drains it. Every attempt is written whether or not it got through, with a hash of the
 * payload rather than the payload. Transient failures back off exponentially with jitter until
 * the policy's attempt limit, then dead-letter into `permanently_failed` with an exception.
 * Validation rejections do not retry: they wait for a correction.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvSubmission, EvvVisit } from "@/db/schema";
import type { EvvAggregatorAdapter, Operation, SubmissionOutcome } from "./adapters/types";
import { evvAudit } from "./audit";
import { getPolicy, getProfile, writer, type EvvCtx } from "./context";
import { REASON } from "./types";
import { evaluateVisit, loadEvents, openException, requireVisit } from "./visits";

export const submissionKey = (visitId: string, version: number, operation: Operation) => `${visitId}:${version}:${operation}`;

/** Queues the visit's current version. Repeating the call for the same version is a no-op. */
export async function enqueueSubmission(ctx: EvvCtx, visit: EvvVisit, operation: Operation, aggregator = "hhax_mn"): Promise<EvvSubmission> {
  const key = submissionKey(visit.id, visit.version, operation);
  const [existing] = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.idempotencyKey, key))).limit(1);
  if (existing) return existing;
  const [prior] = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.evvVisitId, visit.id))).orderBy(desc(schema.evvSubmissions.createdAt)).limit(1);
  const env = (process.env.EVV_AGGREGATOR_ADAPTER ?? "mock").toLowerCase() === "hhax_mn" ? ((process.env.HHAX_ENVIRONMENT ?? "off").toLowerCase() === "production" ? "production" : "sandbox") : "mock";
  const row = await writer(ctx).insert(schema.evvSubmissions, { organizationId: ctx.orgId, evvVisitId: visit.id, aggregator, environment: env, visitVersion: visit.version, idempotencyKey: key, status: "queued", nextAttemptAt: ctx.now(), resubmissionOf: prior?.id ?? null, operation });
  if (prior && ["accepted", "accepted_with_warning", "rejected", "correction_required", "permanently_failed", "submitted"].includes(prior.status)) {
    await writer(ctx).update(schema.evvSubmissions, prior.id, { status: "resubmitted" });
  }
  await writer(ctx).update(schema.evvVisits, visit.id, { submissionStatus: "queued" });
  await evvAudit(ctx, "submission.queue", visit.id, { submissionId: row.id, operation, version: visit.version, environment: env });
  return row;
}

/** Exponential backoff with ±25% jitter, capped. `random` is injectable for tests. */
export function backoffSeconds(attempt: number, base: number, max: number, random: () => number = Math.random): number {
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = 1 + (random() * 0.5 - 0.25);
  return Math.max(1, Math.round(raw * jitter));
}

async function recordAttempt(ctx: EvvCtx, s: EvvSubmission, attempt: number, outcome: SubmissionOutcome | { kind: "error"; message: string }, payloadHash: string | null): Promise<void> {
  const base = { organizationId: ctx.orgId, submissionId: s.id, attempt, finishedAt: ctx.now(), payloadHash };
  if (outcome.kind === "accepted") await ctx.db.insert(schema.evvSubmissionAttempts).values({ ...base, outcome: "accepted", transportResult: outcome.transport, message: outcome.warnings.join("; ") || null });
  else if (outcome.kind === "pending") await ctx.db.insert(schema.evvSubmissionAttempts).values({ ...base, outcome: "pending", transportResult: outcome.transport });
  else if (outcome.kind === "rejected") await ctx.db.insert(schema.evvSubmissionAttempts).values({ ...base, outcome: "rejected", transportResult: outcome.transport, rejectionCategory: outcome.rejection.category, vendorCode: outcome.rejection.vendorCode, message: outcome.rejection.message.slice(0, 500) });
  else if (outcome.kind === "blocked") await ctx.db.insert(schema.evvSubmissionAttempts).values({ ...base, outcome: "blocked", rejectionCategory: "configuration", message: outcome.reason.slice(0, 500) });
  else await ctx.db.insert(schema.evvSubmissionAttempts).values({ ...base, outcome: "error", message: outcome.message.slice(0, 500) });
}

/** One delivery attempt for one submission. Safe to call twice: a finished submission is skipped. */
export async function processSubmission(ctx: EvvCtx, adapter: EvvAggregatorAdapter, submissionId: string, random: () => number = Math.random): Promise<EvvSubmission> {
  const [s] = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.id, submissionId), eq(schema.evvSubmissions.organizationId, ctx.orgId))).limit(1);
  if (!s) throw new Error("Submission not found.");
  if (!["queued", "retry_scheduled", "blocked"].includes(s.status)) return s;
  const policy = await getPolicy(ctx, "MN");
  const visit = await requireVisit(ctx, s.evvVisitId);
  const attempt = s.attemptCount + 1;
  const claimed = await writer(ctx).update(schema.evvSubmissions, s.id, { status: "transmitting", attemptCount: attempt, lastAttemptAt: ctx.now() });
  await writer(ctx).update(schema.evvVisits, visit.id, { submissionStatus: "transmitting" });

  const events = await loadEvents(ctx, visit.id);
  const [caregiver] = await ctx.db.select({ npi: schema.staff.npi, umpi: schema.staff.umpi }).from(schema.staff).where(eq(schema.staff.id, visit.staffId)).limit(1);
  const { profile } = await getProfile(ctx);
  const operation = s.operation as Operation;
  const payload = adapter.transform(visit, { clockIn: events.find((e) => e.id === visit.clockInEventId) ?? null, clockOut: events.find((e) => e.id === visit.clockOutEventId) ?? null }, { aggregatorProviderId: profile.hhaxProviderId, caregiver: { npi: caregiver?.npi ?? null, umpi: caregiver?.umpi ?? null } }, operation);
  const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

  const valid = adapter.validate(payload);
  let outcome: SubmissionOutcome | { kind: "error"; message: string };
  if (!valid.ok) outcome = { kind: "rejected", rejection: { category: "validation", vendorCode: null, message: `Outbound validation failed: ${valid.errors.join(", ")}`, retryable: false }, transport: "local validation" };
  else {
    try { outcome = operation === "void" ? await adapter.voidVisit(payload) : operation === "update" ? await adapter.update(payload) : await adapter.submit(payload); }
    catch (e) { outcome = { kind: "error", message: e instanceof Error ? e.message : "Transport error" }; }
  }
  await recordAttempt(ctx, claimed, attempt, outcome, payloadHash);

  let patch: Partial<EvvSubmission> = {};
  let visitStatus: EvvVisit["submissionStatus"] = "submitted";
  let externalReferenceId = visit.externalReferenceId;
  if (outcome.kind === "accepted") {
    patch = { status: outcome.warnings.length ? "accepted_with_warning" : "accepted", externalReferenceId: outcome.externalReferenceId, acknowledgedAt: ctx.now(), lastSuccessAt: ctx.now(), transportResult: outcome.transport, warnings: outcome.warnings, nextAttemptAt: null, rejectionCategory: null, vendorRejectionCode: null, rejectionMessage: null };
    visitStatus = patch.status!;
    externalReferenceId = outcome.externalReferenceId;
  } else if (outcome.kind === "pending") {
    patch = { status: "submitted", externalReferenceId: outcome.externalReferenceId ?? s.externalReferenceId, transportResult: outcome.transport, nextAttemptAt: null };
    visitStatus = "submitted";
    externalReferenceId = outcome.externalReferenceId ?? externalReferenceId;
  } else if (outcome.kind === "blocked") {
    patch = { status: "blocked", transportResult: null, rejectionCategory: "configuration", rejectionMessage: outcome.reason, nextAttemptAt: null };
    visitStatus = "blocked";
    await openException(ctx, visit.id, "SUBMISSION_BLOCKED", outcome.reason, "warning");
  } else {
    const rejection = outcome.kind === "rejected" ? outcome.rejection : { category: "transient" as const, vendorCode: null, message: outcome.message, retryable: true };
    const retryable = rejection.retryable && rejection.category !== "validation";
    if (retryable && attempt < policy.maxSubmissionAttempts) {
      const wait = backoffSeconds(attempt, policy.retryBaseSeconds, policy.retryMaxSeconds, random);
      patch = { status: "retry_scheduled", nextAttemptAt: new Date(ctx.now().getTime() + wait * 1000), rejectionCategory: rejection.category, vendorRejectionCode: rejection.vendorCode, rejectionMessage: rejection.message, transportResult: outcome.kind === "rejected" ? outcome.transport : null };
      visitStatus = "retry_scheduled";
    } else if (retryable) {
      patch = { status: "permanently_failed", nextAttemptAt: null, rejectionCategory: rejection.category, vendorRejectionCode: rejection.vendorCode, rejectionMessage: rejection.message };
      visitStatus = "permanently_failed";
      await openException(ctx, visit.id, "SUBMISSION_DEAD_LETTER", `Gave up after ${attempt} attempts: ${rejection.message}`, "error");
    } else {
      patch = { status: rejection.category === "validation" ? "correction_required" : "rejected", nextAttemptAt: null, rejectionCategory: rejection.category, vendorRejectionCode: rejection.vendorCode, rejectionMessage: rejection.message, transportResult: outcome.kind === "rejected" ? outcome.transport : null };
      visitStatus = patch.status!;
      await openException(ctx, visit.id, REASON.AGGREGATOR_REJECTION, `${rejection.category}${rejection.vendorCode ? ` ${rejection.vendorCode}` : ""}: ${rejection.message}`, "error");
    }
  }
  const updated = await writer(ctx).update(schema.evvSubmissions, s.id, patch);
  await writer(ctx).update(schema.evvVisits, visit.id, { submissionStatus: visitStatus, externalReferenceId, resubmissionRequired: outcome.kind === "accepted" ? false : visit.resubmissionRequired });
  await evvAudit(ctx, "submission.attempt", visit.id, { submissionId: s.id, attempt, outcome: outcome.kind, status: updated.status, category: updated.rejectionCategory ?? null });
  if (outcome.kind === "accepted" || outcome.kind === "rejected") await evaluateVisit(ctx, visit.id);
  return updated;
}

/** Drains due submissions for the tenant. Returns what happened, without PHI. */
export async function processQueue(ctx: EvvCtx, adapter: EvvAggregatorAdapter, limit = 50, random: () => number = Math.random): Promise<{ processed: number; byStatus: Record<string, number> }> {
  const due = await ctx.db.select({ id: schema.evvSubmissions.id }).from(schema.evvSubmissions)
    .where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), inArray(schema.evvSubmissions.status, ["queued", "retry_scheduled"]), or(lte(schema.evvSubmissions.nextAttemptAt, ctx.now()), eq(schema.evvSubmissions.status, "queued"))))
    .orderBy(schema.evvSubmissions.nextAttemptAt).limit(limit);
  const byStatus: Record<string, number> = {};
  for (const d of due) { const r = await processSubmission(ctx, adapter, d.id, random); byStatus[r.status] = (byStatus[r.status] ?? 0) + 1; }
  return { processed: due.length, byStatus };
}

/** A reviewer asks for another try. Queues the current version, whatever the last outcome was. */
export async function resubmitVisit(ctx: EvvCtx, visitId: string): Promise<EvvSubmission> {
  const visit = await requireVisit(ctx, visitId);
  const latest = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.evvVisitId, visit.id))).orderBy(desc(schema.evvSubmissions.createdAt)).limit(1).then((r) => r[0] ?? null);
  const operation: Operation = visit.status === "voided" ? "void" : latest?.externalReferenceId || visit.externalReferenceId ? "update" : "create";
  const key = submissionKey(visit.id, visit.version, operation);
  if (latest && latest.idempotencyKey === key && ["queued", "retry_scheduled", "transmitting"].includes(latest.status)) return latest;
  if (latest && latest.idempotencyKey === key) {
    // Same version, terminal outcome: re-open it rather than mint a new row so the chain stays one per version.
    const reopened = await writer(ctx).update(schema.evvSubmissions, latest.id, { status: "queued", nextAttemptAt: ctx.now() });
    await writer(ctx).update(schema.evvVisits, visit.id, { submissionStatus: "queued" });
    await evvAudit(ctx, "submission.resubmit", visit.id, { submissionId: latest.id, reopened: true });
    return reopened;
  }
  const row = await enqueueSubmission(ctx, visit, operation);
  await evvAudit(ctx, "submission.resubmit", visit.id, { submissionId: row.id });
  return row;
}
