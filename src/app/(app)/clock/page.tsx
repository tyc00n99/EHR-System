import { getOpenVisitForStaff, listClockableAgreements } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { DEFAULT_TASKS, PLACES_OF_SERVICE } from "@/lib/validation";
import { labelForCode } from "@/lib/hcpcs";
import { ClockPanel } from "./clock-panel";

export const metadata = { title: "Clock in / out" };

export default async function ClockPage() {
  const user = await requireUser();
  if (!user.staffId) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-line bg-card p-5">
        <h2>Clock in / out</h2>
        <p className="mt-2 text-[13px] text-muted">Your login is not linked to a staff record, so you cannot record visits. Ask an administrator to link it.</p>
      </div>
    );
  }
  const [open, agreements] = await Promise.all([getOpenVisitForStaff(user.staffId), listClockableAgreements(user.role === "dsp" ? user.staffId : undefined)]);
  return (
    <div className="mx-auto max-w-md">
      <ClockPanel
        open={open ? { id: open.visit.id, personName: `${open.person.firstName} ${open.person.lastName}`, clockInAt: open.visit.clockInAt.toISOString(), tasks: open.visit.tasks, serviceCode: open.visit.serviceCode } : null}
        agreements={agreements.map((a) => ({
          id: a.agreement.id,
          personId: a.person.id,
          personName: `${a.person.firstName} ${a.person.lastName}`,
          label: `${labelForCode(a.agreement.serviceCode, a.agreement.modifiers)} · ${a.agreement.serviceCode}${a.agreement.modifiers.length ? " " + a.agreement.modifiers.join(" ") : ""}`,
          unitsLeft: null,
          oriented: user.role !== "dsp" || Boolean(a.orientedOn),
        }))}
        isDsp={user.role === "dsp"}
        tasks={DEFAULT_TASKS.map((t) => ({ code: t.code, label: t.label }))}
        places={PLACES_OF_SERVICE.map((p) => ({ code: p.code, label: p.label }))}
      />
    </div>
  );
}
