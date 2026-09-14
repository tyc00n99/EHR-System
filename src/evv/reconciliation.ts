/**
 * Reconciliation: turning what the aggregator has said (or failed to say) into submission and
 * visit state, and finding the visits nobody has heard about. Runs from a cron route; every pass
 * is idempotent and returns counts only.
 */
import { and, eq, inArray, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvAggregatorAdapter } from "./adapters/types";
import { evvAudit } from "./audit";
import { getPolicy, writer, type EvvCtx } from "./context";
import { enqueueSubmission } from "./submission";
import { localDate, submissionDeadlineFor } from "./time";
import { REASON } from "./types";
import { evaluateVisit, openException } from "./visits";

export interface ReconcileSummary { acknowledged: number; rejected: number; stuck: number; requeued: number; deadlineWarnings: number; blockedRetried: number }

/** Visits whose monthly deadline is within the policy's warning window and that are not yet accepted. */
export async function visitsApproachingDeadline(ctx: EvvCtx, now = ctx.now()) {
  const policy = await getPolicy(ctx, "MN");
  const today = localDate(now);
  const rows = await ctx.db.select().from(schema.evvVisits).where(and(
    eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.evvRequired, true), ne(schema.evvVisits.status, "voided"), isNotNull(schema.evvVisits.serviceDate),
    or(isNull(schema.evvVisits.submissionStatus), inArray(schema.evvVisits.submissionStatus, ["queued", "transmitting", "submitted", "rejected", "retry_scheduled", "correction_required", "permanently_failed", "blocked"])),
  ));
  const windowEnd = new Date(now.getTime() + policy.deadlineWarningDays * 86_400_000).toISOString().slice(0, 10);
  return rows.map((v) => ({ visit: v, deadline: submissionDeadlineFor(v.serviceDate!, policy.submissionDeadlineDay) })).filter((x) => x.deadline <= windowEnd && x.deadline >= today || x.deadline < today);
}

export async function reconcile(ctx: EvvCtx, adapter: EvvAggregatorAdapter): Promise<ReconcileSummary> {
  const policy = await getPolicy(ctx, "MN");
  const now = ctx.now();
  const summary: ReconcileSummary = { acknowledged: 0, rejected: 0, stuck: 0, requeued: 0, deadlineWarnings: 0, blockedRetried: 0 };

  // 1. Submitted, awaiting an acknowledgment.
  const awaiting = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.status, "submitted")));
  for (const s of awaiting) {
    if (!s.externalReferenceId) continue;
    const ack = await adapter.checkAcknowledgment(s.externalReferenceId);
    if (ack.kind === "accepted") {
      await writer(ctx).update(schema.evvSubmissions, s.id, { status: ack.warnings.length ? "accepted_with_warning" : "accepted", acknowledgedAt: now, lastSuccessAt: now, warnings: ack.warnings });
      await writer(ctx).update(schema.evvVisits, s.evvVisitId, { submissionStatus: ack.warnings.length ? "accepted_with_warning" : "accepted", resubmissionRequired: false });
      await evvAudit(ctx, "submission.acknowledged", s.evvVisitId, { submissionId: s.id }); summary.acknowledged++;
      await evaluateVisit(ctx, s.evvVisitId);
    } else if (ack.kind === "rejected") {
      const status = ack.rejection.category === "validation" ? "correction_required" : "rejected";
      await writer(ctx).update(schema.evvSubmissions, s.id, { status, acknowledgedAt: now, rejectionCategory: ack.rejection.category, vendorRejectionCode: ack.rejection.vendorCode, rejectionMessage: ack.rejection.message });
      await writer(ctx).update(schema.evvVisits, s.evvVisitId, { submissionStatus: status });
      await openException(ctx, s.evvVisitId, REASON.AGGREGATOR_REJECTION, ack.rejection.message, "error");
      await evvAudit(ctx, "submission.rejected_on_ack", s.evvVisitId, { submissionId: s.id, category: ack.rejection.category }); summary.rejected++;
      await evaluateVisit(ctx, s.evvVisitId);
    } else if (s.lastAttemptAt && now.getTime() - s.lastAttemptAt.getTime() > policy.ackTimeoutHours * 3_600_000) {
      await openException(ctx, s.evvVisitId, "ACK_TIMEOUT", `No acknowledgment ${policy.ackTimeoutHours} hours after submission.`, "warning"); summary.stuck++;
    }
  }

  // 2. Transmitting rows abandoned mid-flight (a crashed worker): put them back in the queue.
  const cutoff = new Date(now.getTime() - 30 * 60_000);
  const abandoned = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.status, "transmitting"), lt(schema.evvSubmissions.lastAttemptAt, cutoff)));
  for (const s of abandoned) { await writer(ctx).update(schema.evvSubmissions, s.id, { status: "retry_scheduled", nextAttemptAt: now }); await evvAudit(ctx, "submission.requeue_abandoned", s.evvVisitId, { submissionId: s.id }); summary.requeued++; }

  // 3. Blocked by configuration: retry once configuration reports healthy.
  const health = await adapter.health();
  if (health.ok) {
    const blocked = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.status, "blocked")));
    for (const s of blocked) { await writer(ctx).update(schema.evvSubmissions, s.id, { status: "queued", nextAttemptAt: now }); summary.blockedRetried++; }
  }

  // 4. Completed, EVV-required visits with no submission at all for their current version.
  const unsent = await ctx.db.select().from(schema.evvVisits).where(and(eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.evvRequired, true), eq(schema.evvVisits.status, "completed"), eq(schema.evvVisits.resubmissionRequired, true), isNull(schema.evvVisits.submissionStatus)));
  for (const v of unsent) { await enqueueSubmission(ctx, v, v.externalReferenceId ? "update" : "create"); summary.requeued++; }

  // 5. Approaching the monthly deadline.
  for (const { visit, deadline } of await visitsApproachingDeadline(ctx, now)) {
    await openException(ctx, visit.id, "DEADLINE_APPROACHING", `Must be accepted by ${deadline}.`, deadline < localDate(now) ? "error" : "warning"); summary.deadlineWarnings++;
  }
  await evvAudit(ctx, "reconcile.run", null, { ...summary });
  return summary;
}
