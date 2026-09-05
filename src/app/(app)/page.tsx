import Link from "next/link";
import { Icon } from "@/components/icons";
import type { ReactNode } from "react";
import { Badge, Card, cx, Empty, LinkButton, Notice, StatTile } from "@/components/kit";
import { dashboardCounts, getOpenVisitForStaff, getStaff, listAgreementsWithUsage, listAssignmentsForStaff, listCredentials, listShifts, listStaff, listVisits, staffPeriodTotals } from "@/db/queries";
import { labelForCode } from "@/lib/hcpcs";
import { requireUser } from "@/lib/auth";
import { evaluateCompliance } from "@/lib/credentials";
import { fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod } from "@/lib/pay-period";
import { VisitSheet } from "./visits/record/visit-sheet";
import { TodayBoard, type BoardShift } from "./today-board";
import { GetStarted } from "./get-started";
import { attentionItems } from "@/lib/attention";
import { fromLocalInput, toLocalInput } from "@/lib/format";
import { Info } from "lucide-react";

function startOfToday() { return fromLocalInput(toLocalInput(new Date()).slice(0, 10) + "T00:00"); }
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

const timeLabel = (d: Date) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" }).format(d);
/** Minutes past midnight in Chicago, so the board can place a shift without shipping timestamps. */
const minutesOfDay = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(d);
  return (Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24) * 60 + Number(p.find((x) => x.type === "minute")?.value ?? 0);
};
/** Long service names crowd the board; the code is on the shift sheet. */
const shortService = (l: string) => l.replace(/^Individualized home supports/i, "IHS").replace(/^Individual community living support \(ICLS\)$/i, "ICLS").replace(/^Independent living skills/i, "ILS").replace(/,\s*1:\d$/, "");

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


async function OfficeHome({ user }: { user: { staffId: string | null; staffName: string | null; role: string } }) {
  const period = currentPayPeriod();
  const dayStart = startOfToday();
  const dayEnd = new Date(dayStart.getTime() + 86_400_000 - 1);
  const [counts, open, todayShifts, weekShifts, agreements, staffRows, review, recentNotes] = await Promise.all([
    dashboardCounts(period),
    user.staffId ? getOpenVisitForStaff(user.staffId) : null,
    listShifts(dayStart, dayEnd),
    listShifts(dayStart, new Date(dayStart.getTime() + 7 * 86_400_000)),
    listAgreementsWithUsage(),
    listStaff(true),
    attentionItems(),
    listVisits({ limit: 5 }),
  ]);

  const unsignedToReview = review.filter((r) => r.kind === "unsigned").length;
  const activeAgreements = agreements.filter((a) => a.agreement.status === "active");
  const authorized = activeAgreements.reduce((n, a) => n + a.agreement.authorizedUnits, 0);
  const used = activeAgreements.reduce((n, a) => n + a.unitsUsed, 0);
  const first = user.staffName?.split(" ")[0];
  const steps = [
    { key: "clients", done: counts.active + counts.intake > 0 },
    { key: "staff", done: staffRows.length > 1 },
    { key: "agreements", done: agreements.length > 0 },
    { key: "shifts", done: weekShifts.length > 0 },
  ];
  const boardShifts: BoardShift[] = todayShifts.map((s) => ({
    id: s.shift.id,
    staff: `${s.staffFirst} ${s.staffLast}`,
    client: `${s.personFirst} ${s.personLast}`,
    service: shortService(labelForCode(s.serviceCode, s.modifiers)),
    startMin: minutesOfDay(s.shift.startAt),
    endMin: minutesOfDay(s.shift.endAt),
    startLabel: timeLabel(s.shift.startAt),
    endLabel: timeLabel(s.shift.endAt),
    status: s.shift.status,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">Your workspace</p>
          <h1 className="text-[28px] leading-9">{first ? `Today, ${first}` : "Today at your agency"}</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{today()} · Pay period {period.label}</p>
        </div>
        <div className="flex gap-2">
          <LinkButton href="/scheduling" variant="outline"><Icon.calendar size={15} /> Schedule</LinkButton>
          <LinkButton href="/visits/new" variant="primary"><Icon.plus size={15} /> Manual note</LinkButton>
          <LinkButton href="/reports" variant="outline"><Icon.download size={15} /> Export</LinkButton>
        </div>
      </header>

      {open && (
        <Notice action={<LinkButton href="/clock" variant="primary">Clock out</LinkButton>}>
          <span className="font-medium text-text-strong">Visit in progress</span>
          <span className="text-muted-foreground"> with {fullName(open.person)} since {fmtDateTime(open.visit.clockInAt)}</span>
        </Notice>
      )}

      <Card className="mb-5" title="Start with what needs you" description="Unresolved items across notes, people, and scheduled care." actions={<LinkButton href="/attention" variant="primary">Review queue · {review.length}<Icon.chevronRight size={14} /></LinkButton>}>
        {review.length === 0 ? <Empty icon="check" title="No unresolved items in the current review scope" /> : <div className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {[
            { label: "Documentation", kinds: ["unsigned", "returned", "manual", "code"], href: "/attention?kind=unsigned", detail: "Signatures, corrections & EVV" },
            { label: "Care delivery", kinds: ["open", "missed_shift"], href: "/attention?kind=missed_shift", detail: "Missed shifts & open visits" },
            { label: "People & authorizations", kinds: ["compliance", "orientation", "authorization"], href: "/attention?kind=compliance", detail: "Training, orientation & units" },
          ].map((group) => {
            const rows = review.filter((r) => group.kinds.includes(r.kind));
            return <Link key={group.label} href={rows.length ? `/attention?kind=${rows[0].kind}` : group.href} className="px-5 py-4 hover:bg-hover"><div className="flex items-center justify-between"><span className="text-sm font-semibold">{group.label}</span><span className={cx("figure text-2xl", rows.some((r) => r.severity === "danger") ? "text-danger" : "text-text-strong")}>{rows.length}</span></div><p className="mt-1 text-xs text-muted-foreground">{group.detail}</p><div className="mt-3 text-xs font-medium text-primary">{rows.length ? "View next action →" : "No open items"}</div></Link>;
          })}
        </div>}
      </Card>

      <section className="mb-6 overflow-hidden rounded-[var(--radius-app)] border border-line bg-card">
        <div className="grid divide-y divide-line-soft sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4 xl:divide-x">
          <Metric label="Active clients" hint="Clients with status active. Intake clients are not counted." value={counts.active} note={`${counts.intake} in intake`} href="/clients" />
          <Metric label="Units this period" hint="15-minute units on completed notes in the current pay period." value={counts.periodUnits.toLocaleString()} note={`${counts.periodVisits} visits${counts.open ? ` · ${counts.open} in progress` : ""}`} href="/visits" />
          <Metric label="Returned for correction" hint="Notes a supervisor sent back. Everything else is accepted when the caregiver submits it." value={counts.returned} note={counts.returned ? "Caregivers need to fix these" : "Nothing sent back"} tone={counts.returned ? "warn" : "ok"} href="/attention?kind=returned" />
          <Metric label="Unsigned by client" hint="Completed notes without the client's signing code. These cannot be billed." value={unsignedToReview} note={unsignedToReview ? "Signature or reason needed" : "No missing signature evidence"} tone={unsignedToReview ? "danger" : "ok"} href="/attention?kind=unsigned" />
        </div>
        <div className="border-t border-line-soft px-5 py-2.5 text-[12.5px] text-muted-foreground">Pay period {period.label}. Authorizations used: {used.toLocaleString()} of {authorized.toLocaleString()} units across {activeAgreements.length} active agreement{activeAgreements.length === 1 ? "" : "s"}. <Link href="/billing" className="text-primary hover:underline">Billing</Link></div>
      </section>

      <Card className="mb-6" title="Today on the board" description={boardShifts.length ? `${boardShifts.filter((b) => b.status === "in_progress").length} clocked in · ${boardShifts.filter((b) => b.status === "completed").length} finished · ${boardShifts.length} shifts` : "Every shift today, against the clock"} actions={<Link href="/scheduling" className="text-[13px] font-medium text-primary hover:underline">Scheduling</Link>}>
        <TodayBoard shifts={boardShifts} />
      </Card>
      <div className="mb-6 grid items-start gap-5 xl:grid-cols-2">
        <Card title="Next in review" description="Highest-priority unresolved items" actions={<Link href="/attention" className="text-xs font-medium text-primary">View all →</Link>}>
          {review.length === 0 ? <Empty icon="check" title="Queue is clear" /> : <ul className="divide-y divide-line-soft">{review.slice(0, 5).map((r, i) => <li key={i}><Link href={r.href} className="flex items-center gap-3 px-5 py-3 hover:bg-hover"><span className={cx("h-2 w-2 shrink-0 rounded-full", r.severity === "danger" ? "bg-danger" : "bg-warn")} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{r.title}</span><span className="mt-0.5 block text-xs text-muted-foreground">{r.detail}</span></span><Icon.chevronRight size={15} /></Link></li>)}</ul>}
        </Card>
        <Card title="Recent notes" description="Open a note to preview its document" actions={<Link href="/visits" className="text-xs font-medium text-primary">All notes →</Link>}>
          {recentNotes.length === 0 ? <Empty icon="doc" title="No notes yet" /> : <ul className="divide-y divide-line-soft">{recentNotes.map(({ visit: v, personFirst, personLast, staffFirst, staffLast }) => <li key={v.id}><Link href={`/?note=${v.id}`} scroll={false} className="flex items-center gap-3 px-5 py-3 hover:bg-hover"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-semibold text-primary">{personFirst[0]}{personLast[0]}</span><span className="min-w-0 flex-1"><span className="block font-medium">{personFirst} {personLast}</span><span className="block text-xs text-muted-foreground">{staffFirst} {staffLast} · {fmtDateTime(v.clockInAt)}</span></span><Badge tone={v.returnedAt ? "warn" : v.status === "completed" ? "ok" : "neutral"}>{v.returnedAt ? "Returned" : v.status.replace("_", " ")}</Badge></Link></li>)}</ul>}
        </Card>
      </div>
      {user.role === "admin" && steps.some((step) => !step.done) && <GetStarted steps={steps} />}



    </div>
  );
}
