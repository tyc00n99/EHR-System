import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { listClockableAgreements, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { ManualVisitForm } from "./manual-form";
import { labelForCode } from "@/lib/hcpcs";

export const metadata = { title: "Manual note entry" };

export default async function NewVisitPage() {
  await requireUser(["admin", "supervisor"]);
  const [agreements, staff] = await Promise.all([listClockableAgreements(), listStaff(true)]);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/visits">Notes</Crumb><CrumbSep /><Crumb>Manual entry</Crumb></>} title="Enter a note manually" meta={<span>For visits not captured with a live clock-in. The reason travels with the visit to the aggregator.</span>} />
      <ManualVisitForm
        agreements={agreements.map((a) => ({ id: a.agreement.id, personId: a.person.id, personName: `${a.person.lastName}, ${a.person.firstName}`, label: `${a.agreement.agreementNumber} · ${labelForCode(a.agreement.serviceCode, a.agreement.modifiers)} · ${a.agreement.serviceCode}${a.agreement.modifiers.length ? " " + a.agreement.modifiers.join(" ") : ""}` }))}
        staff={staff.map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` }))}
      />
    </div>
  );
}
