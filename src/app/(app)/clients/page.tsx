import { Card, PageHeader } from "@/components/kit";
import { getDb, schema } from "@/db";
import { listAssignmentsForStaff, listPeople } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDate, fullName } from "@/lib/format";
import { ClientsTable, type ClientRow } from "./clients-table";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireUser();
  const manage = can(user, "manage_people");
  const people = user.role === "dsp"
    ? (user.staffId ? (await listAssignmentsForStaff(user.staffId)).filter((a) => a.assignment.active).map((a) => a.person) : [])
    : await listPeople();
  const db = await getDb();
  const teams = await db.select({ personId: schema.assignments.personId, first: schema.staff.firstName, last: schema.staff.lastName, active: schema.assignments.active }).from(schema.assignments).innerJoin(schema.staff, (await import("drizzle-orm")).eq(schema.assignments.staffId, schema.staff.id));
  const teamFor = (id: string) => teams.filter((t) => t.personId === id && t.active).map((t) => `${t.first} ${t.last[0]}.`).join(", ");
  const rows: ClientRow[] = people.map((p) => ({ id: p.id, name: fullName(p), pmi: p.pmi, waiver: p.waiverProgram, county: p.county, caseManager: p.caseManagerName, serviceStart: fmtDate(p.serviceStartDate), status: p.status, hasCode: Boolean(p.signatureCodeHash), team: teamFor(p.id) }));
  return (
    <div>
      <PageHeader title={user.role === "dsp" ? "My clients" : "Clients"} meta={<span>{rows.length} people served · {rows.filter((r) => r.status === "active").length} active</span>} />
      <Card><ClientsTable rows={rows} manage={manage} /></Card>
    </div>
  );
}
