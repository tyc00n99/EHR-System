import Link from "next/link";
import { Card, Crumb, CrumbSep, LinkButton, PageHeader } from "@/components/kit";
import { VisitsTable, type VisitRow } from "./visits-table";
import { VisitSheet } from "./record/visit-sheet";
import { getPerson, listVisits } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDateTime, fullName } from "@/lib/format";
import { currentPayPeriod, payPeriodByIndex, payPeriodFromParam } from "@/lib/pay-period";
import { minutesBetween } from "@/lib/units";

export const metadata = { title: "Visits" };


export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const user = await requireUser();
  const sp = await searchParams;
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined);
  const isCurrent = period.index === currentPayPeriod().index;
  const prev = payPeriodByIndex(period.index - 1), next = payPeriodByIndex(period.index + 1);
  const person = personId ? await getPerson(personId) : null;
  const all = await listVisits({ personId, staffId: user.role === "dsp" ? (user.staffId ?? undefined) : undefined, from: period.start, to: period.end, limit: 1000 });
  const completed = all.filter((r) => r.visit.status === "completed");
  const units = completed.reduce((n, r) => n + r.visit.units, 0);
  const minutes = completed.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0);
  const periodHref = (p: { startDate: string }) => `/visits?period=${p.startDate}${personId ? `&person=${personId}` : ""}`;
  const title = person ? `Visits with ${fullName(person)}` : user.role === "dsp" ? "My visits" : "Visits";

  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  return (
    <div>
      {openVisit && <VisitSheet id={openVisit} />}
      <PageHeader
        eyebrow={person && <><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${person.id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>Visits</Crumb></>}
        title={title}
        actions={can(user, "edit_visits") && <LinkButton href="/visits/new" variant="outline">Enter a visit manually</LinkButton>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={periodHref(prev)} aria-label="Previous pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="min-w-56">
          <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {period.label}</span></div>
        </div>
        <Link href={periodHref(next)} aria-label="Next pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        {!isCurrent && <Link href={periodHref(currentPayPeriod())} className="text-[13px] text-primary hover:underline">Jump to current</Link>}
        <div className="ml-auto flex gap-5 text-[13px] tabular-nums text-muted-foreground">
          <span><span className="font-medium text-text-strong">{all.length}</span> visits</span>
          <span><span className="font-medium text-text-strong">{units}</span> units</span>
          <span><span className="font-medium text-text-strong">{Math.round(minutes / 6) / 10}</span> hours</span>
          {all.some((r) => r.visit.manualEntry) && <span><span className="font-medium text-warn">{all.filter((r) => r.visit.manualEntry).length}</span> manual</span>}
          {all.some((r) => r.visit.status === "completed" && !r.visit.clientSignedAt) && <span><span className="font-medium text-danger">{all.filter((r) => r.visit.status === "completed" && !r.visit.clientSignedAt).length}</span> unsigned</span>}
        </div>
      </div>

      <Card>
        <VisitsTable rows={all.map(({ visit: v, personFirst, personLast, staffFirst, staffLast, editCount }): VisitRow => ({ id: v.id, clockIn: fmtDateTime(v.clockInAt), clockInIso: v.clockInAt.toISOString(), minutes: v.clockOutAt ? minutesBetween(v.clockInAt, v.clockOutAt) : null, client: `${personFirst} ${personLast}`, personId: v.personId, staff: `${staffFirst} ${staffLast}`, service: `${v.serviceCode}${v.modifiers.length ? " " + v.modifiers.join(" ") : ""}`, units: v.units, status: v.status, manual: v.manualEntry, edits: editCount, signed: Boolean(v.clientSignedAt), evv: v.evvStatus }))} exportHref={can(user, "edit_visits") ? `/reports/visits.csv?period=${period.startDate}` : undefined} />
      </Card>
    </div>
  );
}
