import Link from "next/link";
import { Icon } from "@/components/icons";
import type { ReactNode } from "react";
import { Badge, Card, cx, Empty, LinkButton, Notice, StatTile, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { dashboardCounts, getOpenVisitForStaff, getStaff, listAgreementsWithUsage, listAssignmentsForStaff, listCredentials, listShifts, listStaff, listVisits, reviewQueue, staffPeriodTotals } from "@/db/queries";
import { ReviewQueue, type QueueRow } from "./review-queue";
import { labelForCode } from "@/lib/hcpcs";
import { requireUser } from "@/lib/auth";
import { evaluateCompliance } from "@/lib/credentials";
import { fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod } from "@/lib/pay-period";
import { VisitSheet } from "./visits/record/visit-sheet";
import { ActivityChart, type DayPoint } from "./activity-chart";
import { GetStarted } from "./get-started";
import { Info } from "lucide-react";

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
const today = () => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(new Date());

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  return (<>{openVisit && <VisitSheet id={openVisit} />}{user.role === "dsp" && user.staffId ? <CaregiverHome staffId={user.staffId} name={user.staffName} /> : <OfficeHome user={user} />}</>);
}

/* ---------- caregiver home ---------- */

async function CaregiverHome({ staffId, name }: { staffId: string; name: string | null }) {
  const period = currentPayPeriod();
  const dayStart = startOfToday();
  const [open, assignments, totals, visits, staff, credentials, todayShifts] = await Promise.all([
    getOpenVisitForStaff(staffId),
    listAssignmentsForStaff(staffId),
    staffPeriodTotals(staffId, period.start, period.end),
    listVisits({ staffId, limit: 6 }),
    getStaff(staffId),
    listCredentials(staffId),
    listShifts(dayStart, new Date(dayStart.getTime() + 7 * 86_400_000), { staffId }),
  ]);
  const attention = staff ? evaluateCompliance(staff.hireDate, credentials).filter((i) => i.status !== "ok") : [];
  const active = assignments.filter((a) => a.assignment.active);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <p className="text-[13px] text-muted-foreground">{today()}</p>
        <h1>{name ? `Hi, ${name.split(" ")[0]}` : "My day"}</h1>
      </header>

      {open ? (
        <Link href="/clock" className="mb-6 block rounded-lg border border-blue-300 bg-blue-100 px-4 py-4 hover:bg-blue-200/60">
          <div className="text-[13px] font-medium text-primary">Visit in progress</div>
          <div className="mt-0.5 text-[17px] font-semibold text-text-strong">{fullName(open.person)}</div>
          <div className="text-[13px] text-muted-foreground">Since {fmtDateTime(open.visit.clockInAt)} · tap to clock out</div>
        </Link>
      ) : (
        <section className="mb-6">
          <h3 className="mb-2 text-[15px]">Start a visit</h3>
          {active.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted-foreground">No clients assigned to you yet. Ask your supervisor.</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {active.map((a) => (
                <div key={a.assignment.id} className="flex items-center gap-3 rounded-lg border border-line bg-card px-4 py-3">
                  <Link href={`/clients/${a.person.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[12px] font-semibold text-gray-100">{a.person.firstName[0]}{a.person.lastName[0]}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-text-strong">{fullName(a.person)}</span><span className="block truncate text-[13px] text-muted-foreground">{a.assignment.orientedOn ? `${a.person.waiverProgram} · ${a.person.city ?? a.person.county} · plans and files` : "Orientation pending"}</span></span>
                  </Link>
                  <Link href="/clock" aria-label={`Clock in with ${fullName(a.person)}`} className="flex h-9 w-9 items-center justify-center rounded-md bg-primary-soft text-primary hover:bg-blue-300/40"><Icon.clock size={18} /></Link>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {todayShifts.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-baseline justify-between"><h3 className="text-[15px]">Your schedule</h3><Link href="/scheduling" className="text-[13px] font-medium text-primary hover:underline">Full week</Link></div>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-card">
            {todayShifts.slice(0, 6).map((sh) => (
              <li key={sh.shift.id}>
                <Link href={`/scheduling?week=${sh.shift.startAt.toISOString().slice(0, 10)}&shift=${sh.shift.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-hover">
                  <span className="w-28 shrink-0 text-[12.5px] tabular-nums text-muted-foreground">{new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(sh.shift.startAt)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-text-strong">{sh.personFirst} {sh.personLast}</span><span className="block truncate text-[12.5px] text-muted-foreground">{labelForCode(sh.serviceCode, sh.modifiers)}</span></span>
                  <Badge tone={sh.shift.status === "completed" ? "ok" : sh.shift.status === "missed" ? "danger" : sh.shift.status === "cancelled" ? "neutral" : "accent"}>{sh.shift.status.replace("_", " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatTile label="Hours" value={Math.round(totals.minutes / 6) / 10} note={period.label} href="/visits" />
        <StatTile label="Units" value={totals.units} note={`${totals.visits} visit${totals.visits === 1 ? "" : "s"}`} href="/visits" />
        <StatTile label="Unsigned" value={totals.unsigned} note={totals.unsigned ? "Need a signature" : "All signed"} tone={totals.unsigned ? "danger" : "ok"} href="/visits" />
      </div>

      {attention.length > 0 && (
        <Notice tone="warn" action={<LinkButton href="/me" variant="outline">My profile</LinkButton>}>
          <div className="font-medium text-text-strong">{attention.length} training item{attention.length === 1 ? "" : "s"} need attention</div>
          <div className="text-[13px] text-muted-foreground">{attention.map((i) => i.label).join(" · ")}</div>
        </Notice>
      )}

      <Card title="My recent visits" actions={<Link href="/visits" className="text-[13px] font-medium text-primary hover:underline">This pay period</Link>}>
        {visits.length === 0 ? <Empty icon="clock" title="No notes yet" /> : (
          <ul className="divide-y divide-line-soft">
            {visits.map(({ visit: v, personFirst, personLast }) => (
              <li key={v.id}>
                <Link href={`/?visit=${v.id}`} scroll={false} className="flex items-center gap-3 px-5 py-3 hover:bg-hover">
                  <div className="min-w-0 flex-1"><div className="font-medium text-text-strong">{personFirst} {personLast}</div><div className="text-[13px] text-muted-foreground">{fmtDateTime(v.clockInAt)} · {v.units} units</div></div>
                  <span className="flex gap-1"><Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>{v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ---------- office home (admin / supervisor) ---------- */

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(d);
const timeLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);

function Metric({ label, hint, value, of, note, tone, href }: { label: string; hint: string; value: ReactNode; of?: ReactNode; note?: ReactNode; tone?: "warn" | "danger" | "ok"; href: string }) {
  return (
    <Link href={href} className="block px-5 py-4 transition-colors hover:bg-hover">
      <div className="flex items-center gap-1.5 text-[13px] font-medium text-text"><span>{label}</span><Info className="size-3.5 text-hint" aria-label={hint} /></div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="figure text-[26px] leading-none text-text-strong">{value}</span>
        {of && <span className="text-[15px] text-muted-foreground">/ {of}</span>}
      </div>
      {note && <div className={cx("mt-1.5 text-[12.5px]", tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-muted-foreground")}>{note}</div>}
    </Link>
  );
}

const SHIFT_TONE: Record<string, { dot: string; label: string }> = {
  scheduled: { dot: "bg-gray-500", label: "Scheduled" },
  in_progress: { dot: "bg-ok", label: "In progress" },
  completed: { dot: "bg-ok", label: "Completed" },
  missed: { dot: "bg-danger", label: "Missed" },
  cancelled: { dot: "bg-gray-400", label: "Cancelled" },
};

async function OfficeHome({ user }: { user: { staffId: string | null; staffName: string | null; role: string } }) {
  const period = currentPayPeriod();
  const dayStart = startOfToday();
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  const [counts, visits, open, queue, periodVisits, todayShifts, weekShifts, agreements, staffRows] = await Promise.all([
    dashboardCounts(period),
    listVisits({ limit: 8 }),
    user.staffId ? getOpenVisitForStaff(user.staffId) : null,
    reviewQueue(period.start, period.end),
    listVisits({ from: period.start, to: period.end, limit: 2000 }),
    listShifts(dayStart, dayEnd),
    listShifts(dayStart, new Date(dayStart.getTime() + 7 * 86_400_000)),
    listAgreementsWithUsage(),
    listStaff(true),
  ]);
  const row = (r: (typeof queue.open)[number]): QueueRow => ({ id: r.visit.id, person: `${r.personFirst} ${r.personLast}`, staff: `${r.staffFirst} ${r.staffLast}`, when: fmtDateTime(r.visit.clockInAt), units: r.visit.units, note: r.visit.shiftNote });

  // Units per day across the pay period, for the activity panel.
  const byDay = new Map<string, DayPoint>();
  for (let t = period.start.getTime(); t <= period.end.getTime(); t += 86_400_000) { const d = new Date(t); byDay.set(dayKey(d), { date: dayKey(d), label: dayLabel(d), units: 0, visits: 0 }); }
  for (const { visit: v } of periodVisits) { if (v.status === "void") continue; const k = byDay.get(dayKey(v.clockInAt)); if (k) { k.units += v.units; k.visits += 1; } }
  const points = [...byDay.values()];
  const activeAgreements = agreements.filter((a) => a.agreement.status === "active");
  const authorized = activeAgreements.reduce((n, a) => n + a.agreement.authorizedUnits, 0);
  const used = activeAgreements.reduce((n, a) => n + a.unitsUsed, 0);
  const unsigned = queue.unsigned.length;
  const first = user.staffName?.split(" ")[0];
  const steps = [
    { key: "clients", done: counts.active + counts.intake > 0 },
    { key: "staff", done: staffRows.length > 1 },
    { key: "agreements", done: agreements.length > 0 },
    { key: "shifts", done: weekShifts.length > 0 },
  ];
  const live = todayShifts.filter((s) => s.shift.status === "in_progress" || s.shift.status === "completed").length;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-9">{first ? `Good day, ${first}` : "Dashboard"}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{today()} · Pay period {period.label}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/visits/new" variant="outline">Manual note</LinkButton>
          <LinkButton href="/reports" variant="outline"><Icon.download size={15} /> Export</LinkButton>
        </div>
      </header>

      {open && (
        <Notice action={<LinkButton href="/clock" variant="primary">Clock out</LinkButton>}>
          <span className="font-medium text-text-strong">Visit in progress</span>
          <span className="text-muted-foreground"> with {fullName(open.person)} since {fmtDateTime(open.visit.clockInAt)}</span>
        </Notice>
      )}

      <GetStarted steps={steps} />

      <section className="mb-6 overflow-hidden rounded-[var(--radius-app)] border border-line bg-card">
        <div className="grid divide-y divide-line-soft sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          <Metric label="Active clients" hint="Clients with status active. Intake clients are not counted." value={counts.active} note={`${counts.intake} in intake`} href="/clients" />
          <Metric label="Units this period" hint="15-minute units on completed notes in the current pay period." value={counts.periodUnits.toLocaleString()} of={`${authorized.toLocaleString()} authorized`} note={`${counts.periodVisits} visits${counts.open ? ` · ${counts.open} in progress` : ""}`} href="/visits" />
          <Metric label="Notes approved" hint="Completed notes a supervisor has approved this period." value={queue.approved} of={queue.total} note={queue.total - queue.approved ? `${queue.total - queue.approved} waiting for review` : "All reviewed"} tone={queue.total - queue.approved ? "warn" : "ok"} href="/visits" />
          <Metric label="Unsigned by client" hint="Completed notes without the client's signing code. These cannot be billed." value={unsigned} note={unsigned ? "Needs a signing code" : "Every note signed"} tone={unsigned ? "danger" : "ok"} href="/visits" />
        </div>
        <div className="border-t border-line-soft px-5 py-2.5 text-[12.5px] text-muted-foreground">Pay period {period.label}. Authorizations used: {used.toLocaleString()} of {authorized.toLocaleString()} units across {activeAgreements.length} active agreement{activeAgreements.length === 1 ? "" : "s"}. <Link href="/billing" className="text-primary hover:underline">Billing</Link></div>
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card title="Activity" actions={<Link href="/visits" className="text-[13px] font-medium text-primary hover:underline">All notes</Link>}>
          <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-5 py-3">
            <span className="text-[12.5px] text-muted-foreground">Period</span>
            <Link href="/billing" className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[13px] text-text-strong hover:bg-hover"><span className="tabular-nums">{period.label}</span><Badge tone="neutral">Current</Badge><Icon.chevronDown size={14} className="text-hint" /></Link>
            <span className="ml-2 text-[12.5px] text-muted-foreground">Metric</span>
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-line bg-panel px-2.5 text-[13px] text-text-strong">Units<Icon.chevronDown size={14} className="text-hint" /></span>
            <LinkButton href="/" variant="outline" className="ml-auto h-8">Refresh</LinkButton>
          </div>
          <div className="px-3 pb-2 pt-4"><ActivityChart points={points} /></div>
        </Card>

        <Card title={`${live} / ${todayShifts.length} Shifts today`} actions={<Link href="/scheduling" className="text-[13px] font-medium text-primary hover:underline">View all</Link>}>
          {todayShifts.length === 0 ? (
            <div className="m-4 rounded-md border border-line bg-panel p-4">
              <Badge tone="accent">Scheduling</Badge>
              <p className="mt-2 text-[13.5px] leading-5 text-text">No shifts on the calendar today. Build the week so caregivers see their day before it starts.</p>
              <LinkButton href="/scheduling" variant="outline" className="mt-3">Open scheduling</LinkButton>
            </div>
          ) : (
            <Table>
              <Thead><Th>Shift</Th><Th>Time</Th><Th>Status</Th></Thead>
              <tbody>
                {todayShifts.slice(0, 8).map((s) => {
                  const t = SHIFT_TONE[s.shift.status] ?? SHIFT_TONE.scheduled;
                  return (
                    <Tr key={s.shift.id}>
                      <Td><Link href={`/scheduling?shift=${s.shift.id}`} className="block hover:underline"><span className="block font-medium text-text-strong">{s.staffFirst} {s.staffLast}</span><span className="block text-[12.5px] text-muted-foreground">{s.personFirst} {s.personLast}</span></Link></Td>
                      <Td className="tabular-nums text-[12.5px] text-muted-foreground">{timeLabel(s.shift.startAt)} – {timeLabel(s.shift.endAt)}</Td>
                      <Td><span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 text-[12px] leading-5"><span className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />{t.label}</span></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <div className="mb-6"><ReviewQueue data={{ awaitingApproval: queue.awaitingApproval.map(row), unsigned: queue.unsigned.map(row), missingNote: queue.missingNote.map(row), notStaffSigned: queue.notStaffSigned.map(row), open: queue.open.map(row), approved: queue.approved, total: queue.total }} /></div>

      <Card title="Recent notes" actions={<Link href="/visits" className="text-[13px] font-medium text-primary hover:underline">All notes</Link>}>
        {visits.length === 0 ? <Empty icon="clock" title="No notes yet" /> : (
          <Table>
            <Thead><Th>Clock in</Th><Th>Client</Th><Th>Staff</Th><Th>Service</Th><Th align="right">Units</Th><Th>Status</Th></Thead>
            <tbody>
              {visits.map(({ visit: v, personFirst, personLast, staffFirst, staffLast }) => (
                <Tr key={v.id}>
                  <Td strong><Link href={`/?visit=${v.id}`} scroll={false} className="hover:underline">{fmtDateTime(v.clockInAt)}</Link></Td>
                  <Td>{personFirst} {personLast}</Td>
                  <Td>{staffFirst} {staffLast}</Td>
                  <Td className="tabular-nums">{v.serviceCode}{v.modifiers.length ? ` ${v.modifiers.join(" ")}` : ""}</Td>
                  <Td align="right">{v.units}</Td>
                  <Td><span className="flex gap-1"><Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>{v.manualEntry && <Badge tone="warn">manual</Badge>}{v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}</span></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
