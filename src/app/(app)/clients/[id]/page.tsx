import Link from "next/link";
import type { ReactNode } from "react";
import { Rule } from "@/components/rule";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { Badge, Card, Empty, LinkButton, Table, Tabs, Td, Th, Thead, Tr, cx, Notice } from "@/components/kit";
import { BannerFact, ChartAlert, ChartCol, ChartFacts, ChartGrid, ChartLine, ChartSection, PatientBanner, ServiceDot, UnitBar } from "@/components/chart";
import { ClientProfile, type Entity, type Field, type Section } from "./client-profile";
import { ClientPhoto } from "./client-photo";
import { getClientProfile, listProfileHistory } from "@/db/profile-queries";
import { minutesBetween } from "@/lib/units";
import { ActivityLibrary } from "./activity-library";
import { DEFAULT_ACTIVITIES } from "@/lib/templates";
import { getOrganization } from "@/db/queries";
import { canViewPerson, getPerson, goalCountsForVisits, listAgreementsForPerson, listAssignmentsForPerson, listClientDocuments, listGoalsWithStats, listMedAdmins, listMedications, countNotes, listVisits } from "@/db/queries";
import { LifePlan } from "./life-plan";
import { NotesTab, type NoteRow } from "./notes-tab";
import { PreviewButton } from "./doc-preview";
import { StatusControl } from "./status-control";
import { MedicationSupportToggle } from "./med-toggle";
import { fromLocalInput } from "@/lib/format";
import { Medical } from "./medical";
import { can, requireUser } from "@/lib/auth";
import { deadlinesFromServiceStart } from "@/lib/compliance";
import { fmtDate, fmtDateNum, fmtDateTime, fmtDayTime, fmtMoney, fullName, isoDay } from "@/lib/format";
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

function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return d; }


function Ring({ used, total, size = 40 }: { used: number; total: number; size?: number }) {
  const p = total > 0 ? Math.min(100, Math.max(0, Math.round((used / total) * 100))) : 0;
  const r = (size - 5) / 2, c = 2 * Math.PI * r;
  const color = p >= 90 ? "var(--danger)" : p >= 75 ? "var(--warn)" : "var(--primary)";
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`${p}% used`}><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gray-200)" strokeWidth="4" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${(p / 100) * c} ${c}`} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} /></svg>;
}


export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  const newCode = typeof sp.code === "string" ? sp.code : null;
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
  const noteCode = typeof sp.code === "string" ? sp.code : "";
  const noteFrom = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : "";
  const noteTo = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : "";
  const noteRows = tab === "notes" ? await listVisits({ personId: id, from: noteFrom ? fromLocalInput(`${noteFrom}T00:00`) : daysAgo(90), to: noteTo ? new Date(fromLocalInput(`${noteTo}T00:00`).getTime() + 86_399_000) : undefined, limit: 2000 }) : [];
  const noteResponses = tab === "notes" && noteRows.length ? await goalCountsForVisits(noteRows.map((r) => r.visit.id)) : new Map<string, { yes: number; no: number }>();
  const [agreements, visits, documents, team, goals, meds, admins] = await Promise.all([
    listAgreementsForPerson(id),
    // Wide enough that "recent notes" is never empty because the pay period just turned over.
    listVisits({ personId: id, from: oldest.start < daysAgo(90) ? oldest.start : daysAgo(90), to: current.end, limit: 500 }),
    listClientDocuments(id),
    listAssignmentsForPerson(id),
    listGoalsWithStats(id, goalFrom, new Date()),
    listMedications(id),
    listMedAdmins(id, `${month}-01`, monthEnd),
  ]);
  const noteCount = await countNotes(id);
  const profile = await getClientProfile(id);
  const org = await getOrganization();
  // The query string busts the browser cache when the photo is replaced.
  const photoSrc = person.photoPath ? `/clients/${id}/photo?v=${person.photoUpdatedAt?.getTime() ?? 0}` : null;
  const history = tab === "profile" ? await listProfileHistory(id) : [];
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
  const unsigned = visits.filter(({ visit: v }) => v.status === "completed" && !v.clientSignedAt && !v.clientUnsignedReason).length;
  const activeTeam = team.filter((t) => t.assignment.active);
  const periodUnits = periodVisits.reduce((n, r) => n + r.visit.units, 0);
  const periodHours = Math.round(periodVisits.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0) / 6) / 10;

  // The right column answers "what do I do about this person", which is why the record is open.
  const soon = isoDay(60);
  const alerts: { tone: "danger" | "warn"; body: ReactNode; href?: string; cta?: string }[] = [];
  if (person.status === "active" && !person.signatureCodeHash) alerts.push({ tone: "danger", body: <><span className="font-medium">No signing code has been issued.</span> Nobody can co-sign a note until one exists.</>, href: `/clients/${id}`, cta: "Issue a code" });
  if (person.status === "active" && !person.phone) alerts.push({ tone: "warn", body: <><span className="font-medium">No mobile number on file,</span> so a signing code has nowhere to be sent.</>, href: `/clients/${id}/edit`, cta: "Add a number" });
  if (unsigned) alerts.push({ tone: "warn", body: <><span className="font-medium">{unsigned} note{unsigned === 1 ? " is" : "s are"} unsigned</span> in the periods shown.</>, href: `/clients/${id}?tab=notes`, cta: "Review them" });
  if (person.status === "active" && active.length === 0) alerts.push({ tone: "danger", body: <><span className="font-medium">No active authorization.</span> Notes cannot be recorded or billed.</>, href: `/clients/${id}/agreements/new`, cta: "Add an agreement" });
  for (const { agreement: a, unitsUsed } of active) {
    const pct = a.authorizedUnits ? Math.round((unitsUsed / a.authorizedUnits) * 100) : 0;
    if (pct >= 75) alerts.push({ tone: pct >= 90 ? "danger" : "warn", body: <><span className="font-medium">{labelForCode(a.serviceCode, a.modifiers)} is {pct}% used</span> with {(a.authorizedUnits - unitsUsed).toLocaleString()} units left.</>, href: `/clients/${id}/agreements/${a.id}`, cta: "Open authorization" });
    else if (a.endDate <= soon) alerts.push({ tone: "warn", body: <><span className="font-medium">{labelForCode(a.serviceCode, a.modifiers)} ends {fmtDate(a.endDate)}.</span> Renewal has to be in before then.</>, href: `/clients/${id}/agreements/${a.id}`, cta: "Open authorization" });
  }
  for (const t of team.filter((x) => x.assignment.active && !x.assignment.orientedOn)) alerts.push({ tone: "warn", body: <><span className="font-medium">{t.staff.firstName} {t.staff.lastName} is not oriented</span> to this person, which blocks clock-in.</>, href: `/staff/${t.staff.id}`, cta: "Record orientation" });

  // Everything the Profile tab is a checklist of, built once so the tab badge and the section list
  // agree about what is still missing.
  const posLabel: Record<string, string> = { home: "Home", community: "Community", day_program: "Day program", residential: "Residential site", school: "School", telehealth: "Telehealth", other: "Other" };
  const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const hhmm = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`; };
  const profileSections: Section[] = [
    { key: "contacts", label: "Emergency contacts", count: profile.contacts.length, done: profile.contacts.length > 0, editable: "contacts", addLabel: "Add contact" },
    { key: "careteam", label: "Care team", count: activeTeam.length, done: activeTeam.length > 0 && activeTeam.every((t) => t.assignment.orientedOn), alert: activeTeam.some((t) => !t.assignment.orientedOn) },
    { key: "diagnoses", label: "Medical information", count: profile.diagnoses.length, done: profile.diagnoses.length > 0, editable: "diagnoses", addLabel: "Add diagnosis" },
    { key: "casemanager", label: "Referring providers", count: person.caseManagerName ? 1 : 0, done: Boolean(person.caseManagerName) },
    { key: "funding", label: "Funding sources", count: profile.funding.length, done: profile.funding.length > 0, editable: "funding", addLabel: "Add funding source" },
    { key: "locations", label: "Care locations", count: profile.locations.length, done: profile.locations.length > 0, editable: "locations", addLabel: "Add care location" },
    { key: "authorizations", label: "Authorizations", count: active.length, done: active.length > 0, alert: person.status === "active" && active.length === 0 },
    { key: "availability", label: "Availability", count: profile.availability.length, done: profile.availability.length > 0, editable: "availability", addLabel: "Add availability" },
    { key: "history", label: "Profile history", count: 0, done: false },
  ];
  const profileOutstanding = profileSections.filter((s) => !s.done && s.key !== "history").length;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "lifeplan", label: "Programming", count: goals.filter((g) => g.goal.status === "active").length },
    { key: "notes", label: "Sessions", count: noteCount },
    { key: "files", label: "Documents", count: documents.length },
    { key: "medical", label: "Reports", count: meds.filter((m) => m.active).length || undefined },
    { key: "profile", label: "Profile", count: profileOutstanding || undefined },
  ];

  return (
    <div>
      {openVisit && <VisitSheet id={openVisit} />}
      {newCode && (newCode === "texted" ? (
        <Notice tone="ok">Signing code texted to {person.firstName}. Staff never see it.</Notice>
      ) : (
        <Notice tone="warn"><span className="font-medium text-text-strong">Signing code {newCode}</span><span className="text-muted-foreground"> · read it to {person.firstName} now, it is not shown again. {person.phone ? "Texting is off, so codes cannot be sent yet." : "Add a mobile number and future codes can be texted instead."}</span></Notice>
      ))}
      <PatientBanner
        name={fullName(person)}
        avatar={<ClientPhoto personId={id} name={fullName(person)} initials={`${person.firstName[0]}${person.lastName[0]}`} src={photoSrc} manage={manage} size={44} />}
        facts={<>
          {person.serviceStartDate && <span>Client since <span className="ident">{fmtDate(person.serviceStartDate)}</span></span>}
        </>}
        chips={<>
          {manage ? <StatusControl personId={id} status={person.status} /> : <Badge tone={statusTone[person.status]}>{person.status}</Badge>}
          {/* The reference shows a sequential "ID: 1" here; ours is the PMI, which is the number
              anyone dealing with this person actually quotes. */}
          <span className="inline-flex h-[26px] items-center rounded-full border border-line px-2.5 text-[13.5px] text-muted-foreground">
            PMI <span className="ident ml-1 text-text-strong">{person.pmi}</span>
          </span>
          {person.status === "active" && !person.signatureCodeHash && <Badge tone="danger">no signing code</Badge>}
        </>}
        actions={<span className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-[13.5px] text-muted-foreground"><Icon.building size={14} />{org.name}</span>}
      />
      <Tabs tabs={tabs} current={tab} base={`/clients/${id}`} />

      {tab === "overview" && (
        <ChartGrid>
          <ChartCol>
            <ChartSection label="Demographics" action={<Link href={`/clients/${id}?tab=profile`} className="text-primary hover:underline">Profile →</Link>}>
              <ChartFacts items={[
                { label: "Address", value: address || null },
                { label: "Phone", value: person.phone ? <a href={`tel:${person.phone}`} className="ident text-primary hover:underline">{person.phone}</a> : <Link href={`/clients/${id}/edit`} className="text-hint hover:underline">Add a number</Link> },
                { label: "Email", value: person.email ? <a href={`mailto:${person.email}`} className="text-primary hover:underline">{person.email}</a> : null },
                { label: "Case mgr", value: person.caseManagerName },
                { label: "Emergency", value: profile.contacts[0] ? <>{profile.contacts[0].name}{profile.contacts[0].phone && <div className="ident text-muted-foreground">{profile.contacts[0].phone}</div>}</> : <Link href={`/clients/${id}?tab=profile`} className="text-hint hover:underline">None on file</Link> },
              ]} />
            </ChartSection>
            <ChartSection label="Care team" action={<Link href={`/clients/${id}?tab=profile`} className="text-primary hover:underline">All →</Link>}>
              {activeTeam.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No caregivers assigned yet.</p> : activeTeam.slice(0, 4).map((t) => (
                <ChartLine key={t.assignment.id}>
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground">{t.staff.firstName[0]}{t.staff.lastName[0]}</span>
                  <span className="min-w-0 flex-1 truncate">{t.staff.firstName} {t.staff.lastName}</span>
                  <Badge tone={t.assignment.orientedOn ? "ok" : "warn"}>{t.assignment.orientedOn ? "Oriented" : "Orientation due"}</Badge>
                </ChartLine>
              ))}
            </ChartSection>
            <ChartSection label={track ? `Planning · ${track}` : "Planning"} action={<Rule name="planning" />}>
              {deadlines.length === 0 ? <p className="text-[12.5px] text-muted-foreground">{person.serviceStartDate ? "Add an agreement with a service type to compute deadlines." : "Set a service start date to compute deadlines."}</p> : (
                <>
                  {deadlines.map((d) => { const overdue = d.due < new Date(); return (
                    <ChartLine key={d.id} className="items-start">
                      <span className="min-w-0 flex-1 leading-snug" title={d.cite}>{d.label}</span>
                      <span className={cx("ident shrink-0", overdue ? "text-danger" : "text-muted-foreground")}>{fmtDateNum(d.due.toISOString())}</span>
                    </ChartLine>
                  ); })}
                  <p className="mt-2 text-[11.5px] text-hint">Calculated dates. Verify completion in Plans &amp; files.</p>
                </>
              )}
            </ChartSection>
            {manage && (
              <ChartSection label="Signing code" action={<Rule name="code" />}>
                <ClientCodePanel personId={id} hasCode={Boolean(person.signatureCodeHash)} setAt={person.signatureCodeSetAt ? fmtDate(person.signatureCodeSetAt) : null} sentAt={person.signatureCodeSentAt ? fmtDateTime(person.signatureCodeSentAt) : null} sentTo={person.signatureCodeSentTo} phone={person.phone} consent={person.smsConsent} />
              </ChartSection>
            )}
            {manage && !person.medicationSupport && meds.length === 0 && <div className="mt-3"><MedicationSupportToggle personId={id} on={false} manage /></div>}
          </ChartCol>

          <ChartCol>
            <ChartSection label={`Authorizations · ${active.length} active`} action={<Link href={`/clients/${id}?tab=authorizations`} className="text-primary hover:underline">Manage →</Link>}>
              {active.length === 0 ? (
                <Empty icon="doc" title="No active authorization" action={manage && <LinkButton href={`/clients/${id}/agreements/new`} variant="primary">Add an agreement</LinkButton>}>Notes cannot be recorded until one exists.</Empty>
              ) : active.map(({ agreement: a, unitsUsed }) => (
                <Link key={a.id} href={`/clients/${id}/agreements/${a.id}`} className="block border-b border-line-soft py-2 last:border-0 hover:bg-hover">
                  <div className="flex items-baseline gap-2.5">
                    <ServiceDot code={a.serviceCode} className="translate-y-[-1px]" />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-text-strong">{labelForCode(a.serviceCode, a.modifiers)}</span>
                    <span className="ident text-[12px] text-muted-foreground">{fmtMoney(a.unitRate)}/u</span>
                  </div>
                  <div className="ml-[18px] mt-0.5 text-[11.5px] text-muted-foreground">
                    <span className="ident">{a.serviceCode}{a.modifiers.length ? " " + a.modifiers.join(" ") : ""}</span>
                    {" · "}<span className="ident text-text-strong">{(a.authorizedUnits - unitsUsed).toLocaleString()}</span> of {a.authorizedUnits.toLocaleString()} units left
                    {" · through "}<span className="ident">{fmtDateNum(a.endDate)}</span>
                  </div>
                  <div className="ml-[18px]"><UnitBar used={unitsUsed} total={a.authorizedUnits} code={a.serviceCode} /></div>
                </Link>
              ))}
            </ChartSection>
            <ChartSection label="Recent notes" action={<Link href={`/clients/${id}?tab=notes`} className="text-primary hover:underline">All {noteCount} →</Link>}>
              {visits.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No notes in the periods shown. <Link href={`/clients/${id}?tab=notes`} className="text-primary hover:underline">Look further back</Link>.</p> : visits.slice(0, 8).map(({ visit: v, staffFirst, staffLast }) => (
                <ChartLine key={v.id}>
                  <ServiceDot code={v.serviceCode} />
                  <Link href={`/clients/${id}?note=${v.id}`} scroll={false} className="ident w-[92px] shrink-0 whitespace-nowrap text-muted-foreground hover:underline">{fmtDayTime(v.clockInAt)}</Link>
                  <span className="min-w-0 flex-1 truncate">{staffFirst} {staffLast} <span className="text-muted-foreground">· <span className="ident">{v.units}</span> units</span></span>
                  {v.status === "completed" && !v.clientSignedAt ? <Badge tone="danger">unsigned</Badge> : v.status !== "completed" ? <Badge tone={visitTone(v.status)}>{v.status.replace("_", " ")}</Badge> : v.manualEntry ? <Badge tone="warn">manual</Badge> : <Icon.check size={13} className="text-ok" aria-label="signed" />}
                </ChartLine>
              ))}
            </ChartSection>
          </ChartCol>

          <ChartCol>
            <ChartSection label={alerts.length ? `Needs attention · ${alerts.length}` : "Needs attention"}>
              {alerts.length === 0 ? (
                <p className="text-[12.5px] text-muted-foreground">Nothing outstanding. Notes are signed, the authorizations have room, and the team is oriented.</p>
              ) : alerts.map((a, i) => <ChartAlert key={i} tone={a.tone} action={a.href && <Link href={a.href} className="font-medium underline underline-offset-2">{a.cta}</Link>}>{a.body}</ChartAlert>)}
            </ChartSection>
            <ChartSection label="This pay period">
              <ChartLine><span className="flex-1 text-muted-foreground">Units</span><span className="ident font-medium text-text-strong">{periodUnits}</span></ChartLine>
              <ChartLine><span className="flex-1 text-muted-foreground">Hours</span><span className="ident font-medium text-text-strong">{periodHours}</span></ChartLine>
              <ChartLine><span className="flex-1 text-muted-foreground">Notes</span><span className="ident font-medium text-text-strong">{periodVisits.length}</span></ChartLine>
              <ChartLine><span className="flex-1 text-muted-foreground">Units left</span><span className="ident font-medium text-text-strong">{unitsLeft.toLocaleString()}</span></ChartLine>
            </ChartSection>
          </ChartCol>
        </ChartGrid>
      )}

      {tab === "authorizations" && (
        <Card title="Service agreements" description="Every authorization on file. Click one to view or edit units, dates, and rate." actions={manage && <LinkButton href={`/clients/${id}/agreements/new`} variant="primary">New agreement</LinkButton>}>
          {agreements.length === 0 ? <Empty icon="doc" title="No service agreements yet" /> : (
            <Table>
              <Thead><Th>Agreement</Th><Th>Service</Th><Th>Units</Th><Th align="right">Rate</Th><Th>Dates</Th><Th>County</Th><Th>Status</Th><Th /></Thead>
              <tbody>{agreements.map(({ agreement: a, unitsUsed }) => <Tr key={a.id} muted={a.status !== "active"}><Td strong><Link href={`/clients/${id}/agreements/${a.id}`} className="text-primary hover:underline">{a.agreementNumber}</Link>{a.documentPath && <a href={`/agreements/${a.id}/document`} target="_blank" rel="noreferrer" className="ml-2 text-xs font-normal text-muted-foreground hover:underline">PDF</a>}</Td><Td>{labelForCode(a.serviceCode, a.modifiers)}<div className="text-xs text-muted-foreground tabular-nums">{a.serviceCode} {a.modifiers.join(" ")}</div></Td><Td><span className="flex items-center gap-2"><Ring used={unitsUsed} total={a.authorizedUnits} size={26} /><span className="tabular-nums">{unitsUsed.toLocaleString()} / {a.authorizedUnits.toLocaleString()}</span></span></Td><Td align="right">{fmtMoney(a.unitRate)}</Td><Td className="text-muted-foreground">{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</Td><Td>{a.authorizingCounty}</Td><Td><Badge tone={a.status === "active" ? "ok" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge></Td><Td align="right"><span className="flex justify-end gap-3">{manage && <Link href={`/clients/${id}/agreements/${a.id}`} className="text-xs font-medium text-primary hover:underline">Edit</Link>}{manage && <AgreementStatusButton id={a.id} personId={id} status={a.status} />}</span></Td></Tr>)}</tbody>
            </Table>
          )}
        </Card>
      )}

      {tab === "notes" && (
        <NotesTab
          personId={id}
          base={`/clients/${id}`}
          filters={{ code: noteCode, from: noteFrom, to: noteTo }}
          codes={Array.from(new Map(agreements.map((a) => [a.agreement.serviceCode, { code: a.agreement.serviceCode, label: labelForCode(a.agreement.serviceCode, a.agreement.modifiers) }])).values())}
          rows={noteRows.filter((r) => !noteCode || r.visit.serviceCode === noteCode).map(({ visit: v, staffFirst, staffLast, editCount }): NoteRow => ({ returned: Boolean(v.returnedAt), id: v.id, clockInAt: v.clockInAt, clockOutAt: v.clockOutAt, serviceCode: v.serviceCode, modifiers: v.modifiers, units: v.units, status: v.status, note: v.shiftNote, interaction: v.interactionLevel, skills: v.skills, staff: `${staffFirst} ${staffLast}`, staffSigned: Boolean(v.staffSignedAt), clientSigned: Boolean(v.clientSignedAt), approved: Boolean(v.approvedAt), manual: v.manualEntry, edits: editCount, goalYes: noteResponses.get(v.id)?.yes ?? 0, goalNo: noteResponses.get(v.id)?.no ?? 0 }))}
        />
      )}

      {tab === "files" && (
        <Card title="Plans and files" description="Support plan, IAPP, treatment goals, and anything else staff should read before a shift">
          {documents.length === 0 ? <p className="px-5 py-6 text-center text-[13px] text-muted-foreground">No files yet. {manage ? "Upload the support plan, the IAPP, and treatment goals below." : "Your supervisor has not uploaded plans for this person yet."}</p> : (
            DOCUMENT_CATEGORIES.map(([cat, label]) => { const docs = documents.filter((d) => d.doc.category === cat); if (!docs.length) return null; return (
              <div key={cat} className="border-b border-line-soft last:border-b-0">
                <div className="bg-sidebar px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{label}</div>
                <ul className="divide-y divide-line-soft">{docs.map(({ doc, uploaderEmail }) => <li key={doc.id} className="flex flex-wrap items-center gap-3 px-5 py-3"><a href={`/clients/${id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="flex min-w-0 flex-1 items-center gap-3 hover:underline"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-panel text-gray-600"><Icon.doc size={18} /></span><span className="min-w-0"><span className="block truncate font-medium text-text-strong">{doc.title}</span><span className="block truncate text-[13px] text-muted-foreground">{doc.effectiveOn ? `Effective ${fmtDate(doc.effectiveOn)} · ` : ""}{doc.fileName} · {Math.max(1, Math.round(doc.sizeBytes / 1024))} KB{manage ? ` · ${uploaderEmail}` : ""}</span>{doc.note && <span className="mt-0.5 block text-[13px] text-text">{doc.note}</span>}</span></a><PreviewButton href={`/clients/${id}/documents/${doc.id}`} title={doc.title} mime={doc.mimeType} /><a href={`/clients/${id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center rounded-full bg-primary-soft px-2.5 text-xs font-medium text-primary hover:bg-blue-300/40">Open</a>{manage && <DeleteDocument id={doc.id} personId={id} />}</li>)}</ul>
              </div>
            ); })
          )}
          {manage && <div className="border-t border-line-soft bg-sidebar px-5 py-4"><div className="mb-3 text-[13px] font-medium text-text-strong">Upload a plan or file</div><DocumentUpload personId={id} /></div>}
        </Card>
      )}


      {tab === "lifeplan" && (
        <div className="mx-auto max-w-4xl">
          <div className="mb-4 flex items-baseline justify-between"><h2 className="text-[18px]">{person.firstName}&apos;s support plan goals</h2><span className="text-[13px] text-muted-foreground">Responses from the last 90 days</span></div>
          <LifePlan personId={id} manage={manage} rangeLabel="in the last 90 days" goals={goals.map((g) => ({ id: g.goal.id, title: g.goal.title, description: g.goal.description, category: g.goal.category, status: g.goal.status, targetDate: g.goal.targetDate, questions: g.questions.map((q) => ({ id: q.question.id, prompt: q.question.prompt, yes: q.yes, no: q.no, na: q.na })) }))} />
          <ActivityLibrary personId={id} firstName={person.firstName} library={person.activityLibrary} defaults={DEFAULT_ACTIVITIES} manage={manage} />
        </div>
      )}

      {tab === "medical" && (
        <><div className="mb-3"><MedicationSupportToggle personId={id} on={person.medicationSupport} manage={manage} /></div>
        <Medical personId={id} month={month} monthLabel={monthLabel} prevHref={`/clients/${id}?tab=medical&month=${shiftMonth(-1)}`} nextHref={`/clients/${id}?tab=medical&month=${shiftMonth(1)}`} manage={manage} canRecord={Boolean(user.staffId) || manage} today={new Date().toISOString().slice(0, 10)}
          meds={meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, route: m.route, frequency: m.frequency, times: m.times, instructions: m.instructions, prescriber: m.prescriber, startDate: m.startDate, endDate: m.endDate, active: m.active }))}
          admins={admins.map((a) => ({ medicationId: a.medicationId, date: a.scheduledDate, time: a.scheduledTime, status: a.status, note: a.note }))} /></>
      )}

      {tab === "profile" && (
        <ClientProfile
          personId={id}
          manage={manage}
          editHref={`/clients/${id}/edit`}
          general={[
            { icon: "user", label: "Full name", value: fullName(person) },
            { icon: "calendar", label: "Date of birth", value: <span className="ident">{fmtDate(person.dob)}</span> },
            { icon: "id", label: "PMI #", value: <span className="ident">{person.pmi}</span> },
            { icon: "pin", label: "Address", value: address || <span className="text-hint">Not recorded</span> },
            { icon: "phone", label: "Phone", value: person.phone ? <a href={`tel:${person.phone}`} className="ident text-primary hover:underline">{person.phone}</a> : <span className="text-hint">Not recorded</span> },
            { icon: "catalog", label: "Waiver", value: `${person.waiverProgram} · ${person.county} County` },
          ] satisfies Field[]}
          sections={profileSections}
          blanks={{
            contacts: "No emergency contact on file. At least one is expected before services start.",
            careteam: "Nobody is assigned to this person yet, so no one can clock in.",
            diagnoses: "No diagnosis recorded. Payers ask for the ICD-10 code that justifies the service.",
            casemanager: "No case manager recorded.",
            funding: "No funding source recorded. Add the payer behind these authorizations so claims know where to go.",
            locations: "No care location recorded, so notes fall back to the address on the record.",
            authorizations: "No active authorization. Notes cannot be recorded or billed.",
            availability: "No availability recorded. Scheduling has no idea when this person is free.",
            history: history.length ? "" : "Nothing has been recorded against this profile yet.",
          }}
          entities={{
            contacts: profile.contacts.map((c) => ({
              id: c.id,
              raw: { id: c.id, name: c.name, relationship: c.relationship, phone: c.phone, email: c.email, notes: c.notes, isPrimary: c.isPrimary, isLegalRepresentative: c.isLegalRepresentative },
              fields: [
                { icon: "user", label: "Contact name", value: c.name },
                { icon: "tag", label: "Relationship", value: c.relationship },
                { icon: "phone", label: "Phone number", value: c.phone ? <a href={`tel:${c.phone}`} className="ident text-primary hover:underline">{c.phone}</a> : <span className="italic text-hint">Not recorded</span> },
                { icon: "mail", label: "Email", value: c.email ? <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: c.isLegalRepresentative ? <Badge tone="warn">Legal representative</Badge> : null,
            })),
            careteam: activeTeam.map((t) => ({
              id: t.assignment.id,
              fields: [
                { icon: "staff", label: "Caregiver", value: <Link href={`/staff/${t.staff.id}`} className="text-primary hover:underline">{t.staff.firstName} {t.staff.lastName}</Link> },
                { icon: "check", label: "Oriented", value: t.assignment.orientedOn ? <span className="ident">{fmtDate(t.assignment.orientedOn)}</span> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: t.assignment.orientedOn ? <Badge tone="ok">Cleared to work</Badge> : <Badge tone="danger">Blocks clock-in</Badge>,
            })),
            diagnoses: profile.diagnoses.map((d) => ({
              id: d.id,
              raw: { id: d.id, icdCode: d.icdCode, description: d.description, diagnosedOn: d.diagnosedOn, isPrimary: d.isPrimary },
              fields: [
                { icon: "code", label: "ICD-10", value: <span className="ident">{d.icdCode}</span> },
                { icon: "doc", label: "Description", value: d.description },
                { icon: "calendar", label: "Diagnosed", value: d.diagnosedOn ? <span className="ident">{fmtDate(d.diagnosedOn)}</span> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: d.isPrimary ? <Badge tone="accent">Primary</Badge> : null,
            })),
            casemanager: person.caseManagerName ? [{
              id: "cm",
              fields: [
                { icon: "user", label: "Case manager", value: person.caseManagerName },
                { icon: "phone", label: "Phone", value: person.caseManagerPhone ? <span className="ident">{person.caseManagerPhone}</span> : <span className="italic text-hint">Not recorded</span> },
                { icon: "mail", label: "Email", value: person.caseManagerEmail ?? <span className="italic text-hint">Not recorded</span> },
                { icon: "building", label: "County", value: `${person.county} County` },
              ],
            }] : [],
            funding: profile.funding.map((f) => ({
              id: f.id,
              raw: { id: f.id, payer: f.payer, waiver: f.waiver, memberId: f.memberId, priority: f.priority, startDate: f.startDate, endDate: f.endDate, notes: f.notes },
              fields: [
                { icon: "money", label: "Payer", value: f.payer },
                { icon: "id", label: "Member ID", value: f.memberId ? <span className="ident">{f.memberId}</span> : <span className="italic text-hint">Not recorded</span> },
                { icon: "calendar", label: "Effective", value: <span className="ident">{fmtDate(f.startDate)}{f.endDate ? ` – ${fmtDate(f.endDate)}` : " – open"}</span> },
              ],
              chips: <>{f.waiver && <Badge tone="neutral">{f.waiver}</Badge>}<Badge tone={f.priority === "primary" ? "accent" : "neutral"}>{f.priority}</Badge></>,
            })),
            locations: profile.locations.map((l) => ({
              id: l.id,
              raw: { id: l.id, type: l.type, label: l.label, address1: l.address1, address2: l.address2, city: l.city, state: l.state, zip: l.zip, posCode: l.posCode, isDefault: l.isDefault },
              fields: [
                { icon: "sites", label: "Location type", value: `${posLabel[l.type] ?? l.type} (${l.posCode})` },
                { icon: "pin", label: "Address", value: [l.address1, l.address2, [l.city, l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") || <span className="italic text-hint">Not recorded</span> },
              ],
              chips: l.isDefault ? <Badge tone="accent">Default</Badge> : null,
            })),
            authorizations: active.map(({ agreement: a, unitsUsed }) => ({
              id: a.id,
              fields: [
                { icon: "doc", label: "Service", value: <Link href={`/clients/${id}/agreements/${a.id}`} className="text-primary hover:underline">{labelForCode(a.serviceCode, a.modifiers)}</Link> },
                { icon: "units", label: "Units", value: <><span className="ident">{(a.authorizedUnits - unitsUsed).toLocaleString()}</span> of <span className="ident">{a.authorizedUnits.toLocaleString()}</span> left<UnitBar used={unitsUsed} total={a.authorizedUnits} code={a.serviceCode} /></> },
                { icon: "calendar", label: "Dates · rate", value: <><span className="ident">{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</span><div className="ident text-[11.5px] text-muted-foreground">{fmtMoney(a.unitRate)} / unit</div></> },
              ],
            })),
            availability: profile.availability.map((a) => ({
              id: a.id,
              raw: { id: a.id, weekday: a.weekday, startTime: a.startTime, endTime: a.endTime, notes: a.notes },
              fields: [
                { icon: "calendar", label: "Day", value: dayName[a.weekday] },
                { icon: "clock", label: "Window", value: <span className="ident">{hhmm(a.startTime)} – {hhmm(a.endTime)}</span> },
                { icon: "doc", label: "Notes", value: a.notes ?? <span className="italic text-hint">None</span> },
              ],
            })),
          } satisfies Record<string, Entity[]>}
          extras={{
            careteam: manage ? <Link href={`/staff`} className="text-[12.5px] font-medium text-primary hover:underline">Assign a caregiver from the staff record →</Link> : null,
            diagnoses: meds.filter((m) => m.active).length > 0 ? <Link href={`/clients/${id}?tab=medical`} className="text-[12.5px] font-medium text-primary hover:underline">{meds.filter((m) => m.active).length} active medication{meds.filter((m) => m.active).length === 1 ? "" : "s"} on the MAR →</Link> : null,
            authorizations: manage ? <Link href={`/clients/${id}/agreements/new`} className="text-[12.5px] font-medium text-primary hover:underline">Add an authorization, or upload the DHS letter →</Link> : null,
            history: history.length > 0 ? (
              <div>
                <div className="overflow-x-auto rounded-[10px] border border-line">
                  <table className="w-full min-w-[520px] border-collapse text-[12.5px]">
                    <thead>
                      <tr className="bg-sidebar text-left text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Date</th>
                        <th className="px-3 py-2 font-medium">Team member</th>
                        <th className="px-3 py-2 font-medium">Event</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-t border-line-soft">
                          <td className="whitespace-nowrap px-3 py-2"><span className="ident text-muted-foreground">{fmtDateTime(h.at)}</span></td>
                          <td className="whitespace-nowrap px-3 py-2 text-text">{h.actor}</td>
                          <td className="px-3 py-2 text-text-strong">{h.event}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2.5 text-center text-[12px] text-muted-foreground">
                  1 — {history.length} of {history.length} event{history.length === 1 ? "" : "s"}
                  {history.length === 50 && " · newest 50"}
                </p>
              </div>
            ) : null,
          }}
        />
      )}

    </div>
  );
}
