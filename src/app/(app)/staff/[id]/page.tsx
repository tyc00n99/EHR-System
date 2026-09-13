import Link from "next/link";
import { Rule } from "@/components/rule";
import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, Empty, LinkButton, Properties, RecordHeader, Table, Tabs, Td, Th, Thead, Tr, type Tone } from "@/components/kit";
import { getStaff, getUserForStaff, listAssignmentsForStaff, listCredentials, listPeople, listStaffDocuments, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance, type ComplianceStatus } from "@/lib/credentials";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/format";
import { GENDERS } from "@/lib/validation";
import { AssignmentPanel, DeleteDocument, DocumentForm, LoginPanel } from "./panels";
import { PersonnelFile } from "./personnel-file";
import { NoteRows } from "./note-rows";
import { NoteFilters } from "./note-filters";
import { labelForCode } from "@/lib/hcpcs";
import { buildPersonnelFile } from "@/lib/personnel-file";
import { STAFF_DOCUMENT_CATEGORIES } from "@/lib/staff-documents";
import { SsnField } from "./ssn";

const STATUS_TONE: Record<ComplianceStatus, Tone> = { ok: "ok", due_soon: "warn", overdue: "danger", missing: "danger" };
const STATUS_LABEL: Record<ComplianceStatus, string> = { ok: "current", due_soon: "due soon", overdue: "overdue", missing: "missing" };

export default async function StaffPage({ params, searchParams }: PageProps<"/staff/[id]">) {
  const user = await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const clientFilter = typeof sp.client === "string" ? sp.client : "";
  const codeFilter = typeof sp.code === "string" ? sp.code : "";
  const s = await getStaff(id);
  if (!s) notFound();
  const [login, assignments, credentials, visits, people, documents] = await Promise.all([getUserForStaff(id), listAssignmentsForStaff(id), listCredentials(id), listVisits({ staffId: id, limit: 25, personId: clientFilter || undefined, serviceCode: codeFilter || undefined }), listPeople(), listStaffDocuments(id)]);
  // The filter options come from everything this person has ever written, not from the filtered page.
  const allVisits = tab === "visits" ? await listVisits({ staffId: id, limit: 1000 }) : [];
  const noteClients = [...new Map(allVisits.map((r) => [r.visit.personId, `${r.personFirst} ${r.personLast}`])).entries()].map(([pid, name]) => ({ id: pid, name })).sort((a, b) => a.name.localeCompare(b.name));
  const noteCodes = [...new Set(allVisits.map((r) => r.visit.serviceCode))].sort().map((c) => ({ code: c, label: labelForCode(c, []) }));
  const personnel = buildPersonnelFile(s.hireDate, credentials, documents);
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
    { key: "clients", label: "Clients", count: activeAssignments.length },
    { key: "visits", label: "Notes", count: visits.length },
    ...(user.role === "admin" ? [{ key: "login", label: "Login" }] : []),
  ];

  return (
    <div>
      <RecordHeader
        crumbs={<><Crumb href="/staff">Staff</Crumb><CrumbSep /><Crumb>{s.firstName} {s.lastName}</Crumb></>}
        avatar={<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{s.firstName[0]}{s.lastName[0]}</span>}
        title={`${s.firstName} ${s.lastName}`}
        chips={<><Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "inactive"}</Badge>{summary.overdue > 0 ? <Badge tone="danger">{summary.overdue} overdue</Badge> : summary.dueSoon > 0 ? <Badge tone="warn">{summary.dueSoon} due soon</Badge> : <Badge tone="ok">compliant</Badge>}</>}
        subtitle={<><span>{s.title}</span><span className="text-hint">·</span><span>Hired {fmtDate(s.hireDate)}</span><span className="text-hint">·</span><span className="tabular-nums">{s.npi ? `NPI ${s.npi}` : `UMPI ${s.umpi}`}</span>{login && <><span className="text-hint">·</span><span>{login.email}</span></>}</>}
        actions={user.role === "admin" && <LinkButton href={`/staff/${id}/edit`} variant="outline">Edit</LinkButton>}
      />
      <Tabs tabs={tabs} current={tab} base={`/staff/${id}`} />

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <Card title="Personnel file" padded>
            <Properties labelWidth={104} items={[
              { icon: "calendar", label: "Born", value: fmtDate(s.dob) },
              { icon: "user", label: "Gender", value: GENDERS.find((g) => g[0] === s.gender)?.[1] ?? s.gender },
              { icon: "id", label: "SSN", value: <SsnField staffId={id} last4={s.ssnLast4} canReveal={user.role === "admin"} /> },
              { icon: "pin", label: "Address", value: [s.address1, s.address2, `${s.city}, ${s.state} ${s.zip}`].filter(Boolean).join(", ") },
              { icon: "phone", label: "Phone", value: s.phone },
              { icon: "mail", label: "Email", value: s.email },
              { icon: "calendar", label: "Hired", value: fmtDate(s.hireDate) },
              ...(user.role === "admin" ? [{ icon: "units" as const, label: "Pay rate", value: <span className="tabular-nums">{fmtMoney(s.payRate)} / hour</span> }] : []),
            ]} />
          </Card>
          <div className="space-y-4">
            <Card title="Compliance at a glance" actions={<Link href={`/staff/${id}?tab=compliance`} className="text-[13px] font-medium text-primary hover:underline">Details</Link>}>
              <ul className="grid gap-px sm:grid-cols-2">{items.map((i) => <li key={i.type} className="flex items-center justify-between gap-3 px-5 py-2.5"><span className="truncate text-[13px]">{i.label}</span><Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge></li>)}</ul>
            </Card>
            <Card title="Assigned clients" actions={<Link href={`/staff/${id}?tab=clients`} className="text-[13px] font-medium text-primary hover:underline">Manage</Link>}>
              {activeAssignments.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No clients assigned.</p> : <ul className="divide-y divide-line-soft">{activeAssignments.map((a) => <li key={a.assignment.id} className="flex items-center justify-between px-5 py-2.5"><Link href={`/clients/${a.person.id}`} className="font-medium text-text-strong hover:underline">{fullName(a.person)}</Link>{a.assignment.orientedOn ? <Badge tone="ok">oriented</Badge> : <Badge tone="warn">orientation pending</Badge>}</li>)}</ul>}
            </Card>
          </div>
        </div>
      )}

      {tab === "compliance" && (
        <div className="space-y-4">
          <PersonnelFile staffId={id} items={personnel} documents={documents.map((d) => ({ id: d.id, title: d.title, fileName: d.fileName, credentialId: d.credentialId, createdAt: d.createdAt.toISOString().slice(0, 10) }))} />
          <Card title="Documents" description="The rest of the personnel file: employment and tax forms, policy acknowledgments, anything not tied to one item above">
            {documents.filter((d) => !d.credentialId).length === 0 ? <Empty icon="doc" title="No other documents filed" /> : (
              <Table><Thead><Th>Document</Th><Th>Category</Th><Th>Filed</Th><Th align="right">Size</Th><Th /></Thead><tbody>{documents.filter((d) => !d.credentialId).map((d) => <Tr key={d.id}><Td strong><a href={`/staff/${id}/documents/${d.id}`} target="_blank" rel="noopener" className="hover:underline">{d.title}</a><div className="text-[13px] font-normal text-muted-foreground">{d.fileName}{d.note ? ` · ${d.note}` : ""}</div></Td><Td className="text-muted-foreground">{categoryLabel(d.category)}</Td><Td className="text-muted-foreground">{fmtDate(d.createdAt.toISOString().slice(0, 10))}</Td><Td align="right" className="ident text-muted-foreground">{fmtSize(d.sizeBytes)}</Td><Td align="right"><DeleteDocument id={d.id} staffId={id} /></Td></Tr>)}</tbody></Table>
            )}
            <div className="border-t border-line-soft bg-sidebar px-5 py-4"><div className="mb-3 text-[13px] font-medium text-text-strong">File a document</div><DocumentForm staffId={id} categories={[...STAFF_DOCUMENT_CATEGORIES]} /></div>
          </Card>
        </div>
      )}

      {tab === "clients" && (
        <Card title="Assigned clients" titleAfter={<Rule name="orientation" />} description="Caregivers can only clock in with people assigned to them, after orientation to that person.">
          <AssignmentPanel staffId={id} assignments={assignments.map((a) => ({ id: a.assignment.id, active: a.assignment.active, orientedOn: a.assignment.orientedOn, personId: a.person.id, name: fullName(a.person), pmi: a.person.pmi, status: a.person.status }))} candidates={unassigned.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))} />
        </Card>
      )}

      {tab === "visits" && (
        <Card title="Recent notes" actions={<div className="flex items-center gap-3"><NoteFilters staffId={id} client={clientFilter} code={codeFilter} clients={noteClients} codes={noteCodes} /><Link href={`/visits?staff=${id}`} className="text-[13px] font-medium text-primary hover:underline">All notes</Link></div>}>
          {visits.length === 0 ? <Empty icon="clock" title={clientFilter || codeFilter ? "No notes match those filters" : "No notes yet"} /> : (
            <Table><Thead><Th>Clock in</Th><Th>Client</Th><Th>Service</Th><Th align="right">Units</Th><Th>Status</Th></Thead><NoteRows staffId={id} rows={visits.map(({ visit: v, personFirst, personLast }) => ({ id: v.id, when: fmtDateTime(v.clockInAt), client: `${personFirst} ${personLast}`, personId: v.personId, code: v.serviceCode, units: v.units, status: v.status, unsigned: v.status === "completed" && !v.clientSignedAt }))} /></Table>
          )}
        </Card>
      )}

      {tab === "login" && user.role === "admin" && (
        <div className="max-w-md"><Card title="Login" description="Administrators see everything including pay rates. Supervisors see clients and notes. Caregivers see only the people assigned to them." padded><LoginPanel staffId={id} login={login} defaultEmail={s.email ?? ""} isSelf={login?.id === user.id} /></Card></div>
      )}
    </div>
  );
}
