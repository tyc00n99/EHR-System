import { listAllAvailability } from "@/db/profile-queries";
import { getOrganization, listAgreementsWithUsage, listPeople, listShifts, listStaff, getShift } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDayTime, fromLocalInput } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { chicagoDate } from "@/lib/pay-period";
import { ActionItems, type ActionGroup } from "./action-items";
import { MonthGrid } from "./month-grid";
import { ScheduleGrid, type GridDay, type GridEvent, type GridRow } from "./schedule-grid";
import { ScheduleToolbar, type ToolbarState } from "./schedule-toolbar";
import { ShiftSheet } from "./shift-sheet";

export const metadata = { title: "Schedule" };

/** Calendar arithmetic on yyyy-mm-dd, in Chicago, without pulling a date library in. */
const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekStart = (iso: string) => addDays(iso, -new Date(iso + "T12:00:00Z").getUTCDay());
const monthStart = (iso: string) => iso.slice(0, 8) + "01";
const dayOfWeek = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();
const fmt = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z"));
const shortTime = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(d).replace(" AM", "a").replace(" PM", "p");

export default async function SchedulingPage({ searchParams }: PageProps<"/scheduling">) {
  const user = await requireUser();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const today = chicagoDate(new Date());
  const mode = one("mode") === "team" ? "team" : "clients";
  const view = one("view") === "daily" ? "daily" : one("view") === "monthly" ? "monthly" : "weekly";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(one("date")) ? one("date") : today;
  const dept = one("dept");
  const qRaw = one("q").trim();
  const q = qRaw.toLowerCase();
  const codeF = one("code");
  const statusF = one("status");
  const staffF = one("staff");

  // The window the whole screen works from: one day, a Sunday week, or a whole month.
  const from = view === "daily" ? date : view === "weekly" ? weekStart(date) : monthStart(date);
  const to = view === "daily" ? date : view === "weekly" ? addDays(from, 6) : addDays(addDays(from, 32).slice(0, 8) + "01", -1);
  const step = view === "daily" ? 1 : view === "weekly" ? 7 : 30;

  const [rows, people, staffRows, agreements, availability, org, openShift] = await Promise.all([
    listShifts(fromLocalInput(`${from}T00:00`), fromLocalInput(`${addDays(to, 1)}T00:00`), user.role === "dsp" ? { staffId: user.staffId ?? undefined } : {}),
    listPeople(),
    listStaff(true),
    listAgreementsWithUsage(),
    listAllAvailability(),
    getOrganization(),
    one("shift") ? getShift(one("shift")) : null,
  ]);

  const manage = user.role !== "dsp";

  // Days along the top. Monthly hands its own grid the same range.
  const span = view === "daily" ? 1 : view === "weekly" ? 7 : 0;
  const shown = org?.scheduleDays?.length ? org.scheduleDays : [0, 1, 2, 3, 4, 5, 6];
  const days: GridDay[] = Array.from({ length: span }, (_, i) => {
    const d = addDays(from, i);
    // The reference writes the weekday first — "Sun 6", not "6 Sun".
    return { date: d, label: `${fmt(d, { weekday: "short" })} ${Number(d.slice(8))}`, today: d === today };
  }).filter((d) => view === "daily" || shown.includes(dayOfWeek(d.date)));

  const visible = rows.filter((r) =>
    (!codeF || r.serviceCode === codeF) && (!statusF || r.shift.status === statusF) && (!staffF || r.shift.staffId === staffF),
  );
  const events: GridEvent[] = visible.map((r) => ({
    id: r.shift.id,
    date: chicagoDate(r.shift.startAt),
    rowId: mode === "team" ? r.shift.staffId : r.shift.personId,
    time: `${shortTime(r.shift.startAt)} – ${shortTime(r.shift.endAt)}`,
    title: mode === "team" ? `${r.personFirst} ${r.personLast}` : `${r.staffFirst} ${r.staffLast}`,
    service: labelForCode(r.serviceCode, r.modifiers),
    code: r.serviceCode,
    status: r.shift.status,
  }));

  // Days a client has no availability window at all, drawn as the reference's grey "Unavailable".
  const covered = new Map<string, Set<number>>();
  for (const a of availability) {
    if (!covered.has(a.personId)) covered.set(a.personId, new Set());
    covered.get(a.personId)!.add(a.weekday);
  }
  const offDays = (personId: string) => {
    const set = covered.get(personId);
    if (!set) return [];
    return days.filter((d) => !set.has(dayOfWeek(d.date))).map((d) => d.date);
  };

  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const gridRows: GridRow[] = mode === "team"
    ? staffRows
        .filter((s) => matches(`${s.firstName} ${s.lastName}`))
        .map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, meta: s.title ?? undefined, href: `/staff/${s.id}` }))
    : people
        .filter((p) => p.status !== "discharged")
        .filter((p) => matches(`${p.firstName} ${p.lastName}`))
        .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, href: `/clients/${p.id}`, unavailable: offDays(p.id) }));

  // Action items. Four fixed categories, as in the reference, filled from what we actually hold.
  const cancelled = rows.filter((r) => r.shift.status === "cancelled");
  const notEligible = rows.filter((r) => r.shift.status === "scheduled" && !staffRows.some((s) => s.id === r.shift.staffId));
  const agreementById = new Map(agreements.map((a) => [a.agreement.id, a]));
  const authTrouble = rows.filter((r) => {
    const a = agreementById.get(r.shift.serviceAgreementId);
    if (!a) return true;
    const d = chicagoDate(r.shift.startAt);
    return a.agreement.status !== "active" || d < a.agreement.startDate || d > a.agreement.endDate;
  });
  const heavy = agreements.filter((a) => a.agreement.status === "active" && a.agreement.authorizedUnits > 0 && a.unitsUsed / a.agreement.authorizedUnits >= 0.75);

  const groups: ActionGroup[] = [
    {
      key: "cancellations",
      label: "Cancellations",
      empty: "There are no cancellations in the current timeframe and filters",
      items: cancelled.map((r) => ({ id: r.shift.id, title: `${r.personFirst} ${r.personLast}`, detail: `${fmtDayTime(r.shift.startAt)} · ${r.staffFirst} ${r.staffLast}`, href: `/scheduling?shift=${r.shift.id}` })),
    },
    {
      key: "unassigned",
      label: "Unassigned",
      empty: "There are no unassigned events in the current timeframe and filters",
      items: notEligible.map((r) => ({ id: r.shift.id, title: `${r.personFirst} ${r.personLast}`, detail: `${fmtDayTime(r.shift.startAt)} · the caregiver is no longer active`, href: `/scheduling?shift=${r.shift.id}` })),
    },
    {
      key: "authIssues",
      label: "Authorization issues",
      empty: "There are no authorization issues in the current timeframe and filters",
      items: authTrouble.map((r) => ({ id: r.shift.id, title: `${r.personFirst} ${r.personLast}`, detail: `${fmtDayTime(r.shift.startAt)} · outside the authorization dates`, href: `/clients/${r.shift.personId}?tab=profile&section=authorizations` })),
    },
    {
      key: "authUtilisation",
      label: "Authorization utilization",
      empty: "There are no authorizations near their limit in the current timeframe and filters",
      items: heavy.map((a) => ({ id: a.agreement.id, title: `${a.personFirst} ${a.personLast}`, detail: `${Math.round((a.unitsUsed / a.agreement.authorizedUnits) * 100)}% of ${a.agreement.serviceCode} units used`, href: `/clients/${a.agreement.personId}?tab=profile&section=authorizations` })),
    },
  ];

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ mode, view, date, dept, q, code: codeF, status: statusF, staff: staffF, ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/scheduling?${p}`;
  };
  const rangeLabel = view === "daily"
    ? fmt(from, { weekday: "short", month: "short", day: "numeric" })
    : view === "monthly"
      ? fmt(from, { month: "long", year: "numeric" })
      : `${fmt(from, { month: "short", day: "numeric" })} - ${fmt(to, { month: "short", day: "numeric" })}`;

  const state: ToolbarState = {
    mode, view, date,
    rangeLabel,
    prev: href({ date: addDays(from, -step) }),
    next: href({ date: addDays(from, step) }),
    today: href({ date: today }),
    dept, q: qRaw, code: codeF, status: statusF, staff: staffF,
  };
  // The reference's "departments" list holds the organisation itself; ours is one agency.
  const departments = org ? [{ id: org.id, name: org.name }] : [];
  const seen = new Set<string>();
  const services = rows
    .map((r) => ({ code: r.serviceCode, label: labelForCode(r.serviceCode, r.modifiers) }))
    .filter((x) => !seen.has(x.code) && seen.add(x.code))
    .sort((a, b) => a.label.localeCompare(b.label));
  const teamList = staffRows.map((st) => ({ id: st.id, name: `${st.firstName} ${st.lastName}` }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {openShift && (
        <ShiftSheet
          shift={{
            id: openShift.shift.id, status: openShift.shift.status,
            start: openShift.shift.startAt.toISOString(), end: openShift.shift.endAt.toISOString(),
            note: openShift.shift.note, seriesId: openShift.shift.seriesId,
            client: `${openShift.person.firstName} ${openShift.person.lastName}`, personId: openShift.person.id,
            staff: `${openShift.staff.firstName} ${openShift.staff.lastName}`, staffId: openShift.staff.id,
            service: labelForCode(openShift.agreement.serviceCode, openShift.agreement.modifiers),
            agreementNumber: openShift.agreement.agreementNumber, visitId: openShift.visit?.id ?? null,
          }}
          office={manage}
        />
      )}

      <ScheduleToolbar
        state={state}
        departments={departments}
        participants={{
          clients: people.filter((pp) => pp.status !== "discharged").map((pp) => ({ id: pp.id, name: `${pp.firstName} ${pp.lastName}` })),
          team: teamList,
        }}
        services={services}
        careTeam={teamList}
        canManage={manage}
        alerts={groups.reduce((n, g) => n + g.items.length, 0)}
      />

      <div className="flex min-h-0 flex-1">
        <ActionItems label={rangeLabel} groups={groups} />
        {view === "monthly" ? (
          <MonthGrid from={from} today={today} events={events} baseHref={href({})} />
        ) : (
          <ScheduleGrid
            rows={gridRows}
            days={days}
            events={events}
            axisLabel={mode === "team" ? "Team" : "Clients"}
            emptyLabel={mode === "team" ? "No caregivers match these filters." : "No clients match these filters."}
            canCreate={manage}
          />
        )}
      </div>
    </div>
  );
}
