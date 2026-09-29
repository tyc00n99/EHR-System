import Link from "next/link";
import { Card } from "@/components/kit";
import { getOvertimeRules, getPayRules, listPayNotes, listPayRates } from "@/db/pay-queries";
import type { Staff } from "@/db/schema";
import { fmtMoney, fromLocalInput } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { HOLD_DETAIL, HOLD_LABEL, computePay, workweekStart, type PaySummary } from "@/lib/pay";
import { addDays, chicagoDate, currentPayPeriod, payPeriodFromParam, periodFromDates, shiftPayPeriod } from "@/lib/pay-period";
import { ExemptSwitch, NoteLink, PayNotesWarmup, PayRangePicker, RateHistory } from "./pay-controls";

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

export async function PayTab({ staff, sp, canEditPay }: { staff: Staff; sp: Params; canEditPay: boolean }) {
  const [rules, ot, rateRows] = await Promise.all([getPayRules(), getOvertimeRules(), listPayRates(staff.id)]);
  const payFrom = str(sp, "payFrom"), payTo = str(sp, "payTo");
  const custom = payFrom && payTo && ISO.test(payFrom) && ISO.test(payTo) && payFrom <= payTo ? { from: payFrom, to: payTo } : null;
  const period = custom ? periodFromDates(custom.from, custom.to) : payPeriodFromParam(str(sp, "period"), rules);
  const current = currentPayPeriod(rules);
  const today = chicagoDate(new Date());
  // No history yet (a record written straight to the database): price at the rate on the staff record.
  const rates = rateRows.length ? rateRows.map((r) => ({ rate: Number(r.rate), effectiveFrom: r.effectiveFrom })) : [{ rate: Number(staff.payRate), effectiveFrom: staff.hireDate }];

  // Overtime counts whole workweeks, so notes are read from the start of the workweek holding the earliest day shown.
  const earlier = custom ? [] : [shiftPayPeriod(period, -1, rules), shiftPayPeriod(period, -2, rules), shiftPayPeriod(period, -3, rules)];
  const firstDay = earlier.length ? earlier[earlier.length - 1].startDate : period.startDate;
  const notes = await listPayNotes(staff.id, fromLocalInput(`${workweekStart(firstDay, ot.workweekStartDay)}T00:00`), period.end);
  const pay = (p: typeof period): PaySummary => computePay({ notes: notes.filter((n) => n.clockInAt <= p.end), period: p, rates, rules: ot, exempt: staff.overtimeExempt });
  const summary = pay(period);
  const history = earlier.map((p) => ({ p, s: pay(p) }));

  const base = `/staff/${staff.id}?tab=pay`;
  const q = (p: typeof period) => `period=${p.startDate}`;
  // The calendar's rail: pay periods first, then calendar months. Any start and end can be picked instead.
  const last = shiftPayPeriod(current, -1, rules);
  const monthStart = today.slice(0, 8) + "01";
  const prevMonthEnd = addDays(monthStart, -1);
  const presets = [
    { label: "This pay period", hint: current.label, param: q(current) },
    { label: "Last pay period", hint: last.label, param: q(last) },
    { label: "This month", hint: periodFromDates(monthStart, today).label, param: `from=${monthStart}&to=${today}` },
    { label: "Last month", hint: periodFromDates(prevMonthEnd.slice(0, 8) + "01", prevMonthEnd).label, param: `from=${prevMonthEnd.slice(0, 8)}01&to=${prevMonthEnd}` },
  ];
  // The arrows step by the range itself: a whole pay period, or the same number of days for picked dates.
  const span = custom ? Math.round((Date.parse(custom.to) - Date.parse(custom.from)) / 86_400_000) + 1 : 0;
  const prevParam = custom ? `from=${addDays(custom.from, -span)}&to=${addDays(custom.from, -1)}` : q(shiftPayPeriod(period, -1, rules));
  const nextParam = custom ? `from=${addDays(custom.to, 1)}&to=${addDays(custom.to, span)}` : q(shiftPayPeriod(period, 1, rules));
  const held = summary.lines.filter((l) => l.held.length);
  const noteHref = (id: string) => `${base}&${custom ? `payFrom=${custom.from}&payTo=${custom.to}` : q(period)}&note=${id}`;
  const status = custom ? "Custom dates" : period.startDate === current.startDate ? "Current pay period" : period.startDate > current.startDate ? "Upcoming pay period" : "Earlier pay period";
  const otLine = staff.overtimeExempt ? "No overtime (exempt)" : `Overtime after ${ot.weeklyHours} h a week${ot.dailyHours != null ? ` or ${ot.dailyHours} h a day` : ""} at ${ot.multiplier}×`;

  return (
    <div className="grid gap-5">
      {/* Warms the PDFs so a note opens at once; no filmstrip here (user, Sept 29, 2026). */}
      <PayNotesWarmup ids={summary.lines.filter((l) => !l.note.open).map((l) => l.note.id)} />
      <div className="flex flex-wrap items-center gap-3">
        <PayRangePicker base={base} label={period.label} prev={prevParam} next={nextParam} presets={presets} current={{ from: period.startDate, to: period.endDate, param: custom ? `from=${custom.from}&to=${custom.to}` : q(period) }} />
        <span className="text-[13.5px] text-muted-foreground">{status}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Hours first and loudest (user, Sept 29, 2026): they are what gets typed into Gusto, split the way Gusto asks. */}
        <div className="rounded-xl border-2 border-primary bg-primary-soft/40 px-6 py-5">
          <div className="text-[13.5px] font-medium text-primary">Total hours</div>
          <div className="mt-1 text-[38px] font-medium leading-tight tracking-tight text-text-strong tabular-nums">{hrs(summary.total.hours)} h</div>
          <div className="mt-1 grid grid-cols-2 gap-x-4 text-[13.5px]">
            <span className="text-muted-foreground">Regular</span><span className="text-right font-medium tabular-nums text-text-strong">{hrs(summary.total.regularHours)} h</span>
            <span className="text-muted-foreground">Overtime</span><span className="text-right font-medium tabular-nums text-text-strong">{hrs(summary.total.overtimeHours)} h</span>
          </div>
          {held.length > 0 && <div className="mt-2 border-t border-primary/20 pt-2 text-[13px] text-muted-foreground">Ready to pay: <span className="font-medium tabular-nums text-text-strong">{hrs(summary.ready.hours - summary.ready.overtimeHours)} h</span> regular, <span className="font-medium tabular-nums text-text-strong">{hrs(summary.ready.overtimeHours)} h</span> overtime</div>}
        </div>
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
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">{l.held.includes("open") ? <Link href={noteHref(l.note.id).replace("&note=", "&visit=")} className="font-medium text-primary hover:underline">Fix times →</Link> : <NoteLink id={l.note.id} className="font-medium text-primary hover:underline">Open note →</NoteLink>}</td>
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
                  <td className="whitespace-nowrap px-5 py-2"><NoteLink id={l.note.id} className="hover:underline">{fmtDay(l.date)}</NoteLink></td>
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
    </div>
  );
}
