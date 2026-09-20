import { PageHeader } from "@/components/kit";
import { listAllCredentials, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { TeamTable, type TeamRow } from "./team-table";

export const metadata = { title: "Team" };

/**
 * The roster as a table (Sept 20, 2026), with the sidebar's panel gone. The personnel-file column
 * is the same overdue count the roster's red dot carried; the full file is on the record and on
 * /compliance.
 */
export default async function StaffPage() {
  const user = await requireUser(["admin", "supervisor"]);
  const [all, creds] = await Promise.all([listStaff(), listAllCredentials()]);
  const rows: TeamRow[] = all.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    title: s.title,
    active: s.active,
    overdue: complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? [])).overdue,
  }));
  return (
    <div>
      <PageHeader title="Team" meta={<span><span className="font-medium text-text-strong">{rows.length}</span> {rows.length === 1 ? "team member" : "team members"}</span>} />
      <TeamTable rows={rows} canAdd={user.role === "admin"} />
    </div>
  );
}
