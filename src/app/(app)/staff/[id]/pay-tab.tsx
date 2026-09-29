import Link from "next/link";
import { Card } from "@/components/kit";
import { getOvertimeRules, getPayRules, listPayNotes, listPayRates, listPaySchedules } from "@/db/pay-queries";
import type { Staff } from "@/db/schema";
import { fmtMoney, fromLocalInput } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { HOLD_DETAIL, HOLD_LABEL, computePay, workweekStart, type PaySummary } from "@/lib/pay";
import { addDays, chicagoDate, currentPayPeriod, describePayRule, payPeriodFromParam, periodFromDates, recentPayPeriods, shiftPayPeriod } from "@/lib/pay-period";
import { ExemptSwitch, PeriodPicker, RateHistory, ScheduleButton } from "./pay-controls";

/**
 * The Pay tab (Sept 29, 2026, the user's pick "3" of three mockups): what this person has earned in a
 * pay period, split into what is ready to pay and what is held until a note is fixed. An estimate only
 * — gross, before taxes and deductions — so there is nothing to download.
 */
type Params = Record<string, string | string[] | undefined>;
const str = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const hrs = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const fmtDay = (iso: string) => dayLabel.format(new Date(`${iso}T00:00:00Z`));
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });

export async function PayTab({ staff, sp, canEditPay, canEditSchedule }: { staff: Staff; sp: Params; canEditPay: boolean; canEditSchedule: boolean }) {
  const [rules, ot, rateRows, schedules] = await Promise.all([getPayRules(), getOvertimeRules(), listPayRates(staff.id), listPaySchedules()]);
  const payFrom = str(sp, "payFrom"), payTo = str(sp, "payTo");
  const custom = payFrom && payTo && ISO.test(payFrom) && ISO.test(payTo) && payFrom <= payTo ? { from: payFrom, to: payTo } : null;
  const period = custom ? periodFromDates(custom.from, custom.to) : payPeriodFromParam(str(sp, "period"), rules);
  const current = currentPayPeriod(rules);
  const rates = rateRows.map((r) => ({ rate: Number(r.rate), effectiveFrom: r.effectiveFrom }));

  // Overtime counts whole workweeks, so notes are read from the start of the workweek holding the earliest day shown.
  const earlier = custom ? [] : [shiftPayPeriod(period, -1, rules), shiftPayPeriod(period, -2, rules), shiftPayPeriod(period, -3, rules)];
  const firstDay = earlier.length ? earlier[earlier.length - 1].startDate : period.startDate;
  const notes = await listPayNotes(staff.id, fromLocalInput(`${workweekStart(firstDay, ot.workweekStartDay)}T00:00`), period.end);
  const pay = (p: typeof period): PaySummary => computePay({ notes: notes.filter((n) => n.clockInAt <= p.end), period: p, rates, rules: ot, exempt: staff.overtimeExempt });
  const summary = pay(period);
  const history = earlier.map((p) => ({ p, s: pay(p) }));

  const base = `/staff/${staff.id}?tab=pay`;
  const q = (p: typeof period) => `period=${p.startDate}`;
  const options = [...recentPayPeriods(8, rules), shiftPayPeriod(current, 1, rules)].reverse().map((p) => ({ param: q(p), label: p.label, current: p.startDate === current.startDate, selected: !custom && p.startDate === period.startDate }));
  const ruleNow = [...rules].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)).find((r) => r.effectiveFrom <= current.startDate) ?? rules[0];
  const held = summary.lines.filter((l) => l.held.length);
  const noteHref = (id: string) => `${base}&${custom ? `payFrom=${custom.from}&payTo=${custom.to}` : q(period)}&note=${id}`;
  const today = chicagoDate(new Date());
  const status = custom ? "Custom dates" : period.startDate === current.startDate ? "Current pay period" : period.startDate > current.startDate ? "Upcoming pay period" : "Earlier pay period";
  const otLine = staff.overtimeExempt ? "No overtime (exempt)" : `Overtime after ${ot.weeklyHours} h a week${ot.dailyHours != null ? ` or ${ot.dailyHours} h a day` : ""} at ${ot.multiplier}×`;

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodPicker base={base} label={period.label} prev={custom ? undefined : q(shiftPayPeriod(period, -1, rules))} next={custom ? undefined : q(shiftPayPeriod(period, 1, rules))} options={options} custom={custom} />
        <span className="text-[13.5px] text-muted-foreground">{status}</span>
        <span className="ml-auto"><ScheduleButton description={describePayRule(ruleNow)} schedules={schedules.map((s) => ({ id: s.id, effectiveFrom: s.effectiveFrom, frequency: s.frequency, anchorDate: s.anchorDate }))} canEdit={canEditSchedule} /></span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-ok/30 bg-ok-soft/60 px-6 py-5">
          <div className="text-[13.5px] font-medium text-ok">Ready to pay</div>
          <div className="mt-1 text-[38px] font-medium leading-tight tracking-tight text-text-strong tabular-nums">{fmtMoney(summary.ready.pay)}</div>
          <div className="text-[13.5px] text-muted-foreground">{hrs(summary.ready.hours)} h{summary.ready.overtimeHours > 0 ? `, including ${hrs(summary.ready.overtimeHours)} h overtime` : ""} · {summary.ready.count} signed note{summary.ready.count === 1 ? "" : "s"}</div>
        </div>
        <div className={held.length ? "rounded-xl border border-warn/30 bg-warn-soft/60 px-6 py-5" : "rounded-xl border border-line px-6 py-5"}>
          <div className={held.length ? "text-[13.5px] font-medium text-warn" : "text-[13.5px] font-medium text-muted-foreground"}>On hold until fixed</div>
          <div className={`mt-1 text-[38px] font-medium leading-tight tracking-tight tabular-nums ${held.length ? "text-warn" : "text-muted-foreground"}`}>{fmtMoney(summary.held.pay)}</div>
          <div className="text-[13.5px] text-muted-foreground">{held.length ? <>{hrs(summary.held.hours)} h · {held.length} note{held.length === 1 ? "" : "s"}{summary.held.open > 0 ? ` · ${summary.held.open} still clocked in, not counted yet` : ""}</> : "Nothing held"}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13.5px] text-muted-foreground">
        <span>{summary.ratesUsed.length > 1 ? `Rates ${summary.ratesUsed.map((r) => fmtMoney(r)).join(" and ")}/hr (changed during this period)` : `Rate ${fmtMoney(summary.ratesUsed[0] ?? Number(staff.payRate))}/hr`}</span>
        <span>{otLine}</span>
        <span className="text-text"><ExemptSwitch staffId={staff.id} exempt={staff.overtimeExempt} canEdit={canEditPay} /></span>
      </div>

      {held.length > 0 && (
        <Card title="On hold" description="Paid once the note is fixed. Signatures from both the caregiver and the client are needed.">
          <table className="w-full text-[14px]">
            <thead><tr className="text-left text-[12.5px] text-muted-foreground"><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Why it is held</th><th className="px-3 py-2 text-right font-medium">Hours</th><th className="px-3 py-2 text-right font-medium">Pay</th><th className="px-5 py-2" /></tr></thead>
            <tbody>
              {held.map((l) => (
                <tr key={l.note.id} className="border-t border-line-soft">
                  <td className="whitespace-nowrap px-5 py-2.5">{fmtDay(l.date)}</td>
                  <td className="px-3 py-2.5">{l.note.clientName}</td>
                  <td className="px-3 py-2.5"><span className="flex flex-wrap gap-1.5">{l.held.map((h) => <span key={h} title={h === "client_reason" && l.note.clientReason ? `Reason recorded: ${l.note.clientReason}` : HOLD_DETAIL[h]} className={`rounded-md px-2 py-0.5 text-[12.5px] font-medium ${h === "open" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>{HOLD_LABEL[h]}</span>)}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.hours == null ? "—" : hrs(l.hours)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{l.pay == null ? "—" : fmtMoney(l.pay)}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right"><Link href={l.held.includes("open") ? `${noteHref(l.note.id).replace("&note=", "&visit=")}` : noteHref(l.note.id)} className="font-medium text-primary hover:underline">{l.held.includes("open") ? "Fix times →" : "Open note →"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title={`All notes · ${summary.lines.length}`} description={summary.lines.length ? `${hrs(summary.total.hours)} h in all, ${hrs(summary.total.overtimeHours)} h of it overtime · ${fmtMoney(summary.total.pay)} estimated` : undefined}>
        {summary.lines.length === 0 ? (
          <p className="px-5 py-4 text-[14px] text-muted-foreground">No notes in {custom ? "these dates" : "this pay period"}.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead><tr className="text-left text-[12.5px] text-muted-foreground"><th className="px-5 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Client</th><th className="px-3 py-2 font-medium">Service</th><th className="px-3 py-2 font-medium">Time</th><th className="px-3 py-2 text-right font-medium">Hours</th><th className="px-3 py-2 text-right font-medium">Overtime</th><th className="px-3 py-2 text-right font-medium">Rate</th><th className="px-5 py-2 text-right font-medium">Pay</th></tr></thead>
            <tbody>
              {summary.lines.map((l) => (
                <tr key={l.note.id} className="border-t border-line-soft">
                  <td className="whitespace-nowrap px-5 py-2"><Link href={noteHref(l.note.id)} className="hover:underline">{fmtDay(l.date)}</Link></td>
                  <td className="px-3 py-2">{l.note.clientName}</td>
                  <td className="px-3 py-2">{labelForCode(l.note.serviceCode, l.note.modifiers)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{timeFmt.format(l.note.clockInAt)} – {l.note.clockOutAt ? timeFmt.format(l.note.clockOutAt) : "…"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.hours == null ? "—" : hrs(l.hours)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.overtimeHours > 0 ? hrs(l.overtimeHours) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(l.rate)}</td>
                  <td className={`px-5 py-2 text-right tabular-nums ${l.held.length ? "text-warn" : ""}`}>{l.pay == null ? "—" : fmtMoney(l.pay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        {history.length > 0 && (
          <Card title="Earlier pay periods">
            <table className="w-full text-[14px]">
              <thead><tr className="text-left text-[12.5px] text-muted-foreground"><th className="px-5 py-2 font-medium">Pay period</th><th className="px-3 py-2 text-right font-medium">Hours</th><th className="px-3 py-2 text-right font-medium">Overtime</th><th className="px-5 py-2 text-right font-medium">Estimated</th></tr></thead>
              <tbody>
                {history.map(({ p, s }) => (
                  <tr key={p.startDate} className="border-t border-line-soft">
                    <td className="px-5 py-2.5"><Link href={`${base}&${q(p)}`} className="hover:underline">{p.label}</Link></td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{hrs(s.total.hours)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{hrs(s.total.overtimeHours)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{fmtMoney(s.total.pay)}{s.held.count > 0 && <span className="ml-1.5 text-[12.5px] text-warn">({s.held.count} held)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <Card padded title="Pay rate history" description="Each day is paid at the rate in effect that day.">
          <RateHistory staffId={staff.id} canEdit={canEditPay} today={today} rates={rateRows.map((r) => ({ id: r.id, rate: r.rate, effectiveFrom: r.effectiveFrom, note: r.note }))} />
        </Card>
      </div>

      <p className="text-[13px] text-muted-foreground">An estimate from clock-in and clock-out times × the rate in effect each day, before taxes and deductions. It is not a pay stub. A note counts on the day it was clocked in; {period.startDate !== workweekStart(period.startDate, ot.workweekStartDay) ? `overtime counts the whole workweek, including ${fmtDay(workweekStart(period.startDate, ot.workweekStartDay))} to ${fmtDay(addDays(period.startDate, -1))} from the period before.` : "overtime counts whole workweeks."}</p>
    </div>
  );
}
