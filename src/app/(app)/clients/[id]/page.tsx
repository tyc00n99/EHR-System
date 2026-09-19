import Link from "next/link";
import { notFound } from "next/navigation";

import { Icon } from "@/components/icons";
import { Badge, Card, Empty, LinkButton, Table, Tabs, Td, Th, Thead, Tr, cx, Notice } from "@/components/kit";
import { MarginSection, PatientBanner, UnitBar } from "@/components/chart";
import { ClientProfile, type Entity, type Field, type Section } from "./client-profile";
import { ClientPhoto } from "./client-photo";
import { ProfileHistory } from "./profile-history";
import { getClientProfile, listProfileHistory } from "@/db/profile-queries";
import { ActivityLibrary } from "./activity-library";
import { DEFAULT_ACTIVITIES } from "@/lib/templates";
import { getOrganization } from "@/db/queries";
import { canViewPerson, getPerson, listAgreementsForPerson, listAssignmentsForPerson, listClientDocuments, listDocumentTypes, listGoalsWithStats, listMedAdmins, listMedications, countNotes } from "@/db/queries";
import { LifePlan } from "./life-plan";
import { VisitsTable } from "../../visits/visits-table";
import { buildVisitTable } from "@/lib/visit-table";
import { StatusControl } from "./status-control";
import { MedicationSupportToggle } from "./med-toggle";
import { Medical } from "./medical";
import { can, requireUser } from "@/lib/auth";
import { buildDocumentChecklist, checklistSummary, typeIdOf } from "@/lib/client-documents";
import { fmtDate, fmtHistoryAt, fmtLongDate, fmtMoney, fullName, isoDay } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { AgreementArchiveButton, AgreementStatusButton } from "./agreement-status";
import { ClientCodePanel } from "./client-code";
import { CODE_ROTATION_DAYS } from "@/lib/client-code";
import { DocumentsTab } from "./documents-tab";
import { AuthorizationsPanel } from "./authorizations-panel";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { VisitSheet } from "../../visits/record/visit-sheet";

const SEX: Record<string, string> = { female: "Female", male: "Male", nonbinary: "Non-binary", other: "Other", undisclosed: "Undisclosed" };

const statusTone = { active: "ok", intake: "accent", discharged: "neutral" } as const;

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
  const person = await getPerson(id);
  if (!person || !(await canViewPerson(user, id))) notFound();
  const manage = can(user, "manage_people");
  const aiReady = aiConfigured();
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  // How far back the Programming tab counts answers; a quick picker in its margin sets it (2026-09-19).
  const goalDays = [30, 60, 90, 180, 365].includes(Number(sp.days)) ? Number(sp.days) : 90;
  const goalFrom = daysAgo(goalDays);
  const [my0, mm0] = month.split("-").map(Number);
  const monthEnd = `${month}-${String(new Date(Date.UTC(my0, mm0, 0)).getUTCDate()).padStart(2, "0")}`;
  const vt = tab === "notes" ? await buildVisitTable({ sp, personId: id, defaultParam: `from=${isoDay(-90)}&to=${isoDay(0)}` }) : null;
  const [agreements, documents, team, goals, meds, admins, docTypes] = await Promise.all([
    listAgreementsForPerson(id),
    listClientDocuments(id),
    listAssignmentsForPerson(id),
    listGoalsWithStats(id, goalFrom, new Date()),
    listMedications(id),
    listMedAdmins(id, `${month}-01`, monthEnd),
    listDocumentTypes(),
  ]);
  const liveDocuments = documents.map((d) => d.doc).filter((d) => !d.archivedAt);
  const checklist = buildDocumentChecklist(liveDocuments, docTypes);
  const requiredTypeIds = new Set(checklist.map((i) => i.type.id));
  const noteCount = await countNotes(id);
  const profile = await getClientProfile(id);
  const org = await getOrganization();
  // The query string busts the browser cache when the photo is replaced.
  const photoSrc = person.photoPath ? `/clients/${id}/photo?v=${person.photoUpdatedAt?.getTime() ?? 0}` : null;
  const history = tab === "profile" ? await listProfileHistory(id, 500) : [];
  const [my, mm] = month.split("-").map(Number);
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(my, mm - 1, 1)));
  const shiftMonth = (d: number) => { const x = new Date(Date.UTC(my, mm - 1 + d, 1)); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`; };
  const address = [person.address1, person.address2, person.city && `${person.city}, ${person.state} ${person.zip ?? ""}`.trim()].filter(Boolean).join(", ");
  const liveAgreements = agreements.filter((a) => !a.agreement.archivedAt);
  const archived = agreements.filter((a) => a.agreement.archivedAt);
  const active = liveAgreements.filter((a) => a.agreement.status === "active");
  const activeTeam = team.filter((t) => t.assignment.active);


  // Everything the Profile tab is a checklist of, built once so the tab badge and the section list
  // agree about what is still missing.
  const posLabel: Record<string, string> = { home: "Home", community: "Community", day_program: "Day program", residential: "Residential site", school: "School", telehealth: "Telehealth", other: "Other" };
  const hhmm = (t: string) => { const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`; };
  const profileSections: Section[] = [
    { key: "contacts", label: "Emergency contacts", count: profile.contacts.length, done: profile.contacts.length > 0, editable: "contacts", addLabel: "Add contact" },
    { key: "careteam", label: "Care team", count: activeTeam.length, done: activeTeam.length > 0 && activeTeam.every((t) => t.assignment.orientedOn), alert: activeTeam.some((t) => !t.assignment.orientedOn) },
    { key: "diagnoses", label: "Medical information", count: profile.diagnoses.length, done: profile.diagnoses.length > 0, editable: "diagnoses", addLabel: "Add diagnosis" },
    { key: "casemanager", label: "Referring Agency", count: person.caseManagerName ? 1 : 0, done: Boolean(person.caseManagerName) },
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
    { key: "files", label: "Documents", count: liveDocuments.length },
    { key: "medical", label: "Medication", count: person.medicationSupport ? meds.filter((m) => m.active).length || undefined : undefined },
    { key: "profile", label: "Profile", count: profileOutstanding || undefined },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {openVisit && <VisitSheet id={openVisit} />}
      {newCode && (newCode === "texted" ? (
        <Notice tone="ok">Signing code texted to {person.firstName}. Staff never see it.</Notice>
      ) : (
        <Notice tone="warn"><span className="font-medium text-text-strong">Signing code {newCode}</span><span className="text-muted-foreground"> · read it to {person.firstName} now, it is not shown again. {person.phone ? "Texting is off, so codes cannot be sent yet." : "Add a mobile number and future codes can be texted instead."}</span></Notice>
      ))}
      <PatientBanner
        name={fullName(person)}
        avatar={<ClientPhoto personId={id} name={fullName(person)} initials={`${person.firstName[0]}${person.lastName[0]}`} src={photoSrc} manage={manage} size={36} />}
        facts={<>
          <span>PMI <span className="ident text-text-strong">{person.pmi}</span></span>
          {/* The reference prints this date in the sans face, not the mono one identifiers use. */}
          {person.serviceStartDate && <span>Client since {fmtDate(person.serviceStartDate)}</span>}
        </>}
        chips={<>
          {manage ? <StatusControl personId={id} status={person.status} /> : <Badge tone={statusTone[person.status]}>{person.status}</Badge>}
          {person.status === "active" && !person.signatureCodeHash && <Badge tone="danger">no signing code</Badge>}
        </>}
        actions={<span className="inline-flex h-[26px] items-center gap-1.5 rounded-md border border-line bg-card px-2.5 text-[13.5px] text-muted-foreground"><Icon.building size={14} />{org.name}</span>}
      />
      <Tabs tabs={tabs} current={tab} base={`/clients/${id}`} />

      {tab === "overview" && (
        <div>
          <AuthorizationsPanel personId={id} manage={manage} defaultCounty={person.county} aiReady={aiReady} items={active.map(({ agreement: a, unitsUsed }) => ({ id: a.id, agreementNumber: a.agreementNumber, serviceCode: a.serviceCode, modifiers: a.modifiers, authorizedUnits: a.authorizedUnits, unitsUsed, unitRate: a.unitRate, startDate: a.startDate, endDate: a.endDate, authorizingCounty: a.authorizingCounty, status: a.status, documentPath: a.documentPath, documentName: a.documentName }))} />
          <MarginSection label="Care team" action={<Link href={`/clients/${id}?tab=profile&section=careteam`} className="hover:underline">All →</Link>}>
            {activeTeam.length === 0 ? <p className="py-2 text-[14px] text-muted-foreground">No caregivers assigned yet.</p> : (
              <div className="grid gap-x-10 md:grid-cols-2">
                {activeTeam.map((t) => (
                  <div key={t.assignment.id} className="flex items-center justify-between gap-3 border-b border-line-soft py-2 text-[14px]">
                    <Link href={`/staff/${t.staff.id}`} className="min-w-0 truncate font-medium text-text-strong hover:underline">{t.staff.firstName} {t.staff.lastName}</Link>
                    <span className="shrink-0 text-[13px] text-muted-foreground">{t.staff.title}{!t.assignment.orientedOn && <span className="text-warn"> · orientation due</span>}</span>
                  </div>
                ))}
              </div>
            )}
          </MarginSection>
          {manage && <ClientCodePanel layout="line" personId={id} manage={manage} hasCode={Boolean(person.signatureCodeHash)} setAt={person.signatureCodeSetAt ? fmtDate(person.signatureCodeSetAt) : null} rotatesOn={person.signatureCodeSetAt ? fmtDate(new Date(person.signatureCodeSetAt.getTime() + CODE_ROTATION_DAYS * 86_400_000)) : null} sentAt={person.signatureCodeSentAt ? fmtDate(person.signatureCodeSentAt) : null} sentTo={person.signatureCodeSentTo} phone={person.phone} consent={person.smsConsent} />}
          {manage && !person.medicationSupport && meds.length === 0 && <div className="mt-4"><MedicationSupportToggle personId={id} on={false} manage /></div>}
        </div>
      )}

      {tab === "authorizations" && (
        <>
          <Card title="Service agreements" description="Current authorizations. Click one to view or edit units, dates, and rate; archive the ones from earlier years once they are closed." actions={manage && <LinkButton href={`/clients/${id}/agreements/new`} variant="primary">New agreement</LinkButton>}>
            {liveAgreements.length === 0 ? <Empty icon="doc" title={archived.length ? "Every agreement is archived" : "No service agreements yet"} /> : (
              <Table>
                <Thead><Th>Agreement</Th><Th>Service</Th><Th>Units</Th><Th align="right">Rate</Th><Th>Dates</Th><Th>County</Th><Th>Status</Th><Th /></Thead>
                <tbody>{liveAgreements.map(({ agreement: a, unitsUsed }) => <Tr key={a.id} muted={a.status !== "active"}><Td strong><Link href={`/clients/${id}/agreements/${a.id}`} className="text-primary hover:underline">{a.agreementNumber}</Link>{a.documentPath && <a href={`/agreements/${a.id}/document`} target="_blank" rel="noreferrer" className="ml-2 text-[13px] font-normal text-muted-foreground hover:underline">PDF</a>}</Td><Td>{labelForCode(a.serviceCode, a.modifiers)}<div className="text-[13px] text-muted-foreground tabular-nums">{a.serviceCode} {a.modifiers.join(" ")}</div></Td><Td><span className="flex items-center gap-2"><Ring used={unitsUsed} total={a.authorizedUnits} size={26} /><span className="tabular-nums">{unitsUsed.toLocaleString()} / {a.authorizedUnits.toLocaleString()}</span></span></Td><Td align="right">{fmtMoney(a.unitRate)}</Td><Td className="text-muted-foreground">{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</Td><Td>{a.authorizingCounty}</Td><Td><Badge tone={a.status === "active" ? "ok" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge></Td><Td align="right"><span className="flex justify-end gap-3">{manage && <Link href={`/clients/${id}/agreements/${a.id}`} className="text-[13px] font-medium text-primary hover:underline">Edit</Link>}{manage && <AgreementStatusButton id={a.id} personId={id} status={a.status} />}{manage && a.status !== "active" && <AgreementArchiveButton id={a.id} personId={id} archived={false} />}</span></Td></Tr>)}</tbody>
              </Table>
            )}
          </Card>
          {archived.length > 0 && (
            <Card title={`Archived · ${archived.length}`} description="Closed agreements kept for the record. They stay on the notes they were billed against and can be restored." className="mt-4">
              <Table>
                <Thead><Th>Agreement</Th><Th>Service</Th><Th>Units</Th><Th align="right">Rate</Th><Th>Dates</Th><Th>County</Th><Th>Status</Th><Th /></Thead>
                <tbody>{archived.map(({ agreement: a, unitsUsed }) => <Tr key={a.id} muted={a.status !== "active"}><Td strong><Link href={`/clients/${id}/agreements/${a.id}`} className="text-primary hover:underline">{a.agreementNumber}</Link>{a.documentPath && <a href={`/agreements/${a.id}/document`} target="_blank" rel="noreferrer" className="ml-2 text-[13px] font-normal text-muted-foreground hover:underline">PDF</a>}</Td><Td>{labelForCode(a.serviceCode, a.modifiers)}<div className="text-[13px] text-muted-foreground tabular-nums">{a.serviceCode} {a.modifiers.join(" ")}</div></Td><Td><span className="flex items-center gap-2"><Ring used={unitsUsed} total={a.authorizedUnits} size={26} /><span className="tabular-nums">{unitsUsed.toLocaleString()} / {a.authorizedUnits.toLocaleString()}</span></span></Td><Td align="right">{fmtMoney(a.unitRate)}</Td><Td className="text-muted-foreground">{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</Td><Td>{a.authorizingCounty}</Td><Td><Badge tone={a.status === "active" ? "ok" : a.status === "cancelled" ? "danger" : "neutral"}>{a.status}</Badge></Td><Td align="right"><span className="flex justify-end gap-3">{manage && <AgreementArchiveButton id={a.id} personId={id} archived />}</span></Td></Tr>)}</tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {tab === "notes" && vt && (
        <div>
          <VisitsTable search={false} rows={vt.rows} filters={vt.filters} options={vt.options} presets={vt.presets} base={{ path: `/clients/${id}`, keep: { tab: "notes" } }} showClient={false} exportPdf={`/clients/${id}/notes.pdf?from=${vt.range.from}&to=${vt.range.to}${vt.single.staff ? `&staff=${vt.single.staff}` : ""}${vt.single.service ? `&code=${vt.single.service}` : ""}`} />
        </div>
      )}

      {tab === "files" && (
        <DocumentsTab personId={id} items={checklist} types={docTypes} others={liveDocuments.filter((d) => !requiredTypeIds.has(typeIdOf(d, docTypes) ?? ""))} archived={documents.map((d) => d.doc).filter((d) => Boolean(d.archivedAt))} summary={checklistSummary(checklist)} manage={manage} canEditTypes={user.role === "admin"} orgName={org.name} aiReady={aiReady} />
      )}


      {tab === "lifeplan" && (
        <LifePlan personId={id} manage={manage} rangeLabel={goalDays === 365 ? "in the last year" : `in the last ${goalDays} days`} days={goalDays} goals={goals.map((g) => ({ id: g.goal.id, title: g.goal.title, outcome: g.goal.outcome, description: g.goal.description, category: g.goal.category, status: g.goal.status, startDate: g.goal.startDate, targetDate: g.goal.targetDate, questions: g.questions.map((q) => ({ id: q.question.id, prompt: q.question.prompt, active: q.question.active, yes: q.yes, no: q.no, na: q.na, thisMonth: q.thisMonth, lastMonth: q.lastMonth })), reviews: g.reviews.map((r) => ({ id: r.id, assessment: r.assessment, note: r.note, reviewedAt: r.reviewedAt, by: r.by })) }))} library={<ActivityLibrary personId={id} firstName={person.firstName} library={person.activityLibrary} defaults={DEFAULT_ACTIVITIES} manage={manage} />} />
      )}

      {tab === "medical" && (
        <><div className="mb-3"><MedicationSupportToggle personId={id} on={person.medicationSupport} manage={manage} /></div>
        {person.medicationSupport && <Medical personId={id} month={month} monthLabel={monthLabel} prevHref={`/clients/${id}?tab=medical&month=${shiftMonth(-1)}`} nextHref={`/clients/${id}?tab=medical&month=${shiftMonth(1)}`} manage={manage} canRecord={Boolean(user.staffId) || manage} today={new Date().toISOString().slice(0, 10)}
          meds={meds.map((m) => ({ id: m.id, name: m.name, dose: m.dose, route: m.route, frequency: m.frequency, times: m.times, instructions: m.instructions, prescriber: m.prescriber, startDate: m.startDate, endDate: m.endDate, active: m.active }))}
          admins={admins.map((a) => ({ medicationId: a.medicationId, date: a.scheduledDate, time: a.scheduledTime, status: a.status, note: a.note }))} />}</>
      )}

      {tab === "profile" && (
        <ClientProfile
          personId={id}
          manage={manage}
          editHref={`/clients/${id}/edit`}
          initialSection={typeof sp.section === "string" ? sp.section : undefined}
          schedule={{
            startDate: profile.availability[0]?.startDate ?? isoDay(0),
            endDate: profile.availability[0]?.endDate ?? "",
            timeZone: profile.availability[0]?.timeZone ?? "America/Chicago",
            days: [0, 1, 2, 3, 4, 5, 6].map((d) =>
              profile.availability.filter((a) => a.weekday === d).map((a) => ({ start: a.startTime, end: a.endTime })),
            ),
          }}
          avatarNode={<ClientPhoto personId={id} name={fullName(person)} initials={`${person.firstName[0]}${person.lastName[0]}`} src={photoSrc} manage={false} size={52} />}
          general={[
            // The reference's five rows, in its order: no phone, no email, no PMI, no waiver.
            // Those live in the banner and in Funding sources, so nothing is lost by leaving
            // them out of a card whose job is "who is this person".
            { label: "Full name", value: fullName(person), avatar: true },
            { icon: "calendar", label: "Date of birth", value: fmtLongDate(person.dob) },
            { icon: "user", label: "Sex at birth", value: person.sexAtBirth ? SEX[person.sexAtBirth] : <span className="font-normal text-hint">Not recorded</span> },
            { icon: "pin", label: "Address", value: address || <span className="font-normal text-hint">Not recorded</span> },
            { icon: "building", label: "Departments", value: org.name },
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
            availability: profile.availability.length ? "" : "No availability recorded. Scheduling has no idea when this person is free.",
            history: history.length ? "" : "Nothing has been recorded against this profile yet.",
          }}
          entities={{
            contacts: profile.contacts.map((c) => ({
              id: c.id,
              raw: { id: c.id, name: c.name, relationship: c.relationship, phone: c.phone, email: c.email, notes: c.notes, isPrimary: c.isPrimary, isLegalRepresentative: c.isLegalRepresentative },
              fields: [
                { icon: "user", label: "Contact name", value: c.name },
                { icon: "tag", label: "Relationship", value: c.relationship },
                { icon: "phone", label: "Phone number", value: c.phone ? <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a> : <span className="italic text-hint">Not recorded</span> },
                { icon: "mail", label: "Email", value: c.email ? <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: c.isLegalRepresentative ? <Badge tone="warn">Legal representative</Badge> : null,
            })),
            careteam: activeTeam.map((t) => ({
              id: t.assignment.id,
              fields: [
                { icon: "staff", label: "Caregiver", value: <Link href={`/staff/${t.staff.id}`} className="text-primary hover:underline">{t.staff.firstName} {t.staff.lastName}</Link> },
                { icon: "check", label: "Oriented", value: t.assignment.orientedOn ? <span>{fmtDate(t.assignment.orientedOn)}</span> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: t.assignment.orientedOn ? <Badge tone="ok">Cleared to work</Badge> : <Badge tone="danger">Blocks clock-in</Badge>,
            })),
            diagnoses: profile.diagnoses.map((d) => ({
              id: d.id,
              raw: { id: d.id, icdCode: d.icdCode, description: d.description, diagnosedOn: d.diagnosedOn, isPrimary: d.isPrimary },
              fields: [
                { icon: "code", label: "ICD-10", value: <span className="ident">{d.icdCode}</span> },
                { icon: "doc", label: "Description", value: d.description },
                { icon: "calendar", label: "Diagnosed", value: d.diagnosedOn ? <span>{fmtDate(d.diagnosedOn)}</span> : <span className="italic text-hint">Not recorded</span> },
              ],
              chips: d.isPrimary ? <Badge tone="accent">Primary</Badge> : null,
            })),
            casemanager: person.caseManagerName ? [{
              id: "cm",
              fields: [
                { icon: "user", label: "Case manager", value: person.caseManagerName },
                { icon: "phone", label: "Phone", value: person.caseManagerPhone ? <span>{person.caseManagerPhone}</span> : <span className="italic text-hint">Not recorded</span> },
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
                { icon: "calendar", label: "Effective", value: <span>{fmtDate(f.startDate)}{f.endDate ? ` – ${fmtDate(f.endDate)}` : " – open"}</span> },
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
                { icon: "calendar", label: "Dates · rate", value: <><span>{fmtDate(a.startDate)} – {fmtDate(a.endDate)}</span><div className="ident text-[13px] text-muted-foreground">{fmtMoney(a.unitRate)} / unit</div></> },
              ],
            })),
            availability: [],
          } satisfies Record<string, Entity[]>}
          extras={{
            careteam: manage ? <Link href={`/staff`} className="text-[13px] font-medium text-primary hover:underline">Assign a caregiver from the staff record →</Link> : null,
            diagnoses: meds.filter((m) => m.active).length > 0 ? <Link href={`/clients/${id}?tab=medical`} className="text-[13px] font-medium text-primary hover:underline">{meds.filter((m) => m.active).length} active medication{meds.filter((m) => m.active).length === 1 ? "" : "s"} on the MAR →</Link> : null,
            authorizations: manage ? <Link href={`/clients/${id}/agreements/new`} className="text-[13px] font-medium text-primary hover:underline">Add an authorization, or upload the DHS letter →</Link> : null,
            availability: profile.availability.length > 0 ? (
              <div>
                <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                  <Icon.calendar size={17} className="text-muted-foreground" />
                  <span className="text-muted-foreground">From</span>
                  <span className="ident font-medium text-text-strong">{fmtDate(profile.availability[0].startDate)}</span>
                  <span className="text-muted-foreground">to</span>
                  <span className="ident font-medium text-text-strong">{profile.availability[0].endDate ? fmtDate(profile.availability[0].endDate) : "open"}</span>
                  <span className="ml-2 text-muted-foreground">Last updated</span>
                  <span className="ident text-muted-foreground">{fmtDate(profile.availability[0].updatedAt)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const windows = profile.availability.filter((a) => a.weekday === d);
                    return (
                      <div key={d} className={cx("rounded-lg border px-3 py-2.5 text-center", windows.length ? "border-line bg-card" : "border-line-soft bg-panel")}>
                        <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-strong">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]}</div>
                        <div className="mt-2 border-t border-line-soft pt-2 text-[13px]">
                          {windows.length === 0
                            ? <span className="text-hint">Unavailable</span>
                            : windows.map((w) => <div key={w.id} className="ident text-text-strong">{hhmm(w.startTime)} – {hhmm(w.endTime)}</div>)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[13px] text-muted-foreground">Times shown in Central Time — Minnesota.</p>
              </div>
            ) : null,
            history: history.length > 0 ? (
              <ProfileHistory rows={history.map((h) => ({ id: h.id, at: fmtHistoryAt(h.at), sortAt: h.at.getTime(), actor: h.actor, event: h.event }))} />
            ) : null,
          }}
        />
      )}

    </div>
  );
}
