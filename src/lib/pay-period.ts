/**
 * Pay periods. Visits are reviewed, approved, billed and paid by pay period, so the notes list, billing,
 * reports and the Pay tab all group by it.
 *
 * The schedule is the agency's (Sept 29, 2026: "pay periods can change anytime"): a list of rules, each
 * in force from its `effectiveFrom` until the next one begins. When a rule changes, the old schedule's
 * last period ends the day before the new one starts, so no day falls in two periods or in none.
 * Periods are found by date, never by counting from an anchor, because a count stops meaning anything
 * the moment the length changes. Everything here is pure; the rules come from `getPayRules()` in
 * `src/db/pay-queries.ts`, and every function falls back to the schedule the app shipped with.
 */
import { fromLocalInput } from "./format";

export type PayFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly";
export interface PayRule { effectiveFrom: string; frequency: PayFrequency; anchorDate: string }

/** What the app used before schedules were editable: biweekly, Sunday to Saturday, from 2026-08-23. */
export const DEFAULT_PAY_RULES: PayRule[] = [{ effectiveFrom: "2000-01-01", frequency: "biweekly", anchorDate: "2026-08-23" }];

export const FREQUENCY_LABEL: Record<PayFrequency, string> = { weekly: "Weekly", biweekly: "Every two weeks", semimonthly: "Twice a month (1st–15th, 16th–end)", monthly: "Monthly" };

export interface PayPeriod {
  /** ISO dates, inclusive, in America/Chicago. */
  startDate: string;
  endDate: string;
  /** Exact instants for querying timestamptz columns. */
  start: Date;
  end: Date;
  label: string;
}

const DAY = 86_400_000;

function isoToUtcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

function utcDayToIso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return utcDayToIso(isoToUtcDay(iso) + n);
}

/** Calendar date in America/Chicago for an instant. */
export function chicagoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A period from its inclusive ISO dates. */
export function periodFromDates(startDate: string, endDate: string): PayPeriod {
  const s = new Date(isoToUtcDay(startDate) * DAY), e = new Date(isoToUtcDay(endDate) * DAY);
  const label = s.getUTCFullYear() === e.getUTCFullYear() ? `${short.format(s)} – ${shortYear.format(e)}` : `${shortYear.format(s)} – ${shortYear.format(e)}`;
  return { startDate, endDate, start: fromLocalInput(`${startDate}T00:00`), end: new Date(fromLocalInput(`${addDays(endDate, 1)}T00:00`).getTime() - 1), label };
}

function sorted(rules: PayRule[]): PayRule[] {
  const r = rules.length ? [...rules] : DEFAULT_PAY_RULES;
  return r.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** The period one rule would give for a date, before clipping to when the rule is in force. */
function naturalPeriod(rule: PayRule, iso: string): [string, string] {
  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const len = rule.frequency === "weekly" ? 7 : 14;
    const anchor = isoToUtcDay(rule.anchorDate), day = isoToUtcDay(iso);
    const start = anchor + Math.floor((day - anchor) / len) * len;
    return [utcDayToIso(start), utcDayToIso(start + len - 1)];
  }
  const [y, m, d] = iso.split("-").map(Number);
  const mm = String(m).padStart(2, "0");
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (rule.frequency === "semimonthly") return d <= 15 ? [`${y}-${mm}-01`, `${y}-${mm}-15`] : [`${y}-${mm}-16`, `${y}-${mm}-${lastDay}`];
  return [`${y}-${mm}-01`, `${y}-${mm}-${lastDay}`];
}

/** The pay period containing a date (ISO or instant) under the agency's rules. */
export function payPeriodContaining(d: Date | string = new Date(), rules: PayRule[] = DEFAULT_PAY_RULES): PayPeriod {
  const iso = typeof d === "string" ? d : chicagoDate(d);
  const r = sorted(rules);
  let i = 0;
  while (i + 1 < r.length && r[i + 1].effectiveFrom <= iso) i++;
  let [start, end] = naturalPeriod(r[i], iso);
  // The first rule reaches back indefinitely; any later one starts exactly when it takes effect.
  if (i > 0 && start < r[i].effectiveFrom) start = r[i].effectiveFrom;
  if (i + 1 < r.length && end >= r[i + 1].effectiveFrom) end = addDays(r[i + 1].effectiveFrom, -1);
  return periodFromDates(start, end);
}

export function currentPayPeriod(rules: PayRule[] = DEFAULT_PAY_RULES): PayPeriod {
  return payPeriodContaining(new Date(), rules);
}

/** Steps whole periods from `p`: -1 is the one before, +1 the one after. */
export function shiftPayPeriod(p: PayPeriod, steps: number, rules: PayRule[] = DEFAULT_PAY_RULES): PayPeriod {
  let cur = p;
  for (let i = 0; i < Math.abs(steps); i++) cur = payPeriodContaining(steps < 0 ? addDays(cur.startDate, -1) : addDays(cur.endDate, 1), rules);
  return cur;
}

/** `n` periods ending with `last` (default the current one), oldest first. */
export function recentPayPeriods(n: number, rules: PayRule[] = DEFAULT_PAY_RULES, last: PayPeriod = currentPayPeriod(rules)): PayPeriod[] {
  const out = [last];
  while (out.length < n) out.unshift(shiftPayPeriod(out[0], -1, rules));
  return out;
}

/** Parse a `?period=YYYY-MM-DD` (any date inside it) back to a period; falls back to the current one. */
export function payPeriodFromParam(v: string | null | undefined, rules: PayRule[] = DEFAULT_PAY_RULES): PayPeriod {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) return payPeriodContaining(v, rules);
  return currentPayPeriod(rules);
}

/** One line describing a rule, for settings and the Pay tab. */
export function describePayRule(rule: PayRule): string {
  if (rule.frequency === "weekly" || rule.frequency === "biweekly") {
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
    const s = new Date(isoToUtcDay(rule.anchorDate) * DAY), e = new Date((isoToUtcDay(rule.anchorDate) + 6) * DAY);
    return `${FREQUENCY_LABEL[rule.frequency]}, ${wd.format(s)} to ${wd.format(e)}`;
  }
  return FREQUENCY_LABEL[rule.frequency];
}
