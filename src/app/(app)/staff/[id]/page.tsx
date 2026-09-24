import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, Empty, LinkButton, RecordHeader, Table, Tabs, Td, Th, Thead, Tr } from "@/components/kit";
import { getStaff, getUserForStaff, listAssignmentsForStaff, listCredentials, listPeople, listRecentLogins, listStaffAvailability, listStaffDocuments, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { fmtDate, fmtDateTime, fullName } from "@/lib/format";
import { DeleteDocument, DocumentForm, LoginPanel } from "./panels";
import { DocumentTextChip } from "@/components/document-text-chip";
import { PersonnelFile } from "./personnel-file";
import { StaffAvailabilityButton } from "./availability-panel";
import { ManageAssignments } from "./manage-assignments";
import { AvailabilityList } from "@/components/availability-cards";
import { isoDay } from "@/lib/format";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { buildPersonnelFile, personnelSummary } from "@/lib/personnel-file";
import { STAFF_DOCUMENT_CATEGORIES } from "@/lib/staff-documents";
import { SsnField } from "./ssn";
import { AboutSection } from "./about";
import { VisitsTable } from "../../visits/visits-table";
import { buildVisitTable } from "@/lib/visit-table";
import { Plain, Rows } from "./plain";


export default async function StaffPage({ params, searchParams }: PageProps<"/staff/[id]">) {
  const user = await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const sp = await searchParams;
  // A tab that no longer exists (the old Clients tab, bookmarked) lands on Overview, not on nothing.
  const KNOWN_TABS = ["overview", "compliance", "visits", "login"];
  const tab = typeof sp.tab === "string" && KNOWN_TABS.includes(sp.tab) ? sp.tab : "overview";
  const clientFilter = typeof sp.client === "string" ? sp.client : "";
  const codeFilter = typeof sp.code === "string" ? sp.code : "";
  const s = await getStaff(id);
  if (!s) notFound();
  const [login, assignments, credentials, visits, people, documents] = await Promise.all([getUserForStaff(id), listAssignmentsForStaff(id), listCredentials(id), listVisits({ staffId: id, limit: 25, personId: clientFilter || undefined, serviceCode: codeFilter || undefined }), listPeople(), listStaffDocuments(id)]);
  // The filter options come from everything this person has ever written, not from the filtered page.
  const vt = tab === "visits" ? await buildVisitTable({ sp, staffId: id }) : null;
  const personnel = buildPersonnelFile(s.hireDate, credentials, documents);
  const paper = personnelSummary(personnel);
  const today = isoDay(0);
  const nextDue = personnel.filter((i) => i.required && i.due && i.due >= today).sort((a, b) => (a.due! < b.due! ? -1 : 1))[0];
  const overdue = personnel.filter((i) => i.required && (i.status === "overdue" || i.status === "missing" || i.status === "undocumented"));
  const recentLogins = login ? await listRecentLogins(login.id) : [];
  const availability = await listStaffAvailability(id);
  const schedule = {
    startDate: availability[0]?.startDate ?? isoDay(0),
    endDate: availability[0]?.endDate ?? "",
    timeZone: availability[0]?.timeZone ?? "America/Chicago",
    days: [0, 1, 2, 3, 4, 5, 6].map((d) => availability.filter((a) => a.weekday === d).map((a) => ({ start: a.startTime, end: a.endTime }))),
  };
  const categoryLabel = (v: string) => STAFF_DOCUMENT_CATEGORIES.find((c) => c.value === v)?.label ?? v;
  const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const items = evaluateCompliance(s.hireDate, credentials);
  const summary = complianceSummary(items);
  const activeAssignments = assignments.filter((a) => a.assignment.active);
  const assignedIds = new Set(activeAssignments.map((a) => a.person.id));
  const unassigned = people.filter((p) => p.status !== "discharged" && !assignedIds.has(p.id));
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "compliance", label: "Compliance", count: summary.overdue + summary.dueSoon || undefined },
    { key: "visits", label: "Notes", count: visits.length },
    ...(user.role === "admin" ? [{ key: "login", label: "Login" }] : []),
  ];

  return (
    <div>
      <RecordHeader
        crumbs={<><Crumb href="/staff">Team</Crumb><CrumbSep /><Crumb>{s.firstName} {s.lastName}</Crumb></>}
        avatar={<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{s.firstName[0]}{s.lastName[0]}</span>}
        title={`${s.firstName} ${s.lastName}`}
        chips={<><Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "inactive"}</Badge>{summary.overdue > 0 ? <Badge tone="danger">{summary.overdue} overdue</Badge> : summary.dueSoon > 0 ? <Badge tone="warn">{summary.dueSoon} due soon</Badge> : null}</>}
        subtitle={<><span>{s.title}</span><span className="text-hint">·</span><span>Hired {fmtDate(s.hireDate)}</span><span className="text-hint">·</span><span className="tabular-nums">{s.npi ? `NPI ${s.npi}` : `UMPI ${s.umpi}`}</span>{login && <><span className="text-hint">·</span><span>{login.email}</span></>}</>}
        actions={user.role === "admin" && <LinkButton href={`/staff/${id}/edit`} variant="outline">Edit</LinkButton>}
      />
      <Tabs tabs={tabs} current={tab} base={`/staff/${id}`} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Two columns so the whole record fits one screen without scrolling (Sept 18, 2026, user's request). */}
          <div>
          <AboutSection staffId={id} canEdit={user.role === "admin"} ssn={user.role === "admin" ? <SsnField staffId={id} last4={s.ssnLast4} canReveal /> : undefined} v={{ firstName: s.firstName, lastName: s.lastName, dob: s.dob, gender: s.gender, npi: s.npi, umpi: s.umpi, active: s.active, title: s.title, hireDate: s.hireDate, phone: s.phone, email: s.email, address1: s.address1, address2: s.address2, city: s.city, state: s.state, zip: s.zip, payRate: s.payRate }} />
          <Plain title="Clients" action={<ManageAssignments staffId={id} assignments={assignments.map((a) => ({ id: a.assignment.id, active: a.assignment.active, orientedOn: a.assignment.orientedOn, personId: a.person.id, name: fullName(a.person), pmi: a.person.pmi, status: a.person.status }))} candidates={unassigned.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))} />}>
            {activeAssignments.length === 0 ? <p className="text-[15px] text-muted-foreground">No clients yet.</p> : (
              <ul className="space-y-1.5 text-[15px]">{activeAssignments.map((a) => <li key={a.assignment.id}><Link href={`/clients/${a.person.id}`} className="font-medium text-text-strong hover:underline">{fullName(a.person)}</Link>{a.assignment.orientedOn ? <span className="text-muted-foreground"> · since {fmtDate(a.assignment.orientedOn)}</span> : <span className="text-warn"> · orientation pending</span>}</li>)}</ul>
            )}
          </Plain>
          </div>
          <div>
          <Plain title="Works" action={user.role !== "dsp" && <StaffAvailabilityButton staffId={id} schedule={schedule} hasAny={availability.length > 0} />}>
            {availability.length > 0 ? <AvailabilityList rows={availability} /> : <p className="text-[14.5px] text-muted-foreground">No days recorded yet, so scheduling does not know when {s.firstName} is free.</p>}
          </Plain>
          <Plain title="Paperwork" action={<Link href={`/staff/${id}?tab=compliance`} className="text-[13.5px] font-medium text-primary hover:underline">See all</Link>}>
            <p className="text-[15px]">
              <span className={`mr-2 inline-block size-2 rounded-full align-[1px] ${overdue.length ? "bg-danger" : "bg-ok"}`} aria-hidden />
              {overdue.length ? <>{overdue.length} of {paper.total} items need attention: {overdue.slice(0, 3).map((i) => i.label.toLowerCase()).join(", ")}{overdue.length > 3 ? "…" : ""}.</> : <>Everything is on file.</>}
              {nextDue && <> Next thing due: {nextDue.label.toLowerCase()}, <span className="font-medium text-text-strong">{fmtDate(nextDue.due)}</span>.</>}
            </p>
          </Plain>
          </div>
        </div>
      )}

      {tab === "compliance" && (
        <div className="space-y-4">
          <PersonnelFile staffId={id} items={personnel} aiReady={aiConfigured()} staffName={`${s.firstName} ${s.lastName}`} documents={documents.map((d) => ({ id: d.id, title: d.title, fileName: d.fileName, credentialId: d.credentialId, createdAt: d.createdAt.toISOString().slice(0, 10) }))} />
          <Card title="Documents" description="The rest of the personnel file: employment and tax forms, policy acknowledgments, anything not tied to one item above">
            {documents.filter((d) => !d.credentialId).length === 0 ? <Empty icon="doc" title="No other documents filed" /> : (
              <Table><Thead><Th>Document</Th><Th>Category</Th><Th>Filed</Th><Th align="right">Size</Th><Th /></Thead><tbody>{documents.filter((d) => !d.credentialId).map((d) => <Tr key={d.id}><Td strong><a href={`/staff/${id}/documents/${d.id}`} target="_blank" rel="noopener" className="hover:underline">{d.title}</a><div className="text-[13px] font-normal text-muted-foreground">{d.fileName}{d.note ? ` · ${d.note}` : ""}</div></Td><Td className="text-muted-foreground">{categoryLabel(d.category)}</Td><Td className="text-muted-foreground">{fmtDate(d.createdAt.toISOString().slice(0, 10))}</Td><Td align="right" className="ident text-muted-foreground">{fmtSize(d.sizeBytes)}</Td><Td align="right"><span className="inline-flex items-center gap-2"><DocumentTextChip kind="staff" id={d.id} ownerId={id} hasText={Boolean(d.extractedText)} summary={d.extractionSummary} aiReady={aiConfigured()} /><DeleteDocument id={d.id} staffId={id} /></span></Td></Tr>)}</tbody></Table>
            )}
            <div className="border-t border-line-soft bg-sidebar px-5 py-4"><div className="mb-3 text-[13px] font-medium text-text-strong">File a document</div><DocumentForm staffId={id} categories={[...STAFF_DOCUMENT_CATEGORIES]} /></div>
          </Card>
        </div>
      )}

      {tab === "visits" && vt && (
        <div>
          <VisitsTable search={false} rows={vt.rows} filters={vt.filters} options={vt.options} presets={vt.presets} base={{ path: `/staff/${id}`, keep: { tab: "visits" } }} exportCsv={user.role !== "dsp" ? `/reports/visits.csv?${vt.range.param}&staff=${id}` : undefined} exportPdf={user.role !== "dsp" ? `/reports/visits.pdf?${vt.range.param}&staff=${id}` : undefined} />
        </div>
      )}

      {tab === "login" && user.role === "admin" && (
        <div className="max-w-3xl">
          {login ? (<>
            <Plain title="Login">
              <Rows rows={[
                ["Email", login.email],
                ["Can do", login.role === "admin" ? <>Everything <span className="text-muted-foreground">(admin, including pay rates)</span></> : login.role === "supervisor" ? <>Clients and notes <span className="text-muted-foreground">(supervisor)</span></> : <>Their own clients and notes <span className="text-muted-foreground">(caregiver)</span></>],
                ["Status", <Badge key="st" tone={login.active ? "ok" : "neutral"}>{login.active ? "Active" : "Turned off"}</Badge>],
              ]} />
            </Plain>
            <Plain title="Recent sign-ins">
              {recentLogins.length === 0 ? <p className="text-[15px] text-muted-foreground">Has not signed in yet.</p> : <ul className="space-y-1 text-[15px]">{recentLogins.map((r, i) => <li key={i}>{fmtDateTime(r.at)}</li>)}</ul>}
            </Plain>
            <Plain title="Change">
              <div className="max-w-md"><LoginPanel staffId={id} login={login} defaultEmail={s.email ?? ""} isSelf={login?.id === user.id} /></div>
            </Plain>
          </>) : (
            <Plain title="Login"><div className="max-w-md"><LoginPanel staffId={id} login={login} defaultEmail={s.email ?? ""} isSelf={false} /></div></Plain>
          )}
        </div>
      )}
    </div>
  );
}

