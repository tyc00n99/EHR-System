import Link from "next/link";
import { FilterMenu } from "@/components/filter-menu";
import { Badge, Button, Empty, Input, PageHeader } from "@/components/kit";
import { COMPLIANCE, SUBMISSION, reasonLabel } from "@/evv/labels";
import type { reviewQueue } from "@/evv/review";
import { fmtDate } from "@/lib/format";

type QueueData = Awaited<ReturnType<typeof reviewQueue>>;
type Names = { person: Record<string, string>; staff: Record<string, string> };

const CHIPS: { key: string; label: string; set: Record<string, string> }[] = [
  { key: "all", label: "All visits", set: {} },
  { key: "exceptions", label: "Open exceptions", set: { openExceptionsOnly: "true" } },
  { key: "noncompliant", label: "Noncompliant", set: { complianceStatus: "NONCOMPLIANT" } },
  { key: "review", label: "Needs review", set: { complianceStatus: "PENDING_REVIEW" } },
  { key: "manual", label: "Manual or corrected", set: { manualOrCorrected: "true" } },
  { key: "rejected", label: "Rejected by aggregator", set: { rejected: "true" } },
  { key: "deadline", label: "Deadline approaching", set: { approachingDeadline: "true" } },
];

const fmtTime = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(d) : "—");

export function Queue({ queue, filter, names, people, staff }: { queue: QueueData; filter: Record<string, string>; names: Names; people: { id: string; name: string }[]; staff: { id: string; name: string }[] }) {
  const href = (set: Record<string, string>) => {
    const keep = Object.fromEntries(Object.entries(filter).filter(([k]) => !["openExceptionsOnly", "complianceStatus", "manualOrCorrected", "rejected", "approachingDeadline", "offset"].includes(k)));
    const q = new URLSearchParams({ ...keep, ...set });
    return `/evv${q.toString() ? `?${q}` : ""}`;
  };
  const activeChip = CHIPS.find((c) => Object.entries(c.set).every(([k, v]) => filter[k] === v) && (c.key !== "all" || !["openExceptionsOnly", "complianceStatus", "manualOrCorrected", "rejected", "approachingDeadline"].some((k) => filter[k])))?.key ?? "all";
  const visitHref = (id: string) => `/evv?${new URLSearchParams({ ...filter, visit: id })}`;

  return (
    <div>
      <PageHeader title="EVV review queue" meta={<span>Every visit that needs electronic verification, with what is wrong and what to do about it. Nothing here is ever deleted.</span>} />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {CHIPS.map((c) => <Link key={c.key} href={href(c.set)} className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${activeChip === c.key ? "border-primary bg-primary-soft text-primary" : "border-line bg-card text-muted-foreground hover:bg-hover"}`}>{c.label}</Link>)}
      </div>

      <form className="mb-4 grid gap-2 rounded-xl border border-line bg-card-soft p-3 sm:grid-cols-2 lg:grid-cols-6" action="/evv">
        {Object.entries(filter).filter(([k]) => ["openExceptionsOnly", "complianceStatus", "manualOrCorrected", "rejected", "approachingDeadline"].includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <Input type="date" name="from" defaultValue={filter.from ?? ""} aria-label="From" />
        <Input type="date" name="to" defaultValue={filter.to ?? ""} aria-label="To" />
        <FilterMenu submit aria-label="Client" name="personId" value={filter.personId ?? ""} options={[{ value: "", label: "Any client" }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
        <FilterMenu submit aria-label="Caregiver" name="staffId" value={filter.staffId ?? ""} options={[{ value: "", label: "Any caregiver" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
        <FilterMenu submit aria-label="Submission status" name="submissionStatus" value={filter.submissionStatus ?? ""} options={[{ value: "", label: "Any submission status" }, ...Object.entries(SUBMISSION).map(([k, v]) => ({ value: k, label: v.label }))]} />
        <div className="flex gap-2"><Input name="serviceCode" defaultValue={filter.serviceCode ?? ""} placeholder="Service code" aria-label="Service code" /><Button type="submit" variant="secondary" className="shrink-0">Filter</Button></div>
      </form>

      {queue.items.length === 0 ? (
        <div className="rounded-xl border border-line bg-card"><Empty icon="shield" title="Nothing matches">Visits appear here as caregivers clock in and out. Change the filters or pick another chip.</Empty></div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-card">
          {queue.items.map((v) => {
            const c = COMPLIANCE[v.complianceStatus], s = v.submissionStatus ? SUBMISSION[v.submissionStatus] : null;
            const open = v.exceptions.filter((e) => e.status === "open");
            return (
              <li key={v.id}>
                <Link href={visitHref(v.id)} className="block px-4 py-3 hover:bg-hover">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="w-24 shrink-0 text-[13px] tabular-nums text-muted-foreground">{v.serviceDate ? fmtDate(v.serviceDate) : "No date"}</span>
                    <span className="min-w-0 basis-full font-medium text-text-strong sm:flex-1 sm:basis-auto">{names.person[v.personId] ?? "Client"} <span className="font-normal text-muted-foreground">with {names.staff[v.staffId] ?? "caregiver"}</span></span>
                    <Badge tone={c.tone}>{c.label}</Badge>
                    {s && <Badge tone={s.tone}>{s.label}</Badge>}
                    {!v.evvRequired && <Badge>EVV not required</Badge>}
                    {v.overdue && <Badge tone="danger">Past deadline</Badge>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
                    <span>{v.serviceCode} {v.modifiers.join(" ")}</span>
                    <span>{fmtTime(v.clockInAt)} – {fmtTime(v.clockOutAt)}{v.durationMinutes != null ? ` · ${v.durationMinutes} min · ${v.units ?? 0} units` : ""}</span>
                    {v.manualEntry && <span>manual</span>}{v.corrected && <span>corrected</span>}{v.liveIn && <span>live-in</span>}{v.sharedCare && <span>shared care</span>}
                    {v.submissionDeadline && <span>due {fmtDate(v.submissionDeadline)}</span>}
                  </div>
                  {open.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{open.slice(0, 4).map((e) => <span key={e.id} className={`rounded px-1.5 py-px text-[13px] ${e.severity === "error" ? "bg-danger-soft text-danger" : e.severity === "info" ? "bg-panel text-muted-foreground" : "bg-warn-soft text-warn"}`}>{reasonLabel(e.type)}</span>)}{open.length > 4 && <span className="text-[13px] text-muted-foreground">+{open.length - 4} more</span>}</div>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[13px] text-muted-foreground">{queue.count} visit{queue.count === 1 ? "" : "s"} shown.</p>
    </div>
  );
}
