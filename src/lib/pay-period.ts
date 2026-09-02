/**
 * Pay periods. Visits are reviewed, approved, and billed by pay period, so the
 * activity timeline and the visits list group by it.
 *
 * Assumption (2026-09-02): biweekly, Sunday through Saturday, anchored to
 * 2026-08-23. Move into organization settings when a second provider needs a
 * different schedule.
 */
import { fromLocalInput } from "./format";

export const PAY_PERIOD = { lengthDays: 14, anchor: "2026-08-23" } as const;

export interface PayPeriod {
  /** ISO dates, inclusive, in America/Chicago. */
  startDate: string;
  endDate: string;
  /** Exact instants for querying timestamptz columns. */
  start: Date;
  end: Date;
  label: string;
  index: number;
}

const DAY = 86_400_000;

function isoToUtcDay(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
}

function utcDayToIso(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

/** Calendar date in America/Chicago for an instant. */
export function chicagoDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortYear = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function payPeriodByIndex(index: number): PayPeriod {
  const startDay = isoToUtcDay(PAY_PERIOD.anchor) + index * PAY_PERIOD.lengthDays;
  const startDate = utcDayToIso(startDay);
  const endDate = utcDayToIso(startDay + PAY_PERIOD.lengthDays - 1);
  const nextStart = utcDayToIso(startDay + PAY_PERIOD.lengthDays);
  const s = new Date(startDay * DAY), e = new Date((startDay + PAY_PERIOD.lengthDays - 1) * DAY);
  const label = s.getUTCFullYear() === e.getUTCFullYear() ? `${short.format(s)} – ${shortYear.format(e)}` : `${shortYear.format(s)} – ${shortYear.format(e)}`;
  return { startDate, endDate, start: fromLocalInput(`${startDate}T00:00`), end: new Date(fromLocalInput(`${nextStart}T00:00`).getTime() - 1), label, index };
}

export function payPeriodContaining(d: Date = new Date()): PayPeriod {
  const day = isoToUtcDay(chicagoDate(d));
  const index = Math.floor((day - isoToUtcDay(PAY_PERIOD.anchor)) / PAY_PERIOD.lengthDays);
  return payPeriodByIndex(index);
}

export function currentPayPeriod(): PayPeriod {
  return payPeriodContaining(new Date());
}

/** Parse a `?period=YYYY-MM-DD` start date back to a period; falls back to the current one. */
export function payPeriodFromParam(v: string | undefined): PayPeriod {
  if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const index = Math.round((isoToUtcDay(v) - isoToUtcDay(PAY_PERIOD.anchor)) / PAY_PERIOD.lengthDays);
    return payPeriodByIndex(index);
  }
  return currentPayPeriod();
}
