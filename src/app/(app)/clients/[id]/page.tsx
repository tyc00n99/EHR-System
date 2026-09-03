import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Badge, Card, Crumb, CrumbSep, Empty, LinkButton, Properties, RecordHeader, Table, Tabs, Td, Th, Thead, Tr, cx } from "@/components/kit";
import { canViewPerson, getPerson, listAgreementsForPerson, listAssignmentsForPerson, listAuditForRecord, listClientDocuments, listGoalsWithStats, listMedAdmins, listMedications, listVisits, personFeed } from "@/db/queries";
import { LifePlan } from "./life-plan";
import { Feed, type FeedItem } from "./feed";
import { Medical } from "./medical";
import { can, requireUser } from "@/lib/auth";
import { deadlinesFromServiceStart } from "@/lib/compliance";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodByIndex } from "@/lib/pay-period";
import { getServiceType } from "@/lib/services";
import { DOCUMENT_CATEGORIES } from "@/lib/validation";
import { AgreementStatusButton } from "./agreement-status";
import { ClientCodePanel } from "./client-code";
import { DeleteDocument, DocumentUpload } from "./documents";
import { VisitSheet } from "../../visits/record/visit-sheet";

const statusTone = { active: "ok", intake: "accent", discharged: "neutral" } as const;
const visitTone = (s: string) => (s === "completed" ? "ok" : s === "void" ? "neutral" : "accent") as "ok" | "neutral" | "accent";
const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" });
const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" });

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }

function age(dob: string) {
  const d = new Date(dob + "T12:00:00"); const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) a -= 1;
  return a;
}

function Ring({ used, total, size = 40 }: { used: number; total: number; size?: number }) {
  const p = Math.min(100, Math.round((used / total) * 100));
  const r = (size - 5) / 2, c = 2 * Math.PI * r;
  const color = p >= 90 ? "var(--danger)" : p >= 75 ? "var(--warn)" : "var(--accent)";
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`${p}% used`}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gray-200)" strokeWidth="4" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${(p / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>;
}

function Contact({ title, name, sub, phone, email }: { title: string; name: string | null; sub?: string | null; phone?: string | null; email?: string | null }) {
  return (
    <Card title={title} padded>
      {name ? (<><div className="font-medium text-text-strong">{name}{sub && <span className="font-normal text-muted-foreground"> · {sub}</span>}</div><div className="mt-1.5 flex flex-col gap-1 text-[13px]">{phone && <a href={`tel:${phone}`} className="flex items-center gap-1.5 text-primary hover:underline"><Icon.phone size={13} />{phone}</a>}{email && <a href={`mailto:${email}`} className="flex items-center gap-1.5 text-primary hover:underline"><Icon.mail size={13} />{email}</a>}{!phone && !email && <span className="text-hint">No contact details</span>}</div></>) : <div className="text-[13px] text-muted-foreground">{title === "Guardian" ? "None on file. The person is their own legal representative." : "None on file."}</div>}
    </Card>
  );
}

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  const periodsToShow = Math.min(26, Math.max(1, Number(sp.periods) || 1));
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const manage = can(user, "manage_people");
  const current = currentPayPeriod();
  const oldest = payPeriodByIndex(current.index - (periodsToShow - 1));
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const goalFrom = daysAgo(90);
  const [my0, mm0] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(my0, mm0, 0)).getUTCDate()).padStart(2, "0")}`;
  const feedDays = Math.min(365, Math.max(7, Number(sp.days) || 30));
  const feed = tab === "feed" ? await personFeed(id, daysAgo(feedDays), new Date()) : [];
  const [agreements, visits, audit, documents, team, goals, meds, admins] = await Promise.all([
    listAgreementsForPerson(id),
    listVisits({ personId: id, from: oldest.start, to: current.end, limit: 500 }),
    user.role === "admin" ? listAuditForRecord("people", id) : Promise.resolve([]),
    listClientDocuments(id),
    listAssignmentsForPerson(id),
    listGoalsWithStats(id, goalFrom, new Date()),
    listMedications(id),
    listMedAdmins(id, `${month}-01`, monthEnd),
  ]);
  const [my, mm] = month.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(my, mm - 1, 1)));
  const shiftMonth = (d: number) => { const x = new Date(Date.UTC(my, mm - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
  const tracks = agreements.map((a) => (a.serviceTypeId ? getServiceType(a.serviceTypeId).planningTrack : null)).filter(Boolean);
  const track = tracks.includes("245D.071") ? "245D.071" : tracks.length ? "245D.07" : null;
  const deadlines = person.serviceStartDate && track ? deadlinesFromServiceStart(track, new Date(person.serviceStartDate + "T12:00:00")) : [];
  const address = [person.address1, person.address2, person.city && `${person.city}, ${person.state} ${person.zip ?? ""}`.trim()].filter(Boolean).join(", ");
  const active = agreements.filter((a) => a.agreement.status === "active");
  const unitsLeft = active.reduce((n, a) => n + (a.agreement.authorizedUnits - a.unitsUsed), 0);
  const periodVisits = visits.filter(({ visit: v }) => v.clockInAt >= current.start && v.status === "completed");
  const unsigned = visits.filter(({ visit: v }) => v.status === "completed" && !v.clientSignedAt).length;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "feed", label: "Feed" },
    { key: "lifeplan", label: "Life plan", count: goals.filter((g) => g.goal.status === "active").length },
    { key: "visits", label: "Visits", count: visits.length },
    { key: "authorizations", label: "Authorizations", count: active.length },
    { key: "files", label: "Plans & files", count: documents.length },
    { key: "medical", label: "Medical", count: meds.filter((m) => m.active).length || undefined },
    { key: "contacts", label: "Contacts" },
    ...(user.role === "admin" ? [{ key: "history", label: "History", count: audit.length }] : []),
  ];

  return (
    <div>
      {openVisit && <VisitSheet id={openVisit} />}
      <RecordHeader
        crumbs={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb>{fullName(person)}</Crumb></>}
        avatar={<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-nav text-lg font-semibold text-white">{person.firstName[0]}{person.lastName[0]}</span>}
        title={fullName(person)}
        chips={<><Badge tone={statusTone[person.status]}>{person.status}</Badge>{!person.signatureCodeHash && person.status === "active" && <Badge tone="danger">no signing code</Badge>}</>}
        subtitle={<><span className="tabular-nums">PMI {person.pmi}</span><span className="text-hint">·</span><span>{person.waiverProgram} waiver</span><span className="text-hint">·</span><span>{age(person.dob)} years</span><span className="text-hint">·</span><span>{person.county} County</span>{person.serviceStartDate && <><span className="text-hint">·</span><span>Client since {fmtDate(person.serviceStartDate)}</span></>}{team.length > 0 && <><span className="text-hint">·</span><span>Team: {team.map((t) => `${t.staff.firstName} ${t.staff.lastName}`).join(", ")}</span></>}</>}
        actions={<>{user.staffId && <LinkButton href="/clock" variant="primary"><Icon.clock size={14} />Clock in</LinkButton>}{manage && <LinkButton href={`/clients/${id}/edit`} variant="outline">Edit</LinkButton>}</>}
      />
      <Tabs tabs={tabs} current={tab} base={`/clients/${id}`} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-4">
            <Card title="Profile" padded>
              <Properties labelWidth={104} items={[
                { icon: "calendar", label: "Born", value: fmtDate(person.dob) },
                { icon: "id", label: "PMI #", value: <span className="tabular-nums">{person.pmi}</span> },
                { icon: "catalog", label: "Waiver", value: person.waiverProgram },
                { icon: "pin", label: "Address", value: address || null },
                { icon: "phone", label: "Phone", value: person.phone },
                { icon: "mail", label: "Email", value: person.email ? <a href={`mailto:${person.email}`} className="text-primary hover:underline">{person.email}</a> : null },
                { icon: "user", label: "Case manager", value: person.caseManagerName },
                { icon: "flag", label: "Service start", value: fmtDate(person.serviceStartDate) || null },
              ]} />
            </Card>
            <Card title={track ? `Planning deadlines · ${track}` : "Planning deadlines"} padded>
              {deadlines.length === 0 ? <p className="text-[13px] text-muted-foreground">{person.serviceStartDate ? "Add a service agreement with a program to compute deadlines." : "Set a service start date to compute deadlines."}</p> : (
                <ul className="space-y-2.5">{deadlines.map((d) => { const overdue = d.due < new Date(); return <li key={d.id} className="text-[13px]"><div className={cx("font-medium tabular-nums", overdue ? "text-danger" : "text-text-strong")}>{fmtDate(d.due)}{overdue && <span className="ml-1.5 font-normal">overdue</span>}</div><div className="text-text">{d.label}</div><div className="text-xs text-muted-foreground">{d.cite}</div></li>; })}</ul>
              )}
            </Card>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-[var(--shadow-sm)]"><div className="text-[12.5px] font-medium text-muted-foreground">Units remaining</div><div className="mt-1 text-[22px] font-bold tabular-nums text-text-strong">{unitsLeft.toLocaleString()}</div><div className="text-[12.5px] text-muted-foreground">across {active.length} active authorization{active.length === 1 ? "" : "s"}</div></div>
              <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-[var(--shadow-sm)]"><div className="text-[12.5px] font-medium text-muted-foreground">This pay period</div><div className="mt-1 text-[22px] font-bold tabular-nums text-text-strong">{periodVisits.reduce((n, r) => n + r.visit.units, 0)} <span className="text-[13px] font-normal text-muted-foreground">units</span></div><div className="text-[12.5px] text-muted-foreground">{periodVisits.length} completed visit{periodVisits.length === 1 ? "" : "s"}</div></div>
              <div className={cx("rounded-lg border bg-card px-4 py-3 shadow-[var(--shadow-sm)]", unsigned ? "border-danger/30" : "border-line")}><div className="text-[12.5px] font-medium text-muted-foreground">Unsigned visits</div><div className={cx("mt-1 text-[22px] font-bold tabular-nums", unsigned ? "text-danger" : "text-text-strong")}>{unsigned}</div><div className="text-[12.5px] text-muted-foreground">in the periods shown</div></div>
            </div>
            <Card title="Authorizations" actions={<Link href={`/clients/${id}?tab=authorizations`} className="text-[13px] font-medium text-primary hover:underline">Manage</Link>}>
              {active.length === 0 ? <Empty icon="doc" title="No active authorization" action={manage && <LinkButton href={`/clients/${id}/agreements/new`} variant="primary">Add an agreement</LinkButton>}>Visits cannot be recorded until one exists.</Empty> : (
                <ul className="divide-y divide-line-soft">{active.map(({ agreement: a, unitsUsed }) => <li key={a.id} className="flex items-center gap-3 px-5 py-3"><Ring used={unitsUsed} total={a.authorizedUnits} size={36} /><div className="min-w-0 flex-1"><div className="truncate font-medium text-text-strong">{labelForCode(a.serviceCode, a.modifiers)}</div><div className="text-[12.5px] text-muted-foreground tabular-nums">{a.serviceCode} {a.modifiers.join(" ")} · {(a.authorizedUnits - unitsUsed).toLocaleString()} of {a.authorizedUnits.toLocaleString()} units left · through {fmtDate(a.endDate)}</div></div><span className="text-[13px] tabular-nums text-muted-foreground">{fmtMoney(a.unitRate)}/unit</span></li>)}</ul>
              )}
            </Card>
            <Card title="Recent visits" actions={<Link href={`/clients/${id}?tab=visits`} className="text-[13px] font-medium text-primary hover:underline">All visits</Link>}>
              {visits.length === 0 ? <Empty icon="clock" title="No visits in the current pay period" /> : (
                <Table>
                  <Thead><Th>When</Th><Th>Caregiver</Th><Th>Service</Th><Th align="right">Units</Th><Th>Status</Th></Thead>
                  <tbody>{visits.slice(0, 6).map(({ visit: v, staffFirst, staffLast }) => <Tr key={v.id}><Td strong><Link href={`/clients/${id}?visit=${v.id}`} scroll={false} className="hover:underline">{fmtDateTime(v.clockInAt)}</Link></Td><Td>{staffFirst} {staffLast}</Td><Td className="tabular-nums">{v.serviceCode}</Td><Td align="right">{v.units}</Td><Td><span className="flex gap-1"><Badge tone={visitTone(v.status)}>{v.status.replace("_", " ")}</Badge>{v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}</span></Td></Tr>)}</tbody>
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === "authorizations" && (
        <Card title="Service agreements" description="Every authorization on file, current and past" actions={manage && <LinkButton href={`/clients/${id}/agreements/new`} variant="primary">New agreement</LinkButton>}>
          {agreements.length === 0 ? <Empty icon="doc" title="No service agreements yet" /> : (
            <Table>
              <Thead><Th>Agreement</Th><Th>Service</Th><Th>Units</Th><Th align="right">Rate</Th><Th>Dates</Th><Th>County</Th><Th>Status</Th><Th /></Thead>
              <tbody>{agreements.map(({ agreement: a, unitsUsed }) => <Tr key={a.id} muted={a.status !== "active"}><Td strong>{a.agreementNumber}{a.documentPath && <a href={`/agreements/${a.id}/document`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-normal text-primary hover:underline">PDF</a>}</Td><Td>{labelForCode(a.serviceCode, a.modifiers)}<div className="text-xs text-muted-foreground tabular-nums">{a.serviceCode} {a.modifiers.join(" ")}</div></Td><Td><span className="flex items-center gap-2"><Ring used={unitsUsed} total={a.authorizedUnits} size={26} /><span className="tabular-nums">{unitsUsed.toLocaleString()} / {a.authorizedUnits.toLocaleString()}</span></span></Td><Td align="right">{fmtMoney(a.unitRate)}</Td><Td className="text-muted-foreground">{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</Td><Td>{a.authorizingCounty}</Td><Td><Badge tone={a.status === "active" ? "ok" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge></Td><Td align="right">{manage && <AgreementStatusButton id={a.id} personId={id} status={a.status} />}</Td></Tr>)}</tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "visits" && (() => {
        const periods = Array.from({ length: periodsToShow }, (_, i) => payPeriodByIndex(current.index - i));
        return (
          <div className="mx-auto max-w-4xl">
            {periods.map((p, i) => {
              const inPeriod = visits.filter(({ visit: v }) => v.clockInAt >= p.start && v.clockInAt <= p.end);
              const days = new Map<string, typeof inPeriod>();
              for (const row of inPeriod) { const k = dayLabel.format(row.visit.clockInAt); days.set(k, [...(days.get(k) ?? []), row]); }
              const completed = inPeriod.filter((r) => r.visit.status === "completed");
              const units = completed.reduce((n, r) => n + r.visit.units, 0);
              const minutes = completed.reduce((n, r) => n + (r.visit.clockOutAt ? Math.round((r.visit.clockOutAt.getTime() - r.visit.clockInAt.getTime()) / 60000) : 0), 0);
              return (
                <div key={p.index} className={cx(i > 0 && "mt-6")}>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-line bg-sidebar px-3 py-2"><div className="font-medium text-text-strong">{i === 0 ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {p.label}</span></div><div className="text-[13px] tabular-nums text-muted-foreground">{inPeriod.length} visit{inPeriod.length === 1 ? "" : "s"} · {units} units · {Math.round(minutes / 6) / 10} h</div></div>
                  {days.size === 0 ? <p className="px-3 pb-2 text-[13px] text-muted-foreground">No visits in this pay period.</p> : [...days.entries()].map(([day, items]) => (
                    <div key={day} className="relative mb-4 pl-6">
                      <div className="absolute bottom-0 left-[7px] top-2 w-px bg-line" />
                      <div className="relative mb-2 text-[13px] font-medium text-text-strong"><span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-gray-100 bg-gray-400" />{day}</div>
                      {items.map(({ visit: v, staffFirst, staffLast, editCount }) => (
                        <Link key={v.id} href={`/clients/${id}?tab=visits&periods=${periodsToShow}&visit=${v.id}`} scroll={false} className="mb-2 block rounded-lg border border-line bg-card p-4 shadow-[var(--shadow-sm)] transition-colors hover:bg-hover">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]"><span className="font-medium text-text-strong tabular-nums">{time.format(v.clockInAt)}{v.clockOutAt ? ` – ${time.format(v.clockOutAt)}` : ""}</span><span className="text-muted-foreground">· {staffFirst} {staffLast} · {v.serviceCode} · {v.units} unit{v.units === 1 ? "" : "s"}</span><span className="ml-auto flex gap-1"><Badge tone={visitTone(v.status)}>{v.status.replace("_", " ")}</Badge>{v.manualEntry && <Badge tone="warn">manual</Badge>}{editCount > 0 && <Badge tone="warn">edited</Badge>}{v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}</span></div>
                          <p className="mt-2 leading-6">{v.shiftNote ?? <span className="text-hint">No shift note yet.</span>}</p>
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="mt-2 flex items-center gap-3"><Link href={`/clients/${id}?tab=visits&periods=${periodsToShow + 1}`} className="inline-flex h-8 items-center rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Show previous pay period</Link>{periodsToShow > 1 && <Link href={`/clients/${id}?tab=visits`} className="text-[13px] text-muted-foreground hover:text-text">Back to current</Link>}</div>
          </div>
        );
      })()}

      {tab === "files" && (
        <Card title="Plans and files" description="Support plan, IAPP, treatment goals, and anything else staff should read before a shift">
          {documents.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">No files yet. {manage ? "Upload the support plan, the IAPP, and treatment goals below." : "Your supervisor has not uploaded plans for this person yet."}</p> : (
            DOCUMENT_CATEGORIES.map(([cat, label]) => { const docs = documents.filter((d) => d.doc.category === cat); if (!docs.length) return null; return (
              <div key={cat} className="border-b border-line-soft last:border-b-0">
                <div className="bg-sidebar px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</div>
                <ul className="divide-y divide-line-soft">{docs.map(({ doc, uploaderEmail }) => <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><a href={`/clients/${id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 hover:underline"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-panel text-gray-600"><Icon.doc size={18} /></span><span className="min-w-0"><span className="block truncate font-medium text-text-strong">{doc.title}</span><span className="block truncate text-[13px] text-muted-foreground">{doc.effectiveOn ? `Effective ${fmtDate(doc.effectiveOn)} · ` : ""}{doc.fileName} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB{manage ? ` · ${uploaderEmail}` : ""}</span>{doc.note && <span className="mt-0.5 block text-[13px] text-text">{doc.note}</span>}</span></a><a href={`/clients/${id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-md bg-primary-soft px-2.5 text-xs font-medium text-primary hover:bg-blue-300/40">Open</a>{manage && <DeleteDocument id={doc.id} personId={id} />}</li>)}</ul>
              </div>
            ); })
          )}
          {manage && <div className="border-t border-line-soft bg-sidebar px-5 py-4"><div className="mb-3 text-[13px] font-medium text-text-strong">Upload a plan or file</div><DocumentUpload personId={id} /></div>}
        </Card>
      )}

      {tab === "feed" && (
        <Feed personId={id} days={feedDays} olderHref={`/clients/${id}?tab=feed&days=${feedDays + 30}`} items={feed.map((e): FeedItem => {
          const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" }).format(e.at);
          const time = new Intl.DateTimeFormat("en-US", { timeStyle: "short", timeZone: "America/Chicago" }).format(e.at);
          const common = { at: e.at.toISOString(), day, time };
          switch (e.kind) {
            case "visit": return { ...common, kind: "visit", id: e.id, staff: e.staff, service: e.service, units: e.units, minutes: e.minutes, status: e.status, note: e.note, interaction: e.interaction, skills: e.skills, signed: e.signed, staffSigned: e.staffSigned, approved: e.approved, manual: e.manual, goalYes: e.goalYes, goalNo: e.goalNo };
            case "med": return { ...common, kind: "med", id: e.id, name: e.name, dose: e.dose, status: e.status, note: e.note, by: e.by };
            case "shift": return { ...common, kind: "shift", id: e.id, staff: e.staff, service: e.service, status: e.status };
            case "document": return { ...common, kind: "document", id: e.id, title: e.title, category: e.category, by: e.by };
            case "agreement": return { ...common, kind: "agreement", id: e.id, number: e.number, service: e.service, units: e.units, status: e.status };
            case "goal": return { ...common, kind: "goal", id: e.id, title: e.title, status: e.status };
          }
        })} />
      )}

      {tab === "lifeplan" && (
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="text-[18px]">{person.firstName}&apos;s life plan goals</h2><span className="text-[13px] text-muted-foreground">Responses from the last 90 days</span></div>
          <LifePlan personId={id} manage={manage} rangeLabel="in the last 90 days" goals={goals.map((g) => ({ id: g.goal.id, title: g.goal.title, description: g.goal.description, category: g.goal.category, status: g.goal.status, targetDate: g.goal.targetDate, questions: g.questions.map((q) => ({ id: q.question.id, prompt: q.question.prompt, yes: q.yes, no: q.no, na: q.na })) }))} />
        </div>
      )}

      {tab === "medical" && (
        <Medical personId={id} month={month} monthLabel={monthLabel} prevHref={`/clients/${id}?tab=medical&month=${shiftMonth(-1)}`} nextHref={`/clients/${id}?tab=medical&month=${shiftMonth(1)}`} manage={manage} canRecord={Boolean(user.staffId) || manage} today={new Date().toISOString().slice(0, 10)}
          meds={meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, route: m.route, frequency: m.frequency, times: m.times, instructions: m.instructions, prescriber: m.prescriber, startDate: m.startDate, endDate: m.endDate, active: m.active }))}
          admins={admins.map((a) => ({ medicationId: a.medicationId, date: a.scheduledDate, time: a.scheduledTime, status: a.status, note: a.note }))} />
      )}

      {tab === "contacts" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Contact title="Emergency contact" name={person.emergencyContactName} sub={person.emergencyContactRelationship} phone={person.emergencyContactPhone} email={person.emergencyContactEmail} />
          <Contact title="Guardian" name={person.guardianName} sub={person.guardianRelationship} phone={person.guardianPhone} email={person.guardianEmail} />
          <Contact title="County case manager" name={person.caseManagerName} phone={person.caseManagerPhone} email={person.caseManagerEmail} />
          <Contact title="Consultation Services provider" name={person.consultProviderName} sub={person.consultContactName} phone={person.consultPhone} email={person.consultEmail} />
          <Card title="Care team" padded>{team.length === 0 ? <p className="text-[13px] text-muted-foreground">No caregivers assigned. Assign from the staff record.</p> : <ul className="space-y-2">{team.map((t) => <li key={t.assignment.id} className="flex items-center justify-between text-[13px]"><Link href={`/staff/${t.staff.id}`} className="font-medium text-text-strong hover:underline">{t.staff.firstName} {t.staff.lastName}</Link>{t.assignment.orientedOn ? <Badge tone="ok">oriented</Badge> : <Badge tone="warn">orientation pending</Badge>}</li>)}</ul>}</Card>
          {manage && <Card title="Signing code" padded><ClientCodePanel personId={id} hasCode={Boolean(person.signatureCodeHash)} setAt={person.signatureCodeSetAt ? fmtDate(person.signatureCodeSetAt) : null} /></Card>}
        </div>
      )}

      {tab === "history" && user.role === "admin" && (
        <Card title="Record history" description="Every change to this record">
          {audit.length === 0 ? <Empty icon="history" title="No history" /> : <ul className="divide-y divide-line-soft">{audit.map(({ entry, actorEmail }) => <li key={entry.id} className="flex items-center justify-between px-5 py-2.5 text-[13px] text-muted-foreground"><span><span className="font-medium text-text">{entry.action}</span> by {actorEmail ?? "system"}</span><span className="tabular-nums">{fmtDateTime(entry.at)}</span></li>)}</ul>}
        </Card>
      )}
      {(null as ReactNode)}
    </div>
  );
}
