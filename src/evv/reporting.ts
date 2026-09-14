/**
 * Compliance reporting. Everything here is EVVora's own arithmetic over its own records and is
 * labelled as an estimate: the official determination is DHS's, made from what the aggregator
 * holds, across every identifier on the tax ID.
 */
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { schema } from "@/db";
import { getPolicy, type EvvCtx } from "./context";
import { visitsApproachingDeadline } from "./reconciliation";
import { REASON_LABEL, type ReasonCode } from "./types";

export interface ComplianceSummary {
  label: "Estimated internal compliance rate — not the official DHS determination";
  range: { from: string; to: string };
  totals: { evvRequired: number; complete: number; compliant: number; noncompliant: number; incomplete: number; exemptLiveIn: number; pendingReview: number; manualOrCorrected: number; accepted: number; rejected: number; unsubmitted: number };
  estimatedCompliancePercent: number | null;
  byCaregiver: { staffId: string; name: string; required: number; compliant: number; percent: number | null }[];
  byService: { serviceCode: string; modifiers: string; required: number; compliant: number; percent: number | null }[];
  byBillingId: { billingIdType: string | null; billingId: string | null; required: number; compliant: number; percent: number | null }[];
  topExceptionReasons: { type: string; label: string; count: number }[];
  approachingDeadline: { count: number; deadlineDay: number; warningDays: number; visits: { id: string; serviceDate: string | null; deadline: string; submissionStatus: string | null }[] };
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const counts = (status: string) => status === "COMPLIANT" || status === "EXEMPT_LIVE_IN";

export async function complianceSummary(ctx: EvvCtx, from: string, to: string): Promise<ComplianceSummary> {
  const v = schema.evvVisits;
  const rows = await ctx.db.select({ visit: v, first: schema.staff.firstName, last: schema.staff.lastName }).from(v).innerJoin(schema.staff, eq(v.staffId, schema.staff.id))
    .where(and(eq(v.organizationId, ctx.orgId), gte(v.serviceDate, from), lte(v.serviceDate, to), ne(v.status, "voided")));
  const required = rows.filter((r) => r.visit.evvRequired);
  const complete = required.filter((r) => r.visit.status === "completed");
  const t = {
    evvRequired: required.length, complete: complete.length,
    compliant: required.filter((r) => r.visit.complianceStatus === "COMPLIANT").length,
    noncompliant: required.filter((r) => r.visit.complianceStatus === "NONCOMPLIANT").length,
    incomplete: required.filter((r) => r.visit.complianceStatus === "INCOMPLETE").length,
    exemptLiveIn: required.filter((r) => r.visit.complianceStatus === "EXEMPT_LIVE_IN").length,
    pendingReview: required.filter((r) => r.visit.complianceStatus === "PENDING_REVIEW").length,
    manualOrCorrected: required.filter((r) => r.visit.manualEntry || r.visit.corrected).length,
    accepted: required.filter((r) => r.visit.submissionStatus === "accepted" || r.visit.submissionStatus === "accepted_with_warning").length,
    rejected: required.filter((r) => ["rejected", "correction_required", "permanently_failed"].includes(r.visit.submissionStatus ?? "")).length,
    unsubmitted: complete.filter((r) => !r.visit.submissionStatus || ["queued", "retry_scheduled", "blocked"].includes(r.visit.submissionStatus)).length,
  };
  const group = <K extends string>(key: (r: (typeof rows)[number]) => K, extra: (r: (typeof rows)[number]) => Record<string, unknown>) => {
    const m = new Map<K, { required: number; compliant: number; extra: Record<string, unknown> }>();
    for (const r of complete) { const k = key(r); const g = m.get(k) ?? { required: 0, compliant: 0, extra: extra(r) }; g.required++; if (counts(r.visit.complianceStatus)) g.compliant++; m.set(k, g); }
    return [...m.values()].map((g) => ({ ...g.extra, required: g.required, compliant: g.compliant, percent: pct(g.compliant, g.required) }));
  };
  const openEx = complete.length ? await ctx.db.select({ type: schema.evvExceptions.type }).from(schema.evvExceptions).where(and(eq(schema.evvExceptions.organizationId, ctx.orgId), eq(schema.evvExceptions.status, "open"))) : [];
  const reasonCounts = new Map<string, number>();
  for (const r of required) for (const reason of r.visit.complianceReasons) reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  for (const e of openEx) if (!reasonCounts.has(e.type)) reasonCounts.set(e.type, 0);
  const policy = await getPolicy(ctx, "MN");
  const deadline = await visitsApproachingDeadline(ctx);
  return {
    label: "Estimated internal compliance rate — not the official DHS determination",
    range: { from, to }, totals: t,
    estimatedCompliancePercent: pct(t.compliant + t.exemptLiveIn, complete.length),
    byCaregiver: group((r) => r.visit.staffId, (r) => ({ staffId: r.visit.staffId, name: `${r.first} ${r.last}` })) as ComplianceSummary["byCaregiver"],
    byService: group((r) => `${r.visit.serviceCode} ${r.visit.modifiers.join(" ")}`, (r) => ({ serviceCode: r.visit.serviceCode, modifiers: r.visit.modifiers.join(" ") })) as ComplianceSummary["byService"],
    byBillingId: group((r) => `${r.visit.billingIdType}:${r.visit.billingId}`, (r) => ({ billingIdType: r.visit.billingIdType, billingId: r.visit.billingId })) as ComplianceSummary["byBillingId"],
    topExceptionReasons: [...reasonCounts.entries()].filter(([k]) => k !== "EVV_NOT_REQUIRED").sort((a, b) => b[1] - a[1]).slice(0, 10).map(([type, count]) => ({ type, label: REASON_LABEL[type as ReasonCode] ?? type, count })),
    approachingDeadline: { count: deadline.length, deadlineDay: policy.submissionDeadlineDay, warningDays: policy.deadlineWarningDays, visits: deadline.slice(0, 100).map((d) => ({ id: d.visit.id, serviceDate: d.visit.serviceDate, deadline: d.deadline, submissionStatus: d.visit.submissionStatus })) },
  };
}
