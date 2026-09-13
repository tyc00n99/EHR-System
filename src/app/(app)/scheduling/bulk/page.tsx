import { listPeople, listShifts, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDateNum, fromLocalInput } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { chicagoDate } from "@/lib/pay-period";
import { listCancellationReasons } from "../actions";
import { BulkForm, type BulkEvent } from "./bulk-form";

export const metadata = { title: "Bulk action" };

const addDays = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default async function BulkActionPage() {
  await requireUser(["admin", "supervisor"]);
  const today = chicagoDate(new Date());
  // A quarter either side is the window a bulk cancel realistically reaches over.
  const [rows, people, staff, reasons] = await Promise.all([
    listShifts(fromLocalInput(`${addDays(today, -90)}T00:00`), fromLocalInput(`${addDays(today, 180)}T00:00`)),
    listPeople(),
    listStaff(true),
    listCancellationReasons(),
  ]);

  const events: BulkEvent[] = rows.map((r) => ({
    id: r.shift.id,
    iso: chicagoDate(r.shift.startAt),
    date: fmtDateNum(r.shift.startAt.toISOString()),
    staff: `${r.staffFirst} ${r.staffLast}`,
    staffId: r.shift.staffId,
    client: `${r.personFirst} ${r.personLast}`,
    personId: r.shift.personId,
    type: labelForCode(r.serviceCode, r.modifiers),
    status: r.shift.status.replace("_", " "),
    location: "Home",
  }));

  return (
    <BulkForm
      events={events}
      clients={people.filter((p) => p.status !== "discharged").map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))}
      staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))}
      reasons={reasons.filter((r) => r.active).map((r) => ({ id: r.id, label: r.label }))}
    />
  );
}
