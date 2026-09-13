import { listClockableAgreements, listPeople, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { chicagoDate } from "@/lib/pay-period";
import { EventForm, type FormAgreement } from "./event-form";

export const metadata = { title: "Create event" };

export default async function NewEventPage({ searchParams }: PageProps<"/scheduling/new">) {
  await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : chicagoDate(new Date());

  const [people, staff, agreements] = await Promise.all([listPeople(), listStaff(true), listClockableAgreements()]);

  const forms: FormAgreement[] = agreements.map((a) => ({
    id: a.agreement.id,
    personId: a.person.id,
    label: `${labelForCode(a.agreement.serviceCode, a.agreement.modifiers)} · ${a.agreement.serviceCode}${a.agreement.modifiers.length ? " " + a.agreement.modifiers.join(" ") : ""}`,
    dates: `${fmtDate(a.agreement.startDate)} – ${fmtDate(a.agreement.endDate)}`,
  }));

  return (
    <EventForm
      clients={people.filter((p) => p.status !== "discharged").map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))}
      staff={staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}` }))}
      agreements={forms}
      locations={[]}
      defaultDate={date}
    />
  );
}
