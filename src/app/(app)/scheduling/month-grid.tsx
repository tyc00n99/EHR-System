import Link from "next/link";
import { cx } from "@/components/kit";
import { serviceColor } from "@/components/chart";
import type { GridEvent } from "./schedule-grid";

/**
 * The monthly view is a plain month calendar, as in the reference — the participant rows only make
 * sense over a week. Each day lists its events and spills the rest into a count.
 */

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function MonthGrid({ from, today, events, baseHref }: { from: string; today: string; events: GridEvent[]; baseHref: string }) {
  const first = new Date(from + "T12:00:00Z");
  const lead = first.getUTCDay();
  const month = from.slice(0, 7);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(from, i - lead));

  return (
    <div className="min-w-0 flex-1 overflow-auto">
      <div className="grid min-w-[980px] grid-cols-7 border-b border-line bg-panel">
        {DOW.map((d) => (
          <div key={d} className="border-r border-line px-3 py-2 text-[14px] text-muted-foreground last:border-r-0">{d}</div>
        ))}
      </div>
      <div className="grid min-w-[980px] grid-cols-7">
        {cells.map((date) => {
          const inMonth = date.slice(0, 7) === month;
          const day = events.filter((e) => e.date === date);
          return (
            <div
              key={date}
              className={cx("min-h-[124px] border-b border-r border-line p-2", !inMonth && "bg-panel/60", date === today && "bg-primary-soft/40")}
            >
              <div className={cx("mb-1 text-[14px]", date === today ? "font-semibold text-primary" : inMonth ? "text-text-strong" : "text-hint")}>
                {Number(date.slice(8))}
              </div>
              {day.slice(0, 3).map((e) => (
                <Link
                  key={e.id}
                  href={`/scheduling?shift=${e.id}`}
                  scroll={false}
                  className="mb-1 flex items-center gap-1.5 rounded px-1 py-0.5 text-[13px] hover:bg-hover"
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: serviceColor(e.code) }} />
                  <span className="ident shrink-0 text-muted-foreground">{e.time.split(" – ")[0]}</span>
                  <span className="truncate text-text-strong">{e.title}</span>
                </Link>
              ))}
              {day.length > 3 && (
                <Link href={`${baseHref}&view=daily&date=${date}`} className="px-1 text-[13px] font-medium text-primary hover:underline">
                  +{day.length - 3} more
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
