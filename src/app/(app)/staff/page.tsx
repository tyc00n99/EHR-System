import { Card, PageHeader } from "@/components/kit";
import { getDb, schema } from "@/db";
import { listAllCredentials, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { fmtDate } from "@/lib/format";
import { StaffTable, type StaffRow } from "./staff-table";

export const metadata = { title: "Staff" };

export default async function StaffPage() {
  const user = await requireUser(["admin", "supervisor"]);
  const [all, creds] = await Promise.all([listStaff(), listAllCredentials()]);
  const db = await getDb();
  const assignments = await db.select({ staffId: schema.assignments.staffId, active: schema.assignments.active }).from(schema.assignments);
  const rows: StaffRow[] = all.map((s) => {
    const summary = complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? []));
    return { id: s.id, name: `${s.lastName}, ${s.firstName}`, title: s.title, overdue: summary.overdue, dueSoon: summary.dueSoon, renderingId: s.npi ? `NPI ${s.npi}` : `UMPI ${s.umpi}`, hired: fmtDate(s.hireDate), contact: [s.email, s.phone].filter(Boolean).join(" · "), active: s.active, clients: assignments.filter((a) => a.staffId === s.id && a.active).length };
  });
  return (
    <div>
      <PageHeader title="Staff" meta={<span>{rows.filter((r) => r.active).length} active caregivers and supervisors · {rows.filter((r) => r.overdue > 0).length} out of compliance</span>} />
      <Card><StaffTable rows={rows} admin={user.role === "admin"} /></Card>
    </div>
  );
}
