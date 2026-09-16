import Link from "next/link";
import { Card, Crumb, CrumbSep, LinkButton, PageHeader } from "@/components/kit";
import { VisitsTable, type VisitRow } from "./visits-table";
import { VisitSheet } from "./record/visit-sheet";
import { getPerson, listVisits } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fmtDateTime, fullName } from "@/lib/format";
import { rangeParamFor, resolveVisitRange, type RangeKind } from "@/lib/visit-range";
import { RangeNav } from "./range-nav";
import { minutesBetween } from "@/lib/units";

export const metadata = { title: "Notes" };


export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const user = await requireUser();
  const sp = await searchParams;
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  // Pay period by default; ?week=, ?month= or ?from=&to= pick another window.
  const range = resolveVisitRange(sp);
  const person = personId ? await getPerson(personId) : null;
  const all = await listVisits({ personId, staffId: user.role === "dsp" ? (user.staffId ?? undefined) : undefined, from: range.start, to: range.end, limit: 1000 });
  const completed = all.filter((r) => r.visit.status === "completed");
  const units = completed.reduce((n, r) => n + r.visit.units, 0);
  const minutes = completed.reduce((n, r) => n + (r.visit.clockOutAt ? minutesBetween(r.visit.clockInAt, r.visit.clockOutAt) : 0), 0);
  const extra = personId ? `person=${personId}` : "";
  const rangeHref = (param: string) => `/visits?${param}${extra ? `&${extra}` : ""}`;
  const kindParams = Object.fromEntries((["period", "week", "month", "custom"] as RangeKind[]).map((k) => [k, rangeParamFor(k, range)])) as Record<RangeKind, string>;
  const title = person ? `Notes for ${fullName(person)}` : user.role === "dsp" ? "My notes" : "Notes";

  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  const state = typeof sp.state === "string" && ["unsigned", "returned", "manual", "open"].includes(sp.state) ? sp.state : undefined;
  const stateLabel: Record<string, string> = { unsigned: "awaiting a signature", returned: "returned for correction", manual: "entered manually", open: "still in progress" };
  return (
    <div>
      {openVisit && <VisitSheet id={openVisit} />}
      {/* One header: the title, then the pay period as the line under it with its pager and the
          period's totals. The section row above already carries the state filters. */}
      <PageHeader
        eyebrow={person && <><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${person.id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>Notes</Crumb></>}
        title={title}
        meta={<>
          <RangeNav range={range} base="/visits" extra={extra} kindParams={kindParams} />
          <span className="tabular-nums"><span className="text-text-strong">{all.length}</span> visits</span>
          <span className="tabular-nums"><span className="text-text-strong">{units}</span> units</span>
          <span className="tabular-nums"><span className="text-text-strong">{Math.round(minutes / 6) / 10}</span> hours</span>
          {all.some((r) => r.visit.manualEntry) && <span className="tabular-nums"><span className="font-medium text-warn">{all.filter((r) => r.visit.manualEntry).length}</span> manual</span>}
          {all.some((r) => r.visit.status === "completed" && !r.visit.clientSignedAt) && <span className="tabular-nums"><span className="font-medium text-danger">{all.filter((r) => r.visit.status === "completed" && !r.visit.clientSignedAt).length}</span> unsigned</span>}
          {state && <span>Showing only notes {stateLabel[state]}. <Link href={rangeHref(range.param)} className="text-primary hover:underline">Show all</Link></span>}
        </>}
        actions={can(user, "edit_visits") && <LinkButton href="/visits/new" variant="outline">Enter a note manually</LinkButton>}
      />

      <Card>
        <VisitsTable rows={all.map(({ visit: v, personFirst, personLast, staffFirst, staffLast, editCount }): VisitRow => ({ id: v.id, clockIn: fmtDateTime(v.clockInAt), clockInIso: v.clockInAt.toISOString(), minutes: v.clockOutAt ? minutesBetween(v.clockInAt, v.clockOutAt) : null, client: `${personFirst} ${personLast}`, personId: v.personId, staff: `${staffFirst} ${staffLast}`, service: v.serviceCode, units: v.units, status: v.status, manual: v.manualEntry, returned: Boolean(v.returnedAt), edits: editCount, signed: Boolean(v.clientSignedAt), evv: v.evvStatus }))} state={state} showChips={user.role === "dsp"} exportCsv={can(user, "edit_visits") ? `/reports/visits.csv?${range.param}` : undefined} exportPdf={can(user, "edit_visits") ? `/reports/visits.pdf?${range.param}` : undefined} />
      </Card>
    </div>
  );
}
