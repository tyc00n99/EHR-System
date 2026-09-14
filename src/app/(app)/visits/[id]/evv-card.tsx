import Link from "next/link";
import { getDb } from "@/db";
import { Badge, Card } from "@/components/kit";
import { BILLING, COMPLIANCE, LIFECYCLE, SUBMISSION, reasonLabel } from "@/evv/labels";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { loadVisit } from "@/evv/visits";
import { fmtDate } from "@/lib/format";

/** The EVV standing of a note, on the note itself. Shared by caregivers and the office. */
export async function EvvCard({ visitId, office }: { visitId: string; office: boolean }) {
  const db = await getDb();
  const ctx = makeCtx(db, await defaultOrganizationId(db), null);
  const v = await loadVisit(ctx, visitId);
  if (!v) return <Card title="Electronic visit verification" padded><p className="text-[13px] text-muted-foreground">This note predates EVV tracking. Run the EVV backfill to link it.</p></Card>;
  const c = COMPLIANCE[v.complianceStatus], s = v.submissionStatus ? SUBMISSION[v.submissionStatus] : null, b = BILLING[v.billingReadiness], l = LIFECYCLE[v.status];
  return (
    <Card title="Electronic visit verification" description={v.evvRequired ? `Required for ${v.serviceCode} ${v.modifiers.join(" ")}` : "Not required for this service"} actions={office ? <Link href={`/evv?visit=${v.id}`} className="text-[13px] font-medium text-primary hover:underline">Open in EVV</Link> : undefined} padded>
      <div className="flex flex-wrap gap-1.5"><Badge tone={l.tone}>{l.label}</Badge><Badge tone={c.tone}>{c.label}</Badge>{s && <Badge tone={s.tone}>{s.label}</Badge>}{office && <Badge tone={b.tone}>{b.label}</Badge>}</div>
      {v.complianceReasons.filter((r) => r !== "EVV_NOT_REQUIRED").length > 0 && <ul className="mt-3 space-y-1 text-[13.5px]">{v.complianceReasons.filter((r) => r !== "EVV_NOT_REQUIRED").map((r) => <li key={r} className="flex items-start gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />{reasonLabel(r)}</li>)}</ul>}
      <p className="mt-3 text-[13px] text-muted-foreground">{v.serviceDate ? `Date of service ${fmtDate(v.serviceDate)} · ` : ""}version {v.version}{v.corrected ? " · corrected" : ""}{v.manualEntry ? " · manual entry" : ""}. EVV status is separate from the note&apos;s signatures.</p>
    </Card>
  );
}
