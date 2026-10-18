import Link from "next/link";
import { getDb } from "@/db";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { COMPLIANCE, reasonLabel } from "@/evv/labels";
import { listVisitsForStaff } from "@/evv/review";
import { Icon } from "@/components/icons";
import { Avatar, Badge, Card, cx as cxh, Eyebrow, GroupLabel, LinkButton, ListGroup, ListRow, Notice, StatTile } from "@/components/kit";
import { getOpenVisitForStaff, getStaff, listAssignmentsForStaff, listCredentials, listPeople, listShifts, listVisits, staffPeriodTotals } from "@/db/queries";
import { listConversations } from "@/db/message-queries";
import { labelForCode } from "@/lib/hcpcs";
import { requireUser } from "@/lib/auth";
import { evaluateCompliance } from "@/lib/credentials";
import { fmtDate, fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod } from "@/lib/pay-period";
import { getPayRules } from "@/db/pay-queries";
import { VisitSheet } from "./visits/record/visit-sheet";
import { fromLocalInput, toLocalInput } from "@/lib/format";


export default async function Dashboard({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const sp = await searchParams;
  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  return (<>{openVisit && <VisitSheet id={openVisit} />}{!user.abilities.includes("all_clients") && user.staffId ? <CaregiverHome staffId={user.staffId} userId={user.id} name={user.staffName} day={typeof sp.day === "string" ? sp.day : null} /> : <OfficeHome user={user} />}</>);
}

/* ---------- caregiver home ---------- */

async function EvvMine({ staffId }: { staffId: string }) {
  const db = await getDb();
  const ctx = makeCtx(db, await defaultOrganizationId(db), null);
  const rows = await listVisitsForStaff(ctx, staffId, 6);
  if (!rows.length) return null;
  const people = await listPeople();
  const name = (id: string) => { const p = people.find((x) => x.id === id); return p ? fullName(p) : "Client"; };
  return (
    <Card title="Visit verification" description="How your recent visits stand for EVV. Clock in and out with location on, at the person's home or with Community chosen, and they stay compliant." className="mb-6">
      <ul className="divide-y divide-line-soft">
        {rows.map((v) => { const c = COMPLIANCE[v.complianceStatus]; const reasons = v.complianceReasons.filter((r) => r !== "EVV_NOT_REQUIRED"); return (
          <li key={v.id} className="px-5 py-3">
            <Link href={v.visitId ? `/visits/${v.visitId}` : "/visits"} className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:underline">
              <span className="w-24 shrink-0 text-[13px] tabular-nums text-muted-foreground">{v.serviceDate ? fmtDate(v.serviceDate) : "—"}</span>
              <span className="min-w-0 flex-1 font-medium text-text-strong">{name(v.personId)}</span>
              <Badge tone={c.tone} dot>{v.evvRequired ? c.label : "Not required"}</Badge>
            </Link>
            {reasons.length > 0 && <div className="mt-0.5 text-[13px] text-muted-foreground">{reasons.slice(0, 2).map(reasonLabel).join(" · ")}</div>}
          </li>
        ); })}
      </ul>
    </Card>
  );
}

/**
 * The caregiver phone home (Oct 8, 2026, rebuilt to the user's spec): messages first, then the
 * clock, then the schedule drawn like the reference screenshot — a strip of day chips over the
 * day's sessions. Completed sessions appear on the schedule too, but never open: a caregiver's
 * finished notes are not browsable from anywhere on their side.
 */
async function CaregiverHome({ staffId, userId, name, day }: { staffId: string; userId: string; name: string | null; day: string | null }) {
  const period = currentPayPeriod(await getPayRules());
  const todayIso = toLocalInput(new Date()).slice(0, 10);
  const addIso = (iso: string, n: number) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)).toISOString().slice(0, 10);
  const selIso = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : todayIso;
  const weekStartIso = addIso(selIso, -new Date(selIso + "T12:00:00Z").getUTCDay());
  const weekStart = fromLocalInput(weekStartIso + "T00:00");
  const weekEnd = fromLocalInput(addIso(weekStartIso, 7) + "T00:00");

  const [open, assignments, totals, weekShifts, weekVisits, recentVisits, conversations, staffRow, credentials] = await Promise.all([
    getOpenVisitForStaff(staffId),
    listAssignmentsForStaff(staffId),
    staffPeriodTotals(staffId, period.start, period.end),
    listShifts(weekStart, weekEnd, { staffId }),
    listVisits({ staffId, from: weekStart, to: weekEnd }),
    listVisits({ staffId, limit: 60 }),
    listConversations({ userId, role: "dsp" }),
    getStaff(staffId),
    listCredentials(staffId),
  ]);
  const attention = staffRow ? evaluateCompliance(staffRow.hireDate, credentials).filter((i) => i.status !== "ok") : [];
  const active = assignments.filter((a) => a.assignment.active);
  const unread = conversations.reduce((n, c) => n + c.unread, 0);

  // One schedule, two sources: booked shifts, plus completed sessions nobody scheduled.
  const linked = new Set(weekShifts.map((sh) => sh.visitId).filter(Boolean));
  type Item = { id: string; at: Date; end?: Date; personId?: string; who: string; service: string; status: "scheduled" | "in progress" | "completed" | "missed" | "cancelled"; href: string | null };
  const items: Item[] = [
    ...weekShifts.filter((sh) => sh.shift.status !== "cancelled" || true).map((sh) => ({
      id: `s${sh.shift.id}`,
      at: sh.shift.startAt,
      end: sh.shift.endAt,
      personId: sh.shift.personId,
      who: `${sh.personFirst} ${sh.personLast}`,
      service: labelForCode(sh.serviceCode, sh.modifiers),
      status: (sh.shift.status === "completed" ? "completed" : sh.shift.status === "missed" ? "missed" : sh.shift.status === "cancelled" ? "cancelled" : sh.shift.status === "in_progress" ? "in progress" : "scheduled") as Item["status"],
      href: sh.shift.status === "scheduled" || sh.shift.status === "in_progress" ? "/clock" : null,
    })),
    ...weekVisits.filter(({ visit: v }) => v.status === "completed" && !linked.has(v.id)).map(({ visit: v, personFirst, personLast }) => ({
      id: `v${v.id}`,
      at: v.clockInAt,
      end: v.clockOutAt ?? undefined,
      personId: v.personId,
      who: `${personFirst} ${personLast}`,
      service: labelForCode(v.serviceCode, v.modifiers ?? []),
      status: "completed" as const,
      href: null,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  const dayIso = (d: Date) => toLocalInput(d).slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => addIso(weekStartIso, i));
  const byDay = new Map(days.map((d) => [d, items.filter((it) => dayIso(it.at) === d)]));
  const selected = byDay.get(selIso) ?? [];
  const wk = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/Chicago" }).format(fromLocalInput(iso + "T12:00"));
  const tm = (d: Date) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(d);
  const needsAction = recentVisits.filter(({ visit: v }) => v.status === "in_progress" || v.returnedAt != null || (v.status === "completed" && !v.clientSignedAt));

  // The reference's three blocks for the chosen day: the next visit as a hero card, the rest of the
  // day as one grouped list, and what is already done underneath.
  const now = new Date();
  const isToday = selIso === todayIso;
  const upcoming = selected.filter((it) => it.status === "scheduled" || it.status === "in progress");
  const next = isToday && !open ? upcoming.find((it) => it.status === "scheduled" && (it.end ?? it.at) > now) : undefined;
  const later = upcoming.filter((it) => it !== next);
  const done = selected.filter((it) => it.status === "completed" || it.status === "missed" || it.status === "cancelled");
  const todayCount = (byDay.get(todayIso) ?? []).length;
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Chicago" }).format(now));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const shortDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/Chicago" }).format(now);
  const statusPill = (st: Item["status"]) =>
    st === "in progress" ? <Badge tone="accent" dot>In progress</Badge>
    : st === "missed" ? <Badge tone="danger" dot>Missed</Badge>
    : st === "cancelled" ? <Badge>Cancelled</Badge>
    : null;

  return (
    <div className="mx-auto w-full max-w-xl">
      <header className="mb-5">
        <p className="text-[14px] text-muted-foreground">{shortDay} · {todayCount === 0 ? "no visits today" : `${todayCount} visit${todayCount === 1 ? "" : "s"} today`}</p>
        <h1 className="mt-1">{name ? `${greeting}, ${name.split(" ")[0]}` : greeting}</h1>
      </header>

      {/* The hero card: the visit under way, the next one, or the clock. GPS is read at both ends. */}
      {open ? (
        <section className="mb-6 rounded-[var(--radius-app)] border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-3">
            <Eyebrow>Visit in progress · since {tm(open.visit.clockInAt)}</Eyebrow>
            <Badge tone="accent" dot>Live</Badge>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={fullName(open.person)} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold text-text-strong">{fullName(open.person)}</div>
              <div className="truncate text-[13px] text-muted-foreground">{labelForCode(open.agreement.serviceCode, open.agreement.modifiers ?? [])}</div>
            </div>
          </div>
          <p className="mt-3 text-[14px] text-muted-foreground">Write the note as you go, then clock out and have {open.person.firstName} sign.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <LinkButton href={`/?visit=${open.visit.id}`} scroll={false} variant="secondary" className="h-11">Write the note</LinkButton>
            <LinkButton href="/clock" variant="primary" className="h-11">Clock out</LinkButton>
          </div>
        </section>
      ) : next ? (
        <section className="mb-6 rounded-[var(--radius-app)] border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
          <Eyebrow>Next visit · {tm(next.at)}</Eyebrow>
          <div className="mt-3 flex items-center gap-3">
            <Avatar name={next.who} size={40} />
            <div className="min-w-0">
              <div className="truncate text-[16px] font-semibold text-text-strong">{next.who}</div>
              <div className="truncate text-[13px] text-muted-foreground">{next.service}{next.end ? ` · until ${tm(next.end)}` : ""}</div>
            </div>
          </div>
          <p className="mt-3 text-[14px] text-muted-foreground">GPS is checked when you clock in and again when you clock out.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {next.personId ? <LinkButton href={`/clients/${next.personId}`} variant="secondary" className="h-11">Client record</LinkButton> : <span />}
            <LinkButton href="/clock" variant="primary" className="h-11">Start visit</LinkButton>
          </div>
        </section>
      ) : (
        <section className="mb-6 rounded-[var(--radius-app)] border border-line bg-card p-4 shadow-[var(--shadow-sm)]">
          <Eyebrow>Clock</Eyebrow>
          <p className="mt-2 text-[15px] text-text-strong">{active.length === 0 ? "No clients are assigned to you yet. Ask your supervisor." : "Nothing booked right now. You can still clock in for a visit."}</p>
          {active.length > 0 && <LinkButton href="/clock" variant="primary" className="mt-4 h-11 w-full">Clock in</LinkButton>}
        </section>
      )}

      {/* The week: day chips over the chosen day's visits. */}
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="text-[15px] font-semibold text-text-strong">{new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/Chicago" }).format(fromLocalInput(selIso + "T12:00"))}</span>
        <div className="flex items-center gap-1">
          <Link aria-label="Earlier week" href={`/?day=${addIso(selIso, -7)}`} className="grid size-8 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Icon.chevronLeft size={18} /></Link>
          {!isToday && <Link href="/" className="rounded-full px-3 py-1 text-[13px] font-medium text-text-strong hover:bg-tab-hover">Today</Link>}
          <Link aria-label="Later week" href={`/?day=${addIso(selIso, 7)}`} className="grid size-8 place-items-center rounded-full text-text-strong hover:bg-tab-hover"><Icon.chevronRight size={18} /></Link>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const n = (byDay.get(d) ?? []).length;
          const on = d === selIso;
          return (
            <Link key={d} href={`/?day=${d}`} aria-current={on ? "date" : undefined} className={cxh("flex flex-col items-center gap-0.5 rounded-2xl border py-2 transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-line bg-card text-text-strong hover:bg-hover")}>
              <span className={cxh("text-[13px]", on ? "opacity-80" : "text-muted-foreground")}>{wk(d)}</span>
              <span className="text-[17px] font-semibold tabular-nums leading-6">{d.slice(8)}</span>
              <span className={cxh("size-1.5 rounded-full", n > 0 ? (on ? "bg-primary-foreground" : "bg-text-strong") : "bg-transparent")} aria-label={n > 0 ? `${n} visit${n === 1 ? "" : "s"}` : undefined} />
            </Link>
          );
        })}
      </div>

      {later.length > 0 && (
        <>
          <GroupLabel after={`${later.length} visit${later.length === 1 ? "" : "s"}`}>{isToday ? "Later today" : wk(selIso) + " " + selIso.slice(8)}</GroupLabel>
          <ListGroup className="mb-5">
            {later.map((it) => (
              <ListRow key={it.id} href={it.href ?? undefined}
                lead={<span className="w-[4.5rem] shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">{tm(it.at)}</span>}
                title={it.who} subtitle={`${it.service}${it.end ? ` · until ${tm(it.end)}` : ""}`}
                trail={statusPill(it.status)} />
            ))}
          </ListGroup>
        </>
      )}
      {done.length > 0 && (
        <>
          <GroupLabel>Done</GroupLabel>
          <ListGroup className="mb-5">
            {done.map((it) => (
              <ListRow key={it.id} chevron={false}
                lead={it.status === "completed"
                  ? <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Icon.check size={14} /></span>
                  : <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted-foreground"><Icon.close size={12} /></span>}
                title={<span className={it.status === "cancelled" ? "line-through" : undefined}>{it.who}</span>}
                subtitle={`${tm(it.at)}${it.end ? ` to ${tm(it.end)}` : ""} · ${it.service}`}
                trail={statusPill(it.status)} />
            ))}
          </ListGroup>
        </>
      )}
      {selected.length === 0 && (
        <p className="mb-5 rounded-[var(--radius-app)] border border-dashed border-line px-4 py-6 text-center text-[14px] text-muted-foreground">Nothing on this day. Clock in and the finished session shows up here.</p>
      )}

      {needsAction.length > 0 && (
        <>
          <GroupLabel>Needs something from you</GroupLabel>
          <ListGroup className="mb-5">
            {needsAction.slice(0, 5).map(({ visit: v, personFirst, personLast }) => (
              <ListRow key={v.id} href={`/?visit=${v.id}`} scroll={false}
                title={`${personFirst} ${personLast}`} subtitle={fmtDateTime(v.clockInAt)}
                trail={v.status === "in_progress" ? <Badge tone="accent" dot>In progress</Badge> : v.returnedAt ? <Badge tone="warn" dot>Returned</Badge> : <Badge tone="danger" dot>Awaiting signature</Badge>} />
            ))}
          </ListGroup>
        </>
      )}

      {/* The one place the office reaches a caregiver in the app. */}
      <GroupLabel after={<Link href="/messages" className="font-medium text-text-strong hover:underline">Open</Link>}>Messages{unread > 0 ? ` · ${unread} unread` : ""}</GroupLabel>
      <ListGroup className="mb-5">
        {conversations.slice(0, 2).map((c) => (
          <ListRow key={c.contact.userId} href="/messages" lead={<Avatar name={c.contact.name} size={36} />}
            title={<span className={c.unread ? "font-semibold" : undefined}>{c.contact.name}</span>}
            subtitle={c.lastFromMe ? `You: ${c.lastBody}` : c.lastBody}
            trail={c.unread ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[13px] font-semibold text-primary-foreground">{c.unread}</span> : undefined} />
        ))}
        {conversations.length === 0 && <ListRow href="/messages" title="Write to your supervisor" subtitle="Without texting client details around" lead={<span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary-soft text-text-strong"><Icon.chat size={18} /></span>} />}
      </ListGroup>

      {/* How much service this pay period. Counts only — the notes themselves live with the office. */}
      <GroupLabel>{period.label}</GroupLabel>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <StatTile label="Sessions" value={totals.visits} />
        <StatTile label="Hours" value={Math.round(totals.minutes / 6) / 10} />
        <StatTile label="Unsigned" value={totals.unsigned} note={totals.unsigned ? "Need a signature" : "All signed"} tone={totals.unsigned ? "danger" : "ok"} href="/visits" />
      </div>

      {attention.length > 0 && (
        <Notice tone="warn" action={<LinkButton href="/me" variant="outline">My profile</LinkButton>}>
          <div className="font-medium text-text-strong">{attention.length} training item{attention.length === 1 ? "" : "s"} need attention</div>
          <div className="text-[13px] text-muted-foreground">{attention.map((i) => i.label).join(" · ")}</div>
        </Notice>
      )}

      <EvvMine staffId={staffId} />
    </div>
  );
}

/* ---------- office home ---------- */

/**
 * The office dashboard is a greeting, as the Clients and Team screens are (Sept 13, 2026, at the
 * user's request). The counters, the board and the recent notes it used to carry all live where
 * they are acted on: the Review queue, the Schedule, and Notes.
 */
function OfficeHome({ user }: { user: { staffName: string | null; email: string } }) {
  const firstName = user.staffName?.split(" ")[0] ?? user.email.split("@")[0];
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[14px] text-muted-foreground">{new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(new Date())}</p>
      <p className="mt-1 text-[34px] font-semibold leading-[40px] tracking-[-0.025em] text-text-strong">Welcome, {firstName}</p>
    </div>
  );
}
