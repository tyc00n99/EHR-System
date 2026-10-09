import Link from "next/link";
import { Badge, PageHeader, StatTile } from "@/components/kit";
import { getPayRules } from "@/db/pay-queries";
import { listVisits, staffPeriodTotals } from "@/db/queries";
import { fmtDateTime } from "@/lib/format";
import { currentPayPeriod } from "@/lib/pay-period";
import { VisitSheet } from "./record/visit-sheet";

/**
 * What a caregiver sees instead of the notes table (user, Oct 8, 2026): how much service they
 * delivered, and only the notes that still need something from them. The archive of signed notes
 * is deliberately not browsable here — a past note is exactly what could be pasted into a new one.
 */
export async function MySessions({ staffId, openVisit }: { staffId: string; openVisit: string | null }) {
  const period = currentPayPeriod(await getPayRules());
  const [totals, recent] = await Promise.all([
    staffPeriodTotals(staffId, period.start, period.end),
    listVisits({ staffId, limit: 100 }),
  ]);
  const needsAction = recent.filter(({ visit: v }) =>
    v.status === "in_progress" || v.returnedAt != null || (v.status === "completed" && !v.clientSignedAt),
  );
  return (
    <div className="mx-auto w-full max-w-2xl">
      {openVisit && <VisitSheet id={openVisit} />}
      <PageHeader title="My sessions" meta={<span className="text-[13.5px] text-muted-foreground">{period.label}</span>} />
      <div className="mb-6 grid grid-cols-3 gap-2">
        <StatTile label="Sessions" value={totals.visits} note="this pay period" />
        <StatTile label="Hours" value={Math.round(totals.minutes / 6) / 10} note="of service" />
        <StatTile label="Units" value={totals.units} note="15 minutes each" />
      </div>
      <h3 className="mb-2 text-[15px]">Need something from you</h3>
      {needsAction.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-muted-foreground">Nothing waiting. Finished notes live with the office.</p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-card">
          {needsAction.map(({ visit: v, personFirst, personLast }) => (
            <li key={v.id}>
              <Link href={`/visits?visit=${v.id}`} scroll={false} className="flex items-center gap-3 px-4 py-3 hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-text-strong">{personFirst} {personLast}</span>
                  <span className="block text-[13px] text-muted-foreground">{fmtDateTime(v.clockInAt)}</span>
                </span>
                {v.status === "in_progress" ? <Badge tone="accent">in progress</Badge>
                  : v.returnedAt ? <Badge tone="warn">returned</Badge>
                  : <Badge tone="danger">awaiting signature</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[13px] text-muted-foreground">Past signed notes are not shown here. Every note is written fresh during the visit.</p>
    </div>
  );
}
