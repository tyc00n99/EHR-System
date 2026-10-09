import Link from "next/link";
import { getDb } from "@/db";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { COMPLIANCE, reasonLabel } from "@/evv/labels";
import { listVisitsForStaff } from "@/evv/review";
import { Icon } from "@/components/icons";
import { Badge, Card, cx as cxh, LinkButton, Notice, StatTile } from "@/components/kit";
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

const today = () => new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(new Date());

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
          <li key={v.id} className="px-4 py-2.5">
            <Link href={v.visitId ? `/visits/${v.visitId}` : "/visits"} className="flex flex-wrap items-center gap-x-3 gap-y-1 hover:underline">
              <span className="w-24 shrink-0 text-[13px] tabular-nums text-muted-foreground">{v.serviceDate ? fmtDate(v.serviceDate) : "—"}</span>
              <span className="min-w-0 flex-1 font-medium text-text-strong">{name(v.personId)}</span>
              <Badge tone={c.tone}>{v.evvRequired ? c.label : "Not required"}</Badge>
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
  type Item = { id: string; at: Date; who: string; service: string; status: "scheduled" | "in progress" | "completed" | "missed" | "cancelled"; href: string | null };
  const items: Item[] = [
    ...weekShifts.filter((sh) => sh.shift.status !== "cancelled" || true).map((sh) => ({
      id: `s${sh.shift.id}`,
      at: sh.shift.startAt,
      who: `${sh.personFirst} ${sh.personLast}`,
      service: labelForCode(sh.serviceCode, sh.modifiers),
      status: (sh.shift.status === "completed" ? "completed" : sh.shift.status === "missed" ? "missed" : sh.shift.status === "cancelled" ? "cancelled" : sh.shift.status === "in_progress" ? "in progress" : "scheduled") as Item["status"],
      href: sh.shift.status === "scheduled" || sh.shift.status === "in_progress" ? "/clock" : null,
    })),
    ...weekVisits.filter(({ visit: v }) => v.status === "completed" && !linked.has(v.id)).map(({ visit: v, personFirst, personLast }) => ({
      id: `v${v.id}`,
      at: v.clockInAt,
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
  const pill: Record<Item["status"], string> = {
    scheduled: "bg-panel text-text",
    "in progress": "bg-primary-soft text-primary",
    completed: "bg-gray-800 text-gray-100",
    missed: "bg-danger-soft text-danger",
    cancelled: "bg-panel text-muted-foreground line-through",
  };
  const needsAction = recentVisits.filter(({ visit: v }) => v.status === "in_progress" || v.returnedAt != null || (v.status === "completed" && !v.clientSignedAt));

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="mb-5">
        <p className="text-[13px] text-muted-foreground">{today()}</p>
        <h1>{name ? `Hi, ${name.split(" ")[0]}` : "My day"}</h1>
      </header>

      {/* Messages first: the one place the office reaches a caregiver in the app. */}
      <Link href="/messages" className="mb-4 block rounded-xl border border-line bg-card px-4 py-3 hover:bg-tab-hover">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px] font-semibold text-text-strong"><Icon.chat size={18} />Messages</span>
          {unread > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-[11.5px] font-semibold text-primary-foreground">{unread}</span> : <span className="text-[13px] text-muted-foreground">Open →</span>}
        </div>
        {conversations.slice(0, 2).map((c) => (
          <div key={c.contact.userId} className="mt-1.5 flex items-baseline gap-2 text-[13.5px]">
            <span className={c.unread ? "shrink-0 font-semibold text-text-strong" : "shrink-0 font-medium text-text-strong"}>{c.contact.name}</span>
            <span className={cxh("min-w-0 truncate", c.unread ? "font-medium text-text" : "text-muted-foreground")}>{c.lastFromMe ? `You: ${c.lastBody}` : c.lastBody}</span>
          </div>
        ))}
        {conversations.length === 0 && <p className="mt-1 text-[13px] text-muted-foreground">Write to your supervisor without texting client details around.</p>}
      </Link>

      {/* The clock. GPS is read at both ends; the review panel on the clock screen says whether location is working before anything starts. */}
      {open ? (
        <Link href="/clock" className="mb-4 block rounded-xl border border-primary/30 bg-primary-soft px-4 py-4 hover:bg-primary-soft/70">
          <div className="text-[13px] font-medium text-primary">Visit in progress</div>
          <div className="mt-0.5 text-[17px] font-semibold text-text-strong">{fullName(open.person)}</div>
          <div className="text-[13px] text-muted-foreground">Since {fmtDateTime(open.visit.clockInAt)} · write the note as you go, then clock out and sign</div>
        </Link>
      ) : (
        <Link href="/clock" className="mb-4 flex items-center justify-between rounded-xl bg-primary px-4 py-4 text-primary-foreground hover:opacity-95">
          <span>
            <span className="block text-[17px] font-semibold">Clock in</span>
            <span className="block text-[13px] opacity-90">{active.length === 0 ? "No clients assigned yet — ask your supervisor" : "GPS is checked at clock-in and clock-out"}</span>
          </span>
          <Icon.clock size={26} />
        </Link>
      )}

      {/* Schedule, drawn like the reference: day chips over the day's sessions. */}
      <section className="mb-5 rounded-xl border border-line bg-card p-3">
        <div className="mb-2.5 flex items-center justify-between px-1">
          <h3 className="text-[16px] font-semibold text-text-strong">Schedule</h3>
          <div className="flex items-center gap-1 text-[13px]">
            <Link aria-label="Earlier week" href={`/?day=${addIso(selIso, -7)}`} className="grid size-7 place-items-center rounded-full border border-line hover:bg-tab-hover">‹</Link>
            <span className="px-1 font-medium text-muted-foreground">{new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "America/Chicago" }).format(fromLocalInput(selIso + "T12:00"))}</span>
            <Link aria-label="Later week" href={`/?day=${addIso(selIso, 7)}`} className="grid size-7 place-items-center rounded-full border border-line hover:bg-tab-hover">›</Link>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const n = (byDay.get(d) ?? []).length;
            const on = d === selIso;
            return (
              <Link key={d} href={`/?day=${d}`} className={cxh("flex flex-col items-center rounded-2xl border px-0.5 py-2", on ? "border-gray-800 bg-gray-800 text-gray-100" : "border-line bg-card hover:bg-tab-hover")}>
                <span className={cxh("text-[11.5px] font-medium", on ? "text-gray-100/80" : "text-muted-foreground")}>{wk(d)}</span>
                <span className="text-[17px] font-semibold tabular-nums">{d.slice(8)}</span>
                <span className={cxh("text-[10.5px]", on ? "text-primary-soft" : "text-muted-foreground")}>{n > 0 ? `${n} visit${n === 1 ? "" : "s"}` : d === todayIso ? "today" : "\u00a0"}</span>
              </Link>
            );
          })}
        </div>
        {selected.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-[13px] text-muted-foreground">Nothing on this day. Clock in above and the finished session shows up here.</p>
        ) : (
          <ul className="space-y-2">
            {selected.map((it) => {
              const body = (
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="w-[4.2rem] shrink-0 text-[13px] font-medium tabular-nums text-muted-foreground">{tm(it.at)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-semibold text-text-strong">{it.who}</span>
                    <span className="block truncate text-[13px] text-muted-foreground">{it.service}</span>
                  </span>
                  <span className={cxh("shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold", pill[it.status])}>{it.status === "missed" ? "Missed" : it.status[0].toUpperCase() + it.status.slice(1)}</span>
                </span>
              );
              return (
                <li key={it.id}>
                  {it.href ? (
                    <Link href={it.href} className="flex items-center rounded-xl border border-line bg-card px-3 py-3 hover:border-primary hover:bg-primary-soft/40">{body}</Link>
                  ) : (
                    <div className="flex items-center rounded-xl border border-line bg-card px-3 py-3 opacity-90">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* How much service this pay period. Counts only — the notes themselves live with the office. */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        <StatTile label="Sessions" value={totals.visits} note={period.label} />
        <StatTile label="Hours" value={Math.round(totals.minutes / 6) / 10} note="of service" />
        <StatTile label="Unsigned" value={totals.unsigned} note={totals.unsigned ? "Need a signature" : "All signed"} tone={totals.unsigned ? "danger" : "ok"} href="/visits" />
      </div>

      {needsAction.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-[15px]">Need something from you</h3>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-card">
            {needsAction.slice(0, 5).map(({ visit: v, personFirst, personLast }) => (
              <li key={v.id}>
                <Link href={`/?visit=${v.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text-strong">{personFirst} {personLast}</span>
                    <span className="block text-[13px] text-muted-foreground">{fmtDateTime(v.clockInAt)}</span>
                  </span>
                  {v.status === "in_progress" ? <Badge tone="accent">in progress</Badge> : v.returnedAt ? <Badge tone="warn">returned</Badge> : <Badge tone="danger">awaiting signature</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
      <p className="text-[32px] font-bold tracking-tight text-primary">Welcome, {firstName}</p>
    </div>
  );
}
