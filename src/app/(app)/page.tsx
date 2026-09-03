import Link from "next/link";
import { Icon } from "@/components/icons";
import { Badge, Card, Empty, LinkButton, Notice, StatTile, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { dashboardCounts, getOpenVisitForStaff, getStaff, listAssignmentsForStaff, listCredentials, listShifts, listVisits, staffPeriodTotals } from "@/db/queries";
import { labelForCode } from "@/lib/hcpcs";
import { requireUser } from "@/lib/auth";
import { evaluateCompliance } from "@/lib/credentials";
import { fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod } from "@/lib/pay-period";
import { VisitSheet } from "./visits/record/visit-sheet";

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
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[12px] font-semibold text-white">{a.person.firstName[0]}{a.person.lastName[0]}</span>
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
        {visits.length === 0 ? <Empty icon="clock" title="No visits yet" /> : (
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

async function OfficeHome({ user }: { user: { staffId: string | null; staffName: string | null; role: string } }) {
  const period = currentPayPeriod();
  const [counts, visits, open] = await Promise.all([dashboardCounts(period), listVisits({ limit: 8 }), user.staffId ? getOpenVisitForStaff(user.staffId) : null]);
  const first = user.staffName?.split(" ")[0];
  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-8">
        <p className="text-[13px] text-muted-foreground">{today()}</p>
        <h1>{first ? `Good day, ${first}` : "Dashboard"}</h1>
      </header>
      {open && (
        <Notice action={<LinkButton href="/clock" variant="primary">Clock out</LinkButton>}>
          <span className="font-medium text-text-strong">Visit in progress</span>
          <span className="text-muted-foreground"> with {fullName(open.person)} since {fmtDateTime(open.visit.clockInAt)}</span>
        </Notice>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatTile label="Active clients" value={counts.active} note={`${counts.intake} in intake`} href="/clients" />
        <StatTile label="Units this pay period" value={counts.periodUnits.toLocaleString()} note={`${counts.periodVisits} visits · ${period.label}${counts.open ? ` · ${counts.open} in progress` : ""}`} href="/visits" />
        <StatTile label="Manual visits pending EVV" value={counts.manualPending} note={counts.manualPending ? "Need evidence before export" : "Nothing waiting"} tone={counts.manualPending ? "warn" : undefined} href="/visits" />
      </div>
      <Card title="Recent visits" actions={<Link href="/visits" className="text-[13px] font-medium text-primary hover:underline">All visits</Link>}>
        {visits.length === 0 ? <Empty icon="clock" title="No visits yet" /> : (
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
