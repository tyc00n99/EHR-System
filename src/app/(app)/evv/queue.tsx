import { COMPLIANCE, currentView, QUEUE_VIEW_LABEL, SUBMISSION, SUBMISSION_GROUPS, type QueueView, type SubmissionGroup } from "@/evv/labels";
import { Info } from "lucide-react";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, shiftPayPeriod, type PayRule } from "@/lib/pay-period";
import { isoDay } from "@/lib/format";
import { QueueTable, type QueueRow } from "./queue-table";
import type { queueCounts, reviewQueue } from "@/evv/review";
import { EvvHeader } from "./header";
import { fmtDate } from "@/lib/format";

type QueueData = Awaited<ReturnType<typeof reviewQueue>>;
type Names = { person: Record<string, string>; staff: Record<string, string> };

const fmtTime = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(d) : "—");

export function Queue({ queue, counts, filter, names, people, staff, payRules }: { queue: QueueData; counts: Awaited<ReturnType<typeof queueCounts>>; filter: Record<string, string>; names: Names; people: { id: string; name: string }[]; staff: { id: string; name: string }[]; payRules: PayRule[] }) {
  const rows: QueueRow[] = queue.items.map((v) => {
    const open = v.exceptions.filter((e) => e.status === "open");
    return {
      id: v.id, day: v.serviceDate ? fmtDate(v.serviceDate) : "No date", time: `${fmtTime(v.clockInAt)} – ${fmtTime(v.clockOutAt)}${v.units != null ? ` · ${v.units} units` : ""}`, dateIso: v.serviceDate ?? "",
      client: names.person[v.personId] ?? "Client", caregiver: names.staff[v.staffId] ?? "Caregiver",
      serviceLabel: labelForCode(v.serviceCode, v.modifiers), serviceKey: `${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""}`,
      compliance: COMPLIANCE[v.complianceStatus] ?? { label: v.complianceStatus, tone: "neutral" as const }, submission: v.submissionStatus ? SUBMISSION[v.submissionStatus] ?? null : null,
      due: v.submissionDeadline ? fmtDate(v.submissionDeadline) : "—", dueIso: v.submissionDeadline ?? "", overdue: v.overdue, evvRequired: v.evvRequired,
      openExceptions: open.length, flags: [v.manualEntry && "manual", v.corrected && "corrected", v.liveIn && "live-in", v.sharedCare && "shared care"].filter((x): x is string => Boolean(x)),
    };
  });
  const options = {
    people: people.map((p) => ({ value: p.id, label: p.name })),
    staff: staff.map((p) => ({ value: p.id, label: p.name })),
  };
  const cur = currentPayPeriod(payRules), last = shiftPayPeriod(cur, -1, payRules);
  const presets = [
    { label: `Current pay period · ${cur.label}`, param: `from=${cur.startDate}&to=${cur.endDate}` },
    { label: `Last pay period · ${last.label}`, param: `from=${last.startDate}&to=${last.endDate}` },
    { label: "Last 30 days", param: `from=${isoDay(-30)}&to=${isoDay(0)}` },
    { label: "Last 90 days", param: `from=${isoDay(-90)}&to=${isoDay(0)}` },
  ];
  const rangeLabel = filter.from && filter.to ? `${fmtDate(filter.from)} – ${fmtDate(filter.to)}` : "All dates";

  const view = currentView(filter), group = filter.submissionGroup as SubmissionGroup | undefined;
  const crumbs = group && SUBMISSION_GROUPS[group] ? ["Submission", SUBMISSION_GROUPS[group].label] : [view ? QUEUE_VIEW_LABEL[view] : "All visits"];
  const n = counts[view];

  return (
    <div>
      <EvvHeader crumbs={crumbs} title={crumbs[crumbs.length - 1]} lead={group && SUBMISSION_GROUPS[group] ? groupLead(group, n) : lead(view, n, filter.from && filter.to ? rangeLabel : "")} />
      <QueueTable rows={rows} filter={filter} options={options} presets={presets} rangeLabel={rangeLabel} />
      <p className="mt-5 flex items-start gap-2.5 rounded-xl border border-line bg-panel px-4 py-3.5 text-[14px] text-muted-foreground">
        <Info size={18} aria-hidden className="mt-px shrink-0" />
        <span><b className="font-medium text-text-strong">Noncompliant is not unsent.</b> Every completed visit still goes to the aggregator. Compliance is our rule check; submission is what the aggregator said back.</span>
      </p>
    </div>
  );
}

const visits = (n: number) => `${n.toLocaleString()} ${n === 1 ? "visit" : "visits"}`;

/** One sentence under the title saying what the view holds. */
function lead(view: QueueView, n: number, range: string) {
  switch (view) {
    case "attention": return n ? `${visits(n)} need you: noncompliant, waiting on a review, or with an open exception.` : "Nothing needs you right now.";
    case "rejected": return n ? `${visits(n)} the aggregator turned back. Correct them and resubmit.` : "Nothing was rejected.";
    case "deadline": return n ? `${visits(n)} close to the monthly deadline and not yet accepted.` : "Nothing is close to the monthly deadline.";
    case "manual": return n ? `${visits(n)} entered by hand or corrected. They count as confirmed, never compliant.` : "No visits were entered by hand or corrected.";
    default: return `${visits(n)}${range ? ` from ${range}` : ""}. Data is due to the aggregator by the 14th of the following month.`;
  }
}

function groupLead(group: SubmissionGroup, n: number) {
  switch (group) {
    case "unsent": return n ? `${visits(n)} not sent to the aggregator yet.` : "Everything has been sent.";
    case "awaiting": return n ? `${visits(n)} sent and waiting for the aggregator's answer.` : "Nothing is waiting on the aggregator.";
    case "accepted": return `${visits(n)} the aggregator accepted. A noncompliant one still counts against the 80%.`;
    case "fix": return n ? `${visits(n)} turned back by the aggregator or failed to send. Correct them and resubmit.` : "Nothing needs a fix.";
  }
}
