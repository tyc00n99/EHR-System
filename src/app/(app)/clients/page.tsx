import { PageHeader } from "@/components/kit";
import { listAssignmentsForStaff, listPeople } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { ClientsTable, type ClientRow } from "./clients-table";

export const metadata = { title: "Clients" };

/**
 * The caseload as a table (Sept 20, 2026). The roster panel that used to sit beside every Clients
 * screen is gone with the sidebar; it still lifts over an open record from the hub's Clients spoke,
 * for switching person without coming back here.
 */
export default async function ClientsPage() {
  const user = await requireUser();
  const people = user.role === "dsp"
    ? (user.staffId ? (await listAssignmentsForStaff(user.staffId)).filter((a) => a.assignment.active).map((a) => a.person) : [])
    : await listPeople();
  const rows: ClientRow[] = people.map((p) => ({
    id: p.id,
    name: fullName(p),
    pmi: p.pmi,
    status: p.status,
    photo: p.photoPath ? `/clients/${p.id}/photo?v=${p.photoUpdatedAt?.getTime() ?? 0}` : null,
  }));
  const title = user.role === "dsp" ? "My clients" : "Clients";
  return (
    <div>
      <PageHeader title={title} meta={<span><span className="font-medium text-text-strong">{rows.length}</span> {rows.length === 1 ? "client" : "clients"}</span>} />
      <ClientsTable rows={rows} canAdd={can(user, "manage_people")} />
    </div>
  );
}
