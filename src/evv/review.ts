/**
 * The admin review queue and the actions a reviewer takes on it. Every action is audited; none
 * of them deletes anything.
 */
import { and, asc, desc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { evvAudit } from "./audit";
import { getPolicy, writer, type EvvCtx } from "./context";
import { submissionDeadlineFor, localDate } from "./time";
import { EvvError, requireVisit } from "./visits";

export const queueFilterSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  personId: z.uuid().optional(),
  staffId: z.uuid().optional(),
  serviceCode: z.string().optional(),
  complianceStatus: z.enum(["COMPLIANT", "NONCOMPLIANT", "INCOMPLETE", "EXEMPT_LIVE_IN", "PENDING_REVIEW"]).optional(),
  submissionStatus: z.enum(["queued", "transmitting", "submitted", "accepted", "accepted_with_warning", "rejected", "retry_scheduled", "correction_required", "resubmitted", "permanently_failed", "blocked"]).optional(),
  exceptionType: z.string().optional(),
  payerId: z.uuid().optional(),
  billingId: z.string().optional(),
  manualOrCorrected: z.coerce.boolean().optional(),
  rejected: z.coerce.boolean().optional(),
  approachingDeadline: z.coerce.boolean().optional(),
  openExceptionsOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type QueueFilter = z.infer<typeof queueFilterSchema>;

export async function reviewQueue(ctx: EvvCtx, raw: unknown) {
  const f = queueFilterSchema.parse(raw);
  const v = schema.evvVisits;
  const conds = [eq(v.organizationId, ctx.orgId)];
  if (f.from) conds.push(gte(v.serviceDate, f.from));
  if (f.to) conds.push(lte(v.serviceDate, f.to));
  if (f.personId) conds.push(eq(v.personId, f.personId));
  if (f.staffId) conds.push(eq(v.staffId, f.staffId));
  if (f.serviceCode) conds.push(eq(v.serviceCode, f.serviceCode.toUpperCase()));
  if (f.complianceStatus) conds.push(eq(v.complianceStatus, f.complianceStatus));
  if (f.submissionStatus) conds.push(eq(v.submissionStatus, f.submissionStatus));
  if (f.payerId) conds.push(eq(v.payerId, f.payerId));
  if (f.billingId) conds.push(eq(v.billingId, f.billingId));
  if (f.manualOrCorrected) conds.push(or(eq(v.manualEntry, true), eq(v.corrected, true))!);
  if (f.rejected) conds.push(inArray(v.submissionStatus, ["rejected", "correction_required", "permanently_failed"]));
  if (f.exceptionType || f.openExceptionsOnly) {
    const e = schema.evvExceptions;
    const sub = ctx.db.select({ id: e.evvVisitId }).from(e).where(and(eq(e.organizationId, ctx.orgId), inArray(e.status, ["open", "acknowledged"]), ...(f.exceptionType ? [eq(e.type, f.exceptionType)] : [])));
    conds.push(inArray(v.id, sub));
  }
  let rows = await ctx.db.select().from(v).where(and(...conds)).orderBy(desc(v.serviceDate), desc(v.createdAt)).limit(f.approachingDeadline ? 5000 : f.limit).offset(f.approachingDeadline ? 0 : f.offset);
  const policy = await getPolicy(ctx, "MN");
  const today = localDate(ctx.now());
  const windowEnd = new Date(ctx.now().getTime() + policy.deadlineWarningDays * 86_400_000).toISOString().slice(0, 10);
  const withDeadline = rows.map((r) => ({ ...r, submissionDeadline: r.serviceDate ? submissionDeadlineFor(r.serviceDate, policy.submissionDeadlineDay) : null }));
  const filtered = f.approachingDeadline
    ? withDeadline.filter((r) => r.evvRequired && r.submissionDeadline && r.submissionDeadline <= windowEnd && !["accepted", "accepted_with_warning"].includes(r.submissionStatus ?? "")).slice(f.offset, f.offset + f.limit)
    : withDeadline;
  rows = filtered;
  const ids = filtered.map((r) => r.id);
  const exceptions = ids.length ? await ctx.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.organizationId, ctx.orgId), inArray(schema.evvExceptions.evvVisitId, ids), inArray(schema.evvExceptions.status, ["open", "acknowledged"]))).orderBy(asc(schema.evvExceptions.createdAt)) : [];
  return { items: filtered.map((r) => ({ ...r, exceptions: exceptions.filter((e) => e.evvVisitId === r.id), overdue: Boolean(r.submissionDeadline && r.submissionDeadline < today && !["accepted", "accepted_with_warning"].includes(r.submissionStatus ?? "")) })), count: filtered.length };
}

export async function markReviewed(ctx: EvvCtx, visitId: string, note?: string) {
  const visit = await requireVisit(ctx, visitId);
  const updated = await writer(ctx).update(schema.evvVisits, visit.id, { reviewedAt: ctx.now(), reviewedBy: ctx.actorUserId });
  await evvAudit(ctx, "visit.review", visit.id, { note: note?.slice(0, 200) ?? null });
  return updated;
}

export async function acknowledgeException(ctx: EvvCtx, exceptionId: string, resolve: boolean, note?: string) {
  const [e] = await ctx.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.id, exceptionId), eq(schema.evvExceptions.organizationId, ctx.orgId))).limit(1);
  if (!e) throw new EvvError(404, "EXCEPTION_NOT_FOUND", "Exception not found.");
  const updated = await writer(ctx).update(schema.evvExceptions, e.id, resolve ? { status: "resolved", resolvedAt: ctx.now(), resolvedBy: ctx.actorUserId, resolutionNote: note ?? null } : { status: "acknowledged", resolutionNote: note ?? e.resolutionNote });
  await evvAudit(ctx, resolve ? "exception.resolve" : "exception.acknowledge", e.evvVisitId, { exceptionId: e.id, type: e.type });
  return updated;
}

export async function assignException(ctx: EvvCtx, exceptionId: string, assigneeUserId: string) {
  const [e] = await ctx.db.select().from(schema.evvExceptions).where(and(eq(schema.evvExceptions.id, exceptionId), eq(schema.evvExceptions.organizationId, ctx.orgId))).limit(1);
  if (!e) throw new EvvError(404, "EXCEPTION_NOT_FOUND", "Exception not found.");
  const [u] = await ctx.db.select({ id: schema.users.id, active: schema.users.active }).from(schema.users).where(eq(schema.users.id, assigneeUserId)).limit(1);
  if (!u || !u.active) throw new EvvError(404, "USER_NOT_FOUND", "Assignee not found.");
  const updated = await writer(ctx).update(schema.evvExceptions, e.id, { assignedTo: assigneeUserId });
  await evvAudit(ctx, "exception.assign", e.evvVisitId, { exceptionId: e.id, assignedTo: assigneeUserId });
  return updated;
}

export async function addComment(ctx: EvvCtx, visitId: string, body: string) {
  if (!ctx.actorUserId) throw new EvvError(401, "ACTOR_REQUIRED", "Sign in to comment.");
  const visit = await requireVisit(ctx, visitId);
  const text = body?.trim();
  if (!text) throw new EvvError(422, "EMPTY", "Comment is empty.");
  const row = await writer(ctx).insert(schema.evvVisitComments, { organizationId: ctx.orgId, evvVisitId: visit.id, authorUserId: ctx.actorUserId, body: text.slice(0, 4000) });
  await evvAudit(ctx, "visit.comment", visit.id, { commentId: row.id });
  return row;
}

/** Marks the latest submission acknowledged by hand (e.g. after an out-of-band confirmation). */
export async function markAcknowledged(ctx: EvvCtx, visitId: string, externalReferenceId: string, note?: string) {
  const visit = await requireVisit(ctx, visitId);
  const [latest] = await ctx.db.select().from(schema.evvSubmissions).where(and(eq(schema.evvSubmissions.organizationId, ctx.orgId), eq(schema.evvSubmissions.evvVisitId, visit.id))).orderBy(desc(schema.evvSubmissions.createdAt)).limit(1);
  if (!latest) throw new EvvError(409, "NO_SUBMISSION", "Nothing has been submitted for this visit.");
  await writer(ctx).update(schema.evvSubmissions, latest.id, { status: "accepted", acknowledgedAt: ctx.now(), lastSuccessAt: ctx.now(), externalReferenceId, rejectionMessage: note ? `Manually acknowledged: ${note}` : "Manually acknowledged" });
  const updated = await writer(ctx).update(schema.evvVisits, visit.id, { submissionStatus: "accepted", externalReferenceId, resubmissionRequired: false });
  await evvAudit(ctx, "submission.manual_ack", visit.id, { submissionId: latest.id, externalReferenceId });
  return updated;
}

/** Full detail for one visit, with events (coordinates stay encrypted unless the caller reveals them). */
export async function visitDetail(ctx: EvvCtx, visitId: string) {
  const visit = await requireVisit(ctx, visitId);
  const [events, versions, corrections, exceptions, submissions, comments] = await Promise.all([
    ctx.db.select().from(schema.evvEvents).where(and(eq(schema.evvEvents.organizationId, ctx.orgId), eq(schema.evvEvents.evvVisitId, visit.id))).orderBy(schema.evvEvents.serverReceivedAt),
    ctx.db.select({ version: schema.evvVisitVersions.version, cause: schema.evvVisitVersions.cause, createdAt: schema.evvVisitVersions.createdAt, createdBy: schema.evvVisitVersions.createdBy }).from(schema.evvVisitVersions).where(eq(schema.evvVisitVersions.evvVisitId, visit.id)).orderBy(schema.evvVisitVersions.version),
    ctx.db.select().from(schema.evvCorrections).where(eq(schema.evvCorrections.evvVisitId, visit.id)).orderBy(schema.evvCorrections.correctedAt),
    ctx.db.select().from(schema.evvExceptions).where(eq(schema.evvExceptions.evvVisitId, visit.id)).orderBy(schema.evvExceptions.createdAt),
    ctx.db.select().from(schema.evvSubmissions).where(eq(schema.evvSubmissions.evvVisitId, visit.id)).orderBy(schema.evvSubmissions.createdAt),
    ctx.db.select().from(schema.evvVisitComments).where(eq(schema.evvVisitComments.evvVisitId, visit.id)).orderBy(schema.evvVisitComments.createdAt),
  ]);
  const policy = await getPolicy(ctx, "MN");
  return {
    visit: { ...visit, submissionDeadline: visit.serviceDate ? submissionDeadlineFor(visit.serviceDate, policy.submissionDeadlineDay) : null },
    events: events.map(({ locationEncrypted, ...e }) => ({ ...e, hasLocation: Boolean(locationEncrypted) })),
    versions, corrections, exceptions, submissions, comments,
    counts: { openExceptions: exceptions.filter((e) => e.status === "open").length, versions: versions.length, events: events.length },
  };
}
