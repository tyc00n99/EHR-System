/**
 * Estimated pay for one caregiver in one pay period (Sept 29, 2026). Pure: notes, rates and the
 * agency's rules in, lines and totals out. It is an estimate — gross, before taxes and deductions —
 * and never a payroll record.
 *
 * - Hours are clock-out minus clock-in. A note belongs to the day it was clocked in.
 * - The rate is the one in effect on that day (`staff_pay_rates`), so a raise mid-period splits cleanly.
 * - Overtime follows the agency's rules: hours past the daily limit (when set) and past the weekly limit
 *   pay at the multiplier. Workweeks are counted whole even when they cross into the previous pay period,
 *   so the caller passes notes from the start of the first workweek. Exempt staff get no overtime.
 * - A note is held — counted, but not ready to pay — when it is still clocked in, or either signature is
 *   missing: the caregiver's, or the client's (user, Sept 29, 2026). A recorded "unable to sign" reason
 *   still holds the note; it is labelled apart so the reason can be read before deciding.
 */
import { addDays, chicagoDate, type PayPeriod } from "./pay-period";

export interface OvertimeRules { weeklyHours: number; dailyHours: number | null; multiplier: number; workweekStartDay: number }
export interface PayNote {
  id: string; personId: string; clientName: string; serviceCode: string; modifiers: string[];
  clockInAt: Date; clockOutAt: Date | null; open: boolean;
  staffSigned: boolean; clientSigned: boolean; clientReason: string | null;
}
export interface RateRow { rate: number; effectiveFrom: string }

export type HoldReason = "open" | "caregiver_unsigned" | "client_unsigned" | "client_reason";
export const HOLD_LABEL: Record<HoldReason, string> = { open: "Still clocked in", caregiver_unsigned: "Caregiver has not signed", client_unsigned: "Client has not signed", client_reason: "Client did not sign" };
export const HOLD_DETAIL: Record<HoldReason, string> = { open: "No clock-out recorded", caregiver_unsigned: "The note was not submitted", client_unsigned: "No signing code or reason recorded", client_reason: "A reason was recorded instead of the signing code" };

export interface PayLine {
  note: PayNote; date: string; hours: number | null; regularHours: number; overtimeHours: number;
  rate: number; pay: number | null; held: HoldReason[];
}
export interface PayWeek { startDate: string; endDate: string; hours: number; overtimeHours: number }
export interface PaySummary {
  lines: PayLine[];
  ready: { pay: number; hours: number; overtimeHours: number; count: number };
  held: { pay: number; hours: number; count: number; open: number };
  total: { pay: number; hours: number; regularHours: number; overtimeHours: number };
  weeks: PayWeek[];
  ratesUsed: number[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** First day of the workweek containing an ISO date. */
export function workweekStart(iso: string, startDay: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(iso, -((dow - startDay + 7) % 7));
}

export function rateOn(rates: RateRow[], iso: string): number {
  if (!rates.length) return 0;
  let r = rates[0];
  for (const x of rates) if (x.effectiveFrom <= iso) r = x;
  return r.rate;
}

export function holdReasons(n: PayNote): HoldReason[] {
  const out: HoldReason[] = [];
  if (n.open) out.push("open");
  if (!n.open && !n.staffSigned) out.push("caregiver_unsigned");
  if (!n.open && !n.clientSigned) out.push(n.clientReason?.trim() ? "client_reason" : "client_unsigned");
  return out;
}

export function computePay({ notes, period, rates, rules, exempt }: { notes: PayNote[]; period: PayPeriod; rates: RateRow[]; rules: OvertimeRules; exempt: boolean }): PaySummary {
  const sortedRates = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const sortedNotes = [...notes].sort((a, b) => a.clockInAt.getTime() - b.clockInAt.getTime());
  const weekReg = new Map<string, number>(), dayHours = new Map<string, number>();
  const weekTotals = new Map<string, PayWeek>();
  const lines: PayLine[] = [];

  for (const n of sortedNotes) {
    const date = chicagoDate(n.clockInAt);
    const wk = workweekStart(date, rules.workweekStartDay);
    const hours = n.open || !n.clockOutAt ? null : Math.max(0, (n.clockOutAt.getTime() - n.clockInAt.getTime()) / 3_600_000);
    let regular = hours ?? 0, overtime = 0;
    if (hours != null && !exempt) {
      // Daily first: hours past the day's limit are overtime and do not count toward the weekly limit.
      if (rules.dailyHours != null) {
        const before = dayHours.get(date) ?? 0;
        overtime += Math.max(0, before + hours - rules.dailyHours) - Math.max(0, before - rules.dailyHours);
        dayHours.set(date, before + hours);
      }
      regular = hours - overtime;
      const regBefore = weekReg.get(wk) ?? 0;
      const weeklyOt = Math.max(0, regBefore + regular - rules.weeklyHours) - Math.max(0, regBefore - rules.weeklyHours);
      weekReg.set(wk, regBefore + regular);
      regular -= weeklyOt;
      overtime += weeklyOt;
    }
    // Only notes inside the period are paid here; earlier days of the first workweek only count toward overtime.
    if (date < period.startDate || date > period.endDate) continue;
    const rate = rateOn(sortedRates, date);
    const pay = hours == null ? null : round2(regular * rate + overtime * rate * rules.multiplier);
    lines.push({ note: n, date, hours, regularHours: regular, overtimeHours: overtime, rate, pay, held: holdReasons(n) });
    const w = weekTotals.get(wk) ?? { startDate: wk < period.startDate ? period.startDate : wk, endDate: addDays(wk, 6) > period.endDate ? period.endDate : addDays(wk, 6), hours: 0, overtimeHours: 0 };
    w.hours += hours ?? 0; w.overtimeHours += overtime; weekTotals.set(wk, w);
  }

  const ready = { pay: 0, hours: 0, overtimeHours: 0, count: 0 }, held = { pay: 0, hours: 0, count: 0, open: 0 };
  const total = { pay: 0, hours: 0, regularHours: 0, overtimeHours: 0 };
  for (const l of lines) {
    total.hours += l.hours ?? 0; total.regularHours += l.regularHours; total.overtimeHours += l.overtimeHours; total.pay += l.pay ?? 0;
    if (l.held.length) { held.count++; held.hours += l.hours ?? 0; held.pay += l.pay ?? 0; if (l.hours == null) held.open++; }
    else { ready.count++; ready.hours += l.hours ?? 0; ready.overtimeHours += l.overtimeHours; ready.pay += l.pay ?? 0; }
  }
  ready.pay = round2(ready.pay); held.pay = round2(held.pay); total.pay = round2(total.pay);
  return { lines, ready, held, total, weeks: [...weekTotals.values()].sort((a, b) => a.startDate.localeCompare(b.startDate)), ratesUsed: [...new Set(lines.map((l) => l.rate))] };
}
