/**
 * The window the Notes list and its exports look at. Pay period is the default because that is
 * how notes are reviewed and billed, but a supervisor can also step through weeks or months, or
 * name any two dates. Everything is a Chicago calendar range resolved to exact instants.
 */
import { fromLocalInput } from "./format";
import { chicagoDate, currentPayPeriod, payPeriodByIndex, payPeriodFromParam } from "./pay-period";

export type RangeKind = "period" | "week" | "month" | "custom";

export interface VisitRange {
  kind: RangeKind;
  /** Inclusive Chicago calendar bounds. */
  from: string;
  to: string;
  /** Exact instants for the query. */
  start: Date;
  end: Date;
  label: string;
  /** Query-string fragment that names this range, e.g. `week=2026-09-13`. */
  param: string;
  /** Neighbouring ranges of the same kind; absent for custom dates. */
  prev?: string;
  next?: string;
  /** The range of this kind that contains today. */
  current: string;
  isCurrent: boolean;
  /** Safe for a filename. */
  slug: string;
}

const DAY = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const utc = (iso: string) => Date.parse(iso + "T00:00:00Z");
const addDays = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);
const dayStart = (iso: string) => fromLocalInput(`${iso}T00:00`);
const dayEnd = (iso: string) => new Date(dayStart(addDays(iso, 1)).getTime() - 1);
const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const spanLabel = (from: string, to: string) => (from.slice(0, 4) === to.slice(0, 4) ? `${short.format(new Date(utc(from)))} – ${shortYear.format(new Date(utc(to)))}` : `${shortYear.format(new Date(utc(from)))} – ${shortYear.format(new Date(utc(to)))}`);

const weekStart = (iso: string) => addDays(iso, -new Date(utc(iso)).getUTCDay());
const monthOf = (iso: string) => iso.slice(0, 7);
const shiftMonth = (ym: string, n: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthEnd = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (sp: Params, k: string): string | undefined => { const v = sp instanceof URLSearchParams ? sp.get(k) ?? undefined : sp[k]; return typeof v === "string" ? v : undefined; };

export function resolveVisitRange(sp: Params, today = chicagoDate(new Date())): VisitRange {
  const from = read(sp, "from"), to = read(sp, "to"), month = read(sp, "month"), week = read(sp, "week");
  if (from && to && ISO.test(from) && ISO.test(to) && from <= to) {
    return { kind: "custom", from, to, start: dayStart(from), end: dayEnd(to), label: spanLabel(from, to), param: `from=${from}&to=${to}`, current: `from=${from}&to=${to}`, isCurrent: from <= today && today <= to, slug: `${from}_${to}` };
  }
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const f = `${month}-01`, t = monthEnd(month);
    return { kind: "month", from: f, to: t, start: dayStart(f), end: dayEnd(t), label: monthYear.format(new Date(utc(f))), param: `month=${month}`, prev: `month=${shiftMonth(month, -1)}`, next: `month=${shiftMonth(month, 1)}`, current: `month=${monthOf(today)}`, isCurrent: month === monthOf(today), slug: month };
  }
  if (week && ISO.test(week)) {
    const f = weekStart(week), t = addDays(f, 6);
    return { kind: "week", from: f, to: t, start: dayStart(f), end: dayEnd(t), label: spanLabel(f, t), param: `week=${f}`, prev: `week=${addDays(f, -7)}`, next: `week=${addDays(f, 7)}`, current: `week=${weekStart(today)}`, isCurrent: f === weekStart(today), slug: `week-${f}` };
  }
  const p = payPeriodFromParam(read(sp, "period"));
  const cur = currentPayPeriod();
  return { kind: "period", from: p.startDate, to: p.endDate, start: p.start, end: p.end, label: p.label, param: `period=${p.startDate}`, prev: `period=${payPeriodByIndex(p.index - 1).startDate}`, next: `period=${payPeriodByIndex(p.index + 1).startDate}`, current: `period=${cur.startDate}`, isCurrent: p.index === cur.index, slug: p.startDate };
}

/** The parameter that switches to another kind while staying near the same dates. */
export function rangeParamFor(kind: RangeKind, r: VisitRange): string {
  if (kind === "period") return `period=${r.from}`;
  if (kind === "week") return `week=${weekStart(r.from)}`;
  if (kind === "month") return `month=${monthOf(r.from)}`;
  return `from=${r.from}&to=${r.to}`;
}
