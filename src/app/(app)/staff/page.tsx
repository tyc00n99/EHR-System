import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader, Table, Td, Th, Thead, Toolbar, Tr } from "@/components/ui";
import { listAllCredentials, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Staff" };

export default async function StaffPage({ searchParams }: PageProps<"/staff">) {
  const user = await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const [all, creds] = await Promise.all([listStaff(), listAllCredentials()]);
  const withSummary = all.map((s) => ({ s, summary: complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? [])) }));
  const rows = withSummary.filter(({ s, summary }) => (filter === "late" ? summary.overdue > 0 : filter === "inactive" ? !s.active : filter === "active" ? s.active : true) && (!q || [s.firstName, s.lastName, s.title, s.email, s.npi, s.umpi].some((f) => f?.toLowerCase().includes(q))));
  const chip = (key: string, label: string) => ({ key, label, href: `/staff?${new URLSearchParams({ ...(q ? { q } : {}), ...(key ? { filter: key } : {}) })}`, active: filter === key });
  const admin = user.role === "admin";
  return (
    <div>
      <PageHeader title="Staff" meta={<span>{all.filter((s) => s.active).length} active caregivers and supervisors</span>} />
      <Card>
        <Toolbar action="/staff" q={q} placeholder="Search name, title, NPI, UMPI" hidden={filter ? { filter } : undefined} chips={[chip("", "All"), chip("active", "Active"), chip("late", "Out of compliance"), chip("inactive", "Inactive")]} count={`${rows.length} of ${all.length}`}>
          {admin && <LinkButton href="/staff/new" variant="primary">New staff member</LinkButton>}
        </Toolbar>
        {rows.length === 0 ? <Empty icon="staff" title={q || filter ? "No staff match" : "No staff yet"} /> : (
          <Table>
            <Thead><Th>Name</Th><Th>Title</Th><Th>Compliance</Th><Th>Rendering ID</Th><Th>Hired</Th><Th>Contact</Th><Th>Status</Th></Thead>
            <tbody>
              {rows.map(({ s, summary }) => {
                return (
                  <Tr key={s.id} muted={!s.active}>
                    <Td strong><Link href={`/staff/${s.id}`} className="hover:underline">{s.lastName}, {s.firstName}</Link></Td>
                    <Td>{s.title}</Td>
                    <Td>{!s.active ? <span className="text-hint">—</span> : summary.overdue > 0 ? <Badge tone="danger">{summary.overdue} overdue</Badge> : summary.dueSoon > 0 ? <Badge tone="warn">{summary.dueSoon} due soon</Badge> : <Badge tone="ok">compliant</Badge>}</Td>
                    <Td className="tabular-nums"><span className="text-muted">{s.npi ? "NPI" : "UMPI"}</span> {s.npi ?? s.umpi}</Td>
                    <Td className="text-muted">{fmtDate(s.hireDate)}</Td>
                    <Td className="text-muted">{[s.email, s.phone].filter(Boolean).join(" · ") || "—"}</Td>
                    <Td><Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "inactive"}</Badge></Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
