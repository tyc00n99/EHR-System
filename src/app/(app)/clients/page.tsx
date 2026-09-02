import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, Td, Th, Thead, Toolbar, Tr } from "@/components/ui";
import { listAssignmentsForStaff, listPeople } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDate, fullName } from "@/lib/format";

export const metadata = { title: "Clients" };

const tone = { active: "ok", intake: "accent", discharged: "neutral" } as const;

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const status = typeof sp.status === "string" ? sp.status : "";
  const manage = can(user, "manage_people");
  const people = user.role === "dsp"
    ? (user.staffId ? (await listAssignmentsForStaff(user.staffId)).filter((a) => a.assignment.active).map((a) => a.person) : [])
    : await listPeople();
  const filtered = people.filter((p) => (!status || p.status === status) && (!q || [p.firstName, p.lastName, p.preferredName, p.pmi, p.county, p.caseManagerName].some((f) => f?.toLowerCase().includes(q))));
  const chip = (key: string, label: string) => ({ key, label, href: `/clients?${new URLSearchParams({ ...(q ? { q } : {}), ...(key ? { status: key } : {}) })}`, active: status === key });
  return (
    <div>
      <PageHeader title={user.role === "dsp" ? "My clients" : "Clients"} meta={<span>{people.length} people served</span>}  />
      <Card>
        <Toolbar action="/clients" q={q} placeholder="Search name, PMI, county, case manager" hidden={status ? { status } : undefined} chips={[chip("", "All"), chip("active", "Active"), chip("intake", "Intake"), chip("discharged", "Discharged")]} count={`${filtered.length} of ${people.length}`}>
          {manage && <LinkButton href="/clients/new" variant="primary">New client</LinkButton>}
        </Toolbar>
        {filtered.length === 0 ? (
          <Empty icon="clients" title={q || status ? "No clients match" : "No clients yet"} action={manage && !q && !status && <LinkButton href="/clients/new" variant="primary">Add the first client</LinkButton>}>{q || status ? "Try a different search or clear the filter." : "Add a person served to start recording service agreements and visits."}</Empty>
        ) : (
          <Table>
            <Thead><Th>Name</Th><Th>PMI #</Th><Th>Waiver</Th><Th>County</Th><Th>Case manager</Th><Th>Service start</Th><Th>Status</Th></Thead>
            <tbody>
              {filtered.map((p) => (
                <Tr key={p.id}>
                  <Td strong><Link href={`/clients/${p.id}`} className="hover:underline">{fullName(p)}</Link></Td>
                  <Td className="tabular-nums">{p.pmi}</Td>
                  <Td>{p.waiverProgram}</Td>
                  <Td>{p.county}</Td>
                  <Td>{p.caseManagerName}</Td>
                  <Td className="text-muted">{fmtDate(p.serviceStartDate) || "—"}</Td>
                  <Td><Badge tone={tone[p.status]}>{p.status}</Badge></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
