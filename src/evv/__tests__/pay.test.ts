import assert from "node:assert/strict";
import { test } from "node:test";
import { fromLocalInput } from "../../lib/format";
import { computePay, holdReasons, type PayNote } from "../../lib/pay";
import { payPeriodContaining, periodFromDates, shiftPayPeriod, type PayRule } from "../../lib/pay-period";

// Pay estimates and pay schedules (Sept 29, 2026). Lives beside the EVV tests only because that is the
// folder `npm test` runs.

const note = (day: string, from: string, to: string | null, extra: Partial<PayNote> = {}): PayNote => ({
  id: `${day}-${from}`, personId: "p", clientName: "Client", serviceCode: "S5135", modifiers: [],
  clockInAt: fromLocalInput(`${day}T${from}`), clockOutAt: to ? fromLocalInput(`${day}T${to}`) : null, open: !to,
  staffSigned: true, clientSigned: true, clientReason: null, ...extra,
});
const MN = { weeklyHours: 48, dailyHours: null, multiplier: 1.5, workweekStartDay: 0 };
const period = periodFromDates("2026-09-20", "2026-10-03");

test("hours past the weekly limit pay at the multiplier", () => {
  // Sun Sep 20 – Sat Sep 26: five 10-hour days = 50 hours, 2 over a 48-hour week.
  const notes = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((d) => note(d, "08:00", "18:00"));
  const s = computePay({ notes, period, rates: [{ rate: 20, effectiveFrom: "2020-01-01" }], rules: MN, exempt: false });
  assert.equal(s.total.hours, 50);
  assert.equal(s.total.overtimeHours, 2);
  assert.equal(s.total.pay, 48 * 20 + 2 * 30);
});

test("an exempt employee gets no overtime", () => {
  const notes = ["2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24"].map((d) => note(d, "08:00", "18:00"));
  const s = computePay({ notes, period, rates: [{ rate: 20, effectiveFrom: "2020-01-01" }], rules: MN, exempt: true });
  assert.equal(s.total.overtimeHours, 0);
  assert.equal(s.total.pay, 1000);
});

test("a daily limit makes hours past it overtime without counting them toward the week", () => {
  const s = computePay({ notes: [note("2026-09-21", "06:00", "18:00")], period, rates: [{ rate: 10, effectiveFrom: "2020-01-01" }], rules: { ...MN, dailyHours: 8 }, exempt: false });
  assert.equal(s.total.overtimeHours, 4);
  assert.equal(s.total.pay, 8 * 10 + 4 * 15);
});

test("the workweek reaches back into the previous pay period for overtime", () => {
  // Workweek starts Wednesday: Sep 16–19 are before the period but in the same workweek as Sep 20–22.
  const rules = { ...MN, weeklyHours: 40, workweekStartDay: 3 };
  const notes = ["2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"].map((d) => note(d, "08:00", "18:00"));
  const s = computePay({ notes, period, rates: [{ rate: 10, effectiveFrom: "2020-01-01" }], rules, exempt: false });
  assert.equal(s.lines.length, 1, "only Sep 20 is paid in this period");
  assert.equal(s.lines[0].overtimeHours, 10, "Sep 20's hours are all past 40 for that workweek");
});

test("a raise mid-period pays each day at the rate in effect that day", () => {
  const notes = [note("2026-09-21", "08:00", "12:00"), note("2026-09-28", "08:00", "12:00")];
  const s = computePay({ notes, period, rates: [{ rate: 18, effectiveFrom: "2026-01-01" }, { rate: 20, effectiveFrom: "2026-09-27" }], rules: MN, exempt: false });
  assert.deepEqual(s.lines.map((l) => l.rate), [18, 20]);
  assert.equal(s.total.pay, 4 * 18 + 4 * 20);
});

test("unsigned by the caregiver or the client, or still clocked in, is held", () => {
  assert.deepEqual(holdReasons(note("2026-09-21", "08:00", null)), ["open"]);
  assert.deepEqual(holdReasons(note("2026-09-21", "08:00", "12:00", { staffSigned: false })), ["caregiver_unsigned"]);
  assert.deepEqual(holdReasons(note("2026-09-21", "08:00", "12:00", { clientSigned: false })), ["client_unsigned"]);
  assert.deepEqual(holdReasons(note("2026-09-21", "08:00", "12:00", { clientSigned: false, clientReason: "Asleep" })), ["client_reason"], "a recorded reason still holds, labelled apart");
  const s = computePay({ notes: [note("2026-09-21", "08:00", "12:00"), note("2026-09-22", "08:00", "12:00", { clientSigned: false })], period, rates: [{ rate: 20, effectiveFrom: "2020-01-01" }], rules: MN, exempt: false });
  assert.equal(s.ready.pay, 80);
  assert.equal(s.held.pay, 80);
});

test("changing the schedule ends the old period the day before the new one starts", () => {
  const rules: PayRule[] = [
    { effectiveFrom: "2000-01-01", frequency: "biweekly", anchorDate: "2026-08-23" },
    { effectiveFrom: "2026-10-01", frequency: "semimonthly", anchorDate: "2026-10-01" },
  ];
  const cut = payPeriodContaining("2026-09-25", rules);
  assert.equal(cut.startDate, "2026-09-20");
  assert.equal(cut.endDate, "2026-09-30");
  const next = shiftPayPeriod(cut, 1, rules);
  assert.deepEqual([next.startDate, next.endDate], ["2026-10-01", "2026-10-15"]);
  assert.deepEqual([shiftPayPeriod(next, 1, rules).startDate, shiftPayPeriod(next, 1, rules).endDate], ["2026-10-16", "2026-10-31"]);
  assert.equal(shiftPayPeriod(next, -1, rules).startDate, "2026-09-20");
});

test("weekly and monthly periods", () => {
  const weekly: PayRule[] = [{ effectiveFrom: "2000-01-01", frequency: "weekly", anchorDate: "2026-09-21" }];
  assert.deepEqual(Object.values(payPeriodContaining("2026-09-23", weekly)).slice(0, 2), ["2026-09-21", "2026-09-27"]);
  const monthly: PayRule[] = [{ effectiveFrom: "2000-01-01", frequency: "monthly", anchorDate: "2026-01-01" }];
  assert.deepEqual(Object.values(payPeriodContaining("2028-02-10", monthly)).slice(0, 2), ["2028-02-01", "2028-02-29"]);
});
