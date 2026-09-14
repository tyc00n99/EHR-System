import type { ReactNode } from "react";
import { listAssignmentsForStaff, listPeople } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { ClientRail, type RailPerson } from "./client-rail";

/**
 * Every screen under Clients keeps the caseload pinned on the left, so moving between people is a
 * click rather than a round trip through the list. The rail is hidden on phones, where the bottom
 * tab bar and the list itself do the same job in less room.
 */
export default async function ClientsLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const people = user.role === "dsp"
    ? (user.staffId ? (await listAssignmentsForStaff(user.staffId)).filter((a) => a.assignment.active).map((a) => a.person) : [])
    : await listPeople();
  const rail: RailPerson[] = people.map((p) => ({
    id: p.id,
    name: fullName(p),
    pmi: p.pmi,
    status: p.status,
    // One dot, one meaning: this person cannot sign a note yet.
    flagged: p.status === "active" && !p.signatureCodeHash,
    photo: p.photoPath ? `/clients/${p.id}/photo?v=${p.photoUpdatedAt?.getTime() ?? 0}` : null,
  }));
  return (
    <div className="relative -mx-4 -my-5 flex min-h-0 flex-1 md:-mx-8 md:-my-6">
      <ClientRail people={rail} label={user.role === "dsp" ? "My clients" : "Clients"} canAdd={can(user, "manage_people")} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 py-5 md:px-8 md:py-6">{children}</div>
    </div>
  );
}
