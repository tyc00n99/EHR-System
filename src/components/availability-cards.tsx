import { Icon } from "@/components/icons";
import { cx } from "@/components/kit";
import { fmtDate } from "@/lib/format";

export interface AvailabilityRow { id: string; weekday: number; startTime: string; endTime: string; startDate: string | null; endDate: string | null; updatedAt: Date }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Same rendering as the client Profile: "2:30 PM", not "2:30p".
const hhmm = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`; };

/** The week as seven day cards, the way the client Profile shows availability. Same for staff. */
export function AvailabilityCards({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) return null;
  const first = rows[0];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
        <Icon.calendar size={17} className="text-muted-foreground" />
        <span className="text-muted-foreground">From</span>
        <span className="ident font-medium text-text-strong">{first.startDate ? fmtDate(first.startDate) : "—"}</span>
        <span className="text-muted-foreground">to</span>
        <span className="ident font-medium text-text-strong">{first.endDate ? fmtDate(first.endDate) : "open"}</span>
        <span className="ml-2 text-muted-foreground">Last updated</span>
        <span className="ident text-muted-foreground">{fmtDate(first.updatedAt.toISOString().slice(0, 10))}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const windows = rows.filter((a) => a.weekday === d);
          return (
            <div key={d} className={cx("rounded-lg border px-3 py-2.5 text-center", windows.length ? "border-line bg-card" : "border-line-soft bg-panel")}>
              <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-strong">{DOW[d]}</div>
              <div className="mt-2 border-t border-line-soft pt-2 text-[13px]">
                {windows.length === 0
                  ? <span className="text-hint">Unavailable</span>
                  : windows.map((w) => <div key={w.id} className="ident text-text-strong">{hhmm(w.startTime)} – {hhmm(w.endTime)}</div>)}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[13px] text-muted-foreground">Times shown in Central Time — Minnesota.</p>
    </div>
  );
}

/** The week as seven short lines, for a narrow column where the day cards would not fit. */
export function AvailabilityList({ rows }: { rows: AvailabilityRow[] }) {
  if (rows.length === 0) return null;
  const first = rows[0];
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px]">
        <Icon.calendar size={15} className="text-muted-foreground" />
        <span className="text-muted-foreground">From</span><span className="ident font-medium text-text-strong">{first.startDate ? fmtDate(first.startDate) : "—"}</span>
        <span className="text-muted-foreground">to</span><span className="ident font-medium text-text-strong">{first.endDate ? fmtDate(first.endDate) : "open"}</span>
        <span className="text-muted-foreground">· updated {fmtDate(first.updatedAt.toISOString().slice(0, 10))}</span>
      </div>
      <dl className="grid grid-cols-[44px_1fr] gap-y-1 text-[14px]">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const windows = rows.filter((a) => a.weekday === d);
          return (
            <div key={d} className="contents">
              <dt className="font-medium text-text-strong">{DOW[d]}</dt>
              <dd className="m-0">{windows.length === 0 ? <span className="text-hint">Unavailable</span> : windows.map((w) => <span key={w.id} className="ident mr-3 text-text-strong">{hhmm(w.startTime)} – {hhmm(w.endTime)}</span>)}</dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-2 text-[13px] text-muted-foreground">Central Time — Minnesota.</p>
    </div>
  );
}
