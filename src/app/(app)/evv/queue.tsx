import { PageHeader } from "@/components/kit";
import { COMPLIANCE, SUBMISSION } from "@/evv/labels";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodByIndex } from "@/lib/pay-period";
import { isoDay } from "@/lib/format";
import { QueueTable, type QueueRow } from "./queue-table";
import type { reviewQueue } from "@/evv/review";
import { fmtDate } from "@/lib/format";

type QueueData = Awaited<ReturnType<typeof reviewQueue>>;
type Names = { person: Record<string, string>; staff: Record<string, string> };

const fmtTime = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(d) : "—");

export function Queue({ queue, filter, names, people, staff }: { queue: QueueData; filter: Record<string, string>; names: Names; people: { id: string; name: string }[]; staff: { id: string; name: string }[] }) {
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
    submission: Object.entries(SUBMISSION).map(([k, v]) => ({ value: k, label: v.label })),
  };
  const cur = currentPayPeriod(), last = payPeriodByIndex(cur.index - 1);
  const presets = [
    { label: `Current pay period · ${cur.label}`, param: `from=${cur.startDate}&to=${cur.endDate}` },
    { label: `Last pay period · ${last.label}`, param: `from=${last.startDate}&to=${last.endDate}` },
    { label: "Last 30 days", param: `from=${isoDay(-30)}&to=${isoDay(0)}` },
    { label: "Last 90 days", param: `from=${isoDay(-90)}&to=${isoDay(0)}` },
  ];
  const rangeLabel = filter.from && filter.to ? `${fmtDate(filter.from)} – ${fmtDate(filter.to)}` : "All dates";

  return (
    <div>
      <PageHeader title="EVV review queue" meta={<span>{queue.count} visit{queue.count === 1 ? "" : "s"} · every visit that needs electronic verification, with what is wrong and what to do about it.</span>} />
      <QueueTable rows={rows} filter={filter} options={options} presets={presets} rangeLabel={rangeLabel} />
    </div>
  );
}
