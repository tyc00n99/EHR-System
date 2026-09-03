import Link from "next/link";
import { PageHeader } from "@/components/kit";
import { listClockableAgreements, listShifts, listStaff, getShift } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { labelForCode } from "@/lib/hcpcs";
import { chicagoDate } from "@/lib/pay-period";
import { fromLocalInput } from "@/lib/format";
import { WeekCalendar, type CalShift } from "./week-calendar";
import { NewShiftSheet, ShiftSheet } from "./shift-sheet";

export const metadata = { title: "Scheduling" };

function addDays(iso: string, n: number) { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function weekStart(iso: string) { const d = new Date(iso + "T12:00:00Z"); return addDays(iso, -d.getUTCDay()); }

export default async function SchedulingPage({ searchParams }: PageProps<"/scheduling">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = chicagoDate(new Date());
  const start = weekStart(typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const end = addDays(start, 6);
  const staffFilter = typeof sp.staff === "string" ? sp.staff : user.role === "dsp" ? (user.staffId ?? undefined) : undefined;
  const [rows, staffRows, agreements, openShift] = await Promise.all([
    listShifts(fromLocalInput(`${start}T00:00`), fromLocalInput(`${addDays(end, 1)}T00:00`), { staffId: staffFilter }),
    user.role === "dsp" ? [] : listStaff(true),
    user.role === "dsp" ? [] : listClockableAgreements(),
    typeof sp.shift === "string" ? getShift(sp.shift) : null,
  ]);
  const shiftsView: CalShift[] = rows.map((r) => ({ id: r.shift.id, date: chicagoDate(r.shift.startAt), start: r.shift.startAt.toISOString(), end: r.shift.endAt.toISOString(), status: r.shift.status, client: `${r.personFirst} ${r.personLast}`, staff: `${r.staffFirst} ${r.staffLast}`, service: labelForCode(r.serviceCode, r.modifiers), code: r.serviceCode }));
  const label = `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(start + "T12:00:00Z"))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(end + "T12:00:00Z"))}`;
  const q = (week: string, extra: Record<string, string> = {}) => `/scheduling?${new URLSearchParams({ week, ...(staffFilter && user.role !== "dsp" ? { staff: staffFilter } : {}), ...extra })}`;
  const office = user.role !== "dsp";
  const totalHours = rows.filter((r) => r.shift.status !== "cancelled").reduce((n, r) => n + (r.shift.endAt.getTime() - r.shift.startAt.getTime()) / 3_600_000, 0);

  return (
    <div>
      {openShift && <ShiftSheet shift={{ id: openShift.shift.id, status: openShift.shift.status, start: openShift.shift.startAt.toISOString(), end: openShift.shift.endAt.toISOString(), note: openShift.shift.note, seriesId: openShift.shift.seriesId, client: `${openShift.person.firstName} ${openShift.person.lastName}`, personId: openShift.person.id, staff: `${openShift.staff.firstName} ${openShift.staff.lastName}`, staffId: openShift.staff.id, service: labelForCode(openShift.agreement.serviceCode, openShift.agreement.modifiers), agreementNumber: openShift.agreement.agreementNumber, visitId: openShift.visit?.id ?? null }} office={office} />}
      {sp.new === "1" && office && <NewShiftSheet defaultDate={typeof sp.date === "string" ? sp.date : today} staff={staffRows.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))} agreements={agreements.map((a) => ({ id: a.agreement.id, personId: a.person.id, personName: `${a.person.firstName} ${a.person.lastName}`, label: `${labelForCode(a.agreement.serviceCode, a.agreement.modifiers)} · ${a.agreement.agreementNumber}` }))} />}
      <PageHeader title="Scheduling" meta={<span>{rows.filter((r) => r.shift.status !== "cancelled").length} shifts · {totalHours.toFixed(1)} scheduled hours this week{user.role === "dsp" ? " · your schedule" : ""}</span>} actions={office && <Link href={q(start, { new: "1" })} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground hover:bg-primary-hover">New shift</Link>} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={q(today)} className="inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Today</Link>
        <Link href={q(addDays(start, -7))} aria-label="Previous week" className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-page hover:bg-hover">‹</Link>
        <Link href={q(addDays(start, 7))} aria-label="Next week" className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-page hover:bg-hover">›</Link>
        <span className="ml-1 text-[16px] font-semibold text-text-strong">{label}</span>
        {office && (
          <form className="ml-auto flex items-center gap-2" action="/scheduling"><input type="hidden" name="week" value={start} />
            <select name="staff" defaultValue={staffFilter ?? ""} className="h-8 rounded-md border border-line bg-page px-2 text-[13px]"><option value="">All caregivers</option>{staffRows.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select>
            <button className="h-8 rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Filter</button>
          </form>
        )}
      </div>
      <WeekCalendar start={start} today={today} shifts={shiftsView} baseHref={q(start)} canCreate={office} />
    </div>
  );
}
