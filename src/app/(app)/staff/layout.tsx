import type { ReactNode } from "react";
import { listAllCredentials, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { TeamRail, type RailMember } from "./team-rail";

/**
 * Every screen under Team keeps the roster pinned on the left, exactly as Clients keeps the
 * caseload: moving between people is a click, not a trip back through a list. Hidden on phones.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const user = await requireUser(["admin", "supervisor"]);
  const [all, creds] = await Promise.all([listStaff(), listAllCredentials()]);
  const members: RailMember[] = all.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    title: s.title,
    active: s.active,
    overdue: complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? [])).overdue,
  }));
  return (
    <div className="relative -mx-4 -my-5 flex min-h-0 flex-1 md:-mx-8 md:-my-6">
      <TeamRail members={members} canAdd={user.role === "admin"} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-5 md:px-8 md:py-6">{children}</div>
    </div>
  );
}
