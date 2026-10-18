import Link from "next/link";
import { Avatar, Badge, ChipLink, GroupLabel, ListGroup, ListRow } from "@/components/kit";
import { Icon } from "@/components/icons";

export interface AgendaItem {
  id: string;
  start: Date;
  end: Date;
  client: string;
  caregiver: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "missed";
  /** Booked with a caregiver who is no longer active: somebody has to cover it. */
  uncovered: boolean;
  href: string;
}

export type AgendaFilter = "all" | "cover" | "late" | "live";

const tm = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(d);

/**
 * The schedule on a phone (Oct 18, 2026, drawn from the user's reference): one day at a time, a
 * row of filter chips with counts, visits under way grouped as "Now", the rest grouped by start
 * time, each a row with the client, who is going and until when, and a status pill. The desktop
 * participant grid does not fit a phone, so this replaces it below `md`; it reads the same shifts.
 */
export function ScheduleAgenda({ title, dayLabel, items, filter, now, hrefFor, prev, next, today, isToday }: {
  title: string; dayLabel: string; items: AgendaItem[]; filter: AgendaFilter; now: Date;
  hrefFor: (f: AgendaFilter) => string; prev: string; next: string; today: string; isToday: boolean;
}) {
  const late = (it: AgendaItem) => it.status === "scheduled" && it.start < now;
  const counts = { cover: items.filter((i) => i.uncovered).length, late: items.filter(late).length, live: items.filter((i) => i.status === "in_progress").length };
  const shown = items.filter((it) => filter === "all" || (filter === "cover" ? it.uncovered : filter === "late" ? late(it) : it.status === "in_progress"));
  const live = shown.filter((i) => i.status === "in_progress");
  const rest = shown.filter((i) => i.status !== "in_progress");
  const groups = new Map<string, AgendaItem[]>();
  for (const it of rest) {
    const k = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(it.start);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const pill = (it: AgendaItem) =>
    it.status === "in_progress" ? <Badge tone="ok" dot>Live</Badge>
    : it.uncovered ? <Badge tone="danger" dot>Open</Badge>
    : late(it) ? <Badge tone="warn" dot>Late</Badge>
    : it.status === "completed" ? <Badge>Done</Badge>
    : it.status === "missed" ? <Badge tone="danger" dot>Missed</Badge>
    : it.status === "cancelled" ? <Badge>Cancelled</Badge>
    : null;
  const row = (it: AgendaItem) => (
    <ListRow key={it.id} href={it.href} scroll={false}
      lead={it.uncovered
        ? <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"><Icon.team size={18} /></span>
        : <Avatar name={it.client} size={40} />}
      title={<span className={it.status === "cancelled" ? "line-through" : undefined}>{it.client}</span>}
      subtitle={it.uncovered ? `${it.caregiver} is no longer active` : `${it.caregiver.split(" ")[0]} · until ${tm(it.end)}`}
      trail={pill(it)} />
  );

  return (
    <div className="md:hidden">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[14px] text-muted-foreground">{dayLabel} · {items.length} visit{items.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-0.5">
          <Link aria-label="Previous day" href={prev} className="grid size-8 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Icon.chevronLeft size={18} /></Link>
          {!isToday && <Link href={today} className="rounded-full px-2.5 py-1 text-[13px] font-medium text-text-strong hover:bg-tab-hover">Today</Link>}
          <Link aria-label="Next day" href={next} className="grid size-8 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Icon.chevronRight size={18} /></Link>
        </div>
      </div>
      <h1 className="mb-4">{title}</h1>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <ChipLink href={hrefFor("all")} active={filter === "all"}>All</ChipLink>
        <ChipLink href={hrefFor("cover")} active={filter === "cover"} count={counts.cover}>Needs cover</ChipLink>
        <ChipLink href={hrefFor("late")} active={filter === "late"} count={counts.late}>Late</ChipLink>
        <ChipLink href={hrefFor("live")} active={filter === "live"} count={counts.live}>Live</ChipLink>
      </div>
      {live.length > 0 && (<><GroupLabel>Now</GroupLabel><ListGroup className="mb-4">{live.map(row)}</ListGroup></>)}
      {[...groups.entries()].map(([k, list]) => (<div key={k}><GroupLabel>{k}</GroupLabel><ListGroup className="mb-4">{list.map(row)}</ListGroup></div>))}
      {shown.length === 0 && <p className="rounded-[var(--radius-app)] border border-dashed border-line px-4 py-8 text-center text-[14px] text-muted-foreground">{filter === "all" ? "Nothing booked on this day." : "Nothing matches this filter on this day."}</p>}
    </div>
  );
}
