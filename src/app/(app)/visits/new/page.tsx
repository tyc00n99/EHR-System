import { Crumb, CrumbSep, Notice, PageHeader } from "@/components/kit";
import { Rule } from "@/components/rule";
import { listClockableAgreements, listStaff } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import { labelForCode } from "@/lib/hcpcs";
import { chicagoDate } from "@/lib/pay-period";
import { manualNoteContext } from "../actions";
import { ManualNoteForm } from "./manual-note-form";

export const metadata = { title: "Manual note entry" };

export default async function NewVisitPage() {
  const user = await requireAbility("edit_visits");
  // Only an administrator or supervisor enters a manual note, and never for a visit they worked (Sept 29, 2026).
  if (user.role !== "admin" && user.role !== "supervisor") {
    return <div className="mx-auto w-full max-w-3xl"><PageHeader title="Enter a note manually" /><Notice tone="warn">Only an administrator or a supervisor can enter a note manually.</Notice></div>;
  }
  const [agreements, staff] = await Promise.all([listClockableAgreements(), listStaff(true)]);
  const today = chicagoDate(new Date());
  const initial = agreements[0] ? await manualNoteContext(agreements[0].agreement.id, today) : null;
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader eyebrow={<><Crumb href="/visits">Notes</Crumb><CrumbSep /><Crumb>Manual entry</Crumb></>} title="Enter a note manually" meta={<span>The whole note on one page, for a visit electronic visit verification did not capture. <Rule name="manual" className="align-middle" /></span>} />
      <ManualNoteForm
        today={today}
        initial={initial && !("error" in initial) ? initial : null}
        agreements={agreements.map((a) => ({ id: a.agreement.id, personId: a.person.id, personName: `${a.person.lastName}, ${a.person.firstName}`, label: `${labelForCode(a.agreement.serviceCode, a.agreement.modifiers)} · ${a.agreement.serviceCode}${a.agreement.modifiers.length ? " " + a.agreement.modifiers.join(" ") : ""} · ${a.agreement.agreementNumber}` }))}
        staff={staff.filter((s) => s.id !== user.staffId).map((s) => ({ id: s.id, name: `${s.lastName}, ${s.firstName}` }))}
      />
    </div>
  );
}
