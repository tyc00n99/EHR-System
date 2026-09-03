import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, Empty, LinkButton, Properties, RecordHeader, Table, Tabs, Td, Th, Thead, Tr, type Tone } from "@/components/kit";
import { getStaff, getUserForStaff, listAssignmentsForStaff, listCredentials, listPeople, listVisits } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { CREDENTIAL_TYPES, complianceSummary, credentialLabel, evaluateCompliance, type ComplianceStatus } from "@/lib/credentials";
import { fmtDate, fmtDateTime, fmtMoney, fullName } from "@/lib/format";
import { GENDERS } from "@/lib/validation";
import { AssignmentPanel, CredentialForm, DeleteCredential, LoginPanel } from "./panels";
import { SsnField } from "./ssn";

const STATUS_TONE: Record<ComplianceStatus, Tone> = { ok: "ok", due_soon: "warn", overdue: "danger", missing: "danger" };
const STATUS_LABEL: Record<ComplianceStatus, string> = { ok: "current", due_soon: "due soon", overdue: "overdue", missing: "missing" };

export default async function StaffPage({ params, searchParams }: PageProps<"/staff/[id]">) {
  const user = await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" ? sp.tab : "overview";
  const s = await getStaff(id);
  if (!s) notFound();
  const [login, assignments, credentials, visits, people] = await Promise.all([getUserForStaff(id), listAssignmentsForStaff(id), listCredentials(id), listVisits({ staffId: id, limit: 25 }), listPeople()]);
  const items = evaluateCompliance(s.hireDate, credentials);
  const summary = complianceSummary(items);
  const activeAssignments = assignments.filter((a) => a.assignment.active);
  const assignedIds = new Set(activeAssignments.map((a) => a.person.id));
  const unassigned = people.filter((p) => p.status !== "discharged" && !assignedIds.has(p.id));
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "compliance", label: "Compliance", count: summary.overdue + summary.dueSoon || undefined },
    { key: "clients", label: "Clients", count: activeAssignments.length },
    { key: "visits", label: "Visits", count: visits.length },
    ...(user.role === "admin" ? [{ key: "login", label: "Login" }] : []),
  ];

  return (
    <div>
      <RecordHeader
        crumbs={<><Crumb href="/staff">Staff</Crumb><CrumbSep /><Crumb>{s.firstName} {s.lastName}</Crumb></>}
        avatar={<span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-nav text-lg font-semibold text-white">{s.firstName[0]}{s.lastName[0]}</span>}
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
          <Card title="Requirements" description="What 245D.09 and chapter 245C require before and during direct support work">
            <ul className="divide-y divide-line-soft">{items.map((i) => <li key={i.type} className="flex items-start gap-3 px-5 py-3"><Badge tone={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge><div className="min-w-0 flex-1"><div className="font-medium text-text-strong">{i.label} {i.cite && <span className="text-xs font-normal text-muted-foreground">{i.cite}</span>}</div><div className="text-[13px] text-muted-foreground">{i.detail}</div></div>{i.due && <span className={`shrink-0 text-[13px] tabular-nums ${i.status === "overdue" ? "text-danger" : "text-muted-foreground"}`}>{fmtDate(i.due)}</span>}</li>)}</ul>
          </Card>
          <Card title="Training and credentials" description="Add each certificate, clearance, or training as it is completed">
            {credentials.length === 0 ? <Empty icon="doc" title="Nothing recorded yet" /> : (
              <Table><Thead><Th>Item</Th><Th>Completed</Th><Th>Expires</Th><Th align="right">Hours</Th><Th>Note</Th><Th /></Thead><tbody>{credentials.map((c) => <Tr key={c.id}><Td strong>{c.title}<div className="text-xs font-normal text-muted-foreground">{credentialLabel(c.type)}</div></Td><Td className="text-muted-foreground">{fmtDate(c.completedOn)}</Td><Td className="text-muted-foreground">{c.expiresOn ? fmtDate(c.expiresOn) : "—"}</Td><Td align="right">{c.hours ?? ""}</Td><Td wrap className="text-[13px] text-muted-foreground">{c.note}</Td><Td align="right"><DeleteCredential id={c.id} staffId={id} /></Td></Tr>)}</tbody></Table>
            )}
            <div className="border-t border-line-soft bg-sidebar px-5 py-4"><div className="mb-3 text-[13px] font-medium text-text-strong">Record a credential</div><CredentialForm staffId={id} types={CREDENTIAL_TYPES.map((t) => ({ type: t.type, label: t.label }))} /></div>
          </Card>
        </div>
      )}

      {tab === "clients" && (
        <Card title="Assigned clients" description="Caregivers can only clock in with people assigned to them, after orientation to that person (245D.09, subd. 4a).">
          <AssignmentPanel staffId={id} assignments={assignments.map((a) => ({ id: a.assignment.id, active: a.assignment.active, orientedOn: a.assignment.orientedOn, personId: a.person.id, name: fullName(a.person), pmi: a.person.pmi, status: a.person.status }))} candidates={unassigned.map((p) => ({ id: p.id, name: `${p.lastName}, ${p.firstName}` }))} />
        </Card>
      )}

      {tab === "visits" && (
        <Card title="Recent visits" actions={<Link href="/visits" className="text-[13px] font-medium text-primary hover:underline">All visits</Link>}>
          {visits.length === 0 ? <Empty icon="clock" title="No visits yet" /> : (
            <Table><Thead><Th>Clock in</Th><Th>Client</Th><Th>Service</Th><Th align="right">Units</Th><Th>Status</Th></Thead><tbody>{visits.map(({ visit: v, personFirst, personLast }) => <Tr key={v.id}><Td strong><Link href={`/visits/${v.id}`} className="hover:underline">{fmtDateTime(v.clockInAt)}</Link></Td><Td>{personFirst} {personLast}</Td><Td className="tabular-nums">{v.serviceCode}</Td><Td align="right">{v.units}</Td><Td><span className="flex gap-1"><Badge tone={v.status === "completed" ? "ok" : v.status === "void" ? "neutral" : "accent"}>{v.status.replace("_", " ")}</Badge>{v.status === "completed" && !v.clientSignedAt && <Badge tone="danger">unsigned</Badge>}</span></Td></Tr>)}</tbody></Table>
          )}
        </Card>
      )}

      {tab === "login" && user.role === "admin" && (
        <div className="max-w-md"><Card title="Login" description="Access to this system. Role controls what they can see." padded><LoginPanel staffId={id} login={login} defaultEmail={s.email ?? ""} isSelf={login?.id === user.id} /></Card></div>
      )}
    </div>
  );
}
