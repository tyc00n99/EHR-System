import { Badge, Button, Card, Input, PageHeader, StatTile, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { SUBMISSION } from "@/evv/labels";
import type { ComplianceSummary } from "@/evv/reporting";
import { fmtDate } from "@/lib/format";

type Names = { person: Record<string, string>; staff: Record<string, string> };
const pct = (v: number | null) => (v == null ? "—" : `${v}%`);

export function ComplianceTab({ summary: s, names }: { summary: ComplianceSummary; names: Names }) {
  void names;
  return (
    <div>
      <PageHeader title="EVV compliance" meta={<span>{s.label}. DHS measures compliance from what the aggregator holds, across every NPI and UMPI on your tax ID.</span>} />
      <form action="/evv" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="compliance" />
        <label className="text-[13px] text-muted-foreground">From<Input type="date" name="from" defaultValue={s.range.from} className="mt-1 block" /></label>
        <label className="text-[13px] text-muted-foreground">To<Input type="date" name="to" defaultValue={s.range.to} className="mt-1 block" /></label>
        <Button type="submit" variant="secondary">Update</Button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Estimated compliance" value={pct(s.estimatedCompliancePercent)} note="Compliant + exempt of completed EVV-required visits" tone={s.estimatedCompliancePercent == null ? undefined : s.estimatedCompliancePercent >= 90 ? "ok" : s.estimatedCompliancePercent >= 75 ? "warn" : "danger"} />
        <StatTile label="EVV-required visits" value={s.totals.evvRequired} note={`${s.totals.complete} completed`} />
        <StatTile label="Noncompliant" value={s.totals.noncompliant} note={`${s.totals.manualOrCorrected} manual or corrected`} tone={s.totals.noncompliant ? "danger" : "ok"} />
        <StatTile label="Accepted by aggregator" value={s.totals.accepted} note={`${s.totals.rejected} rejected · ${s.totals.unsubmitted} unsubmitted`} tone={s.totals.rejected ? "warn" : undefined} />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile label="Compliant" value={s.totals.compliant} tone="ok" />
        <StatTile label="Incomplete" value={s.totals.incomplete} note="Missing a clock-out or another element" />
        <StatTile label="Exempt · live-in" value={s.totals.exemptLiveIn} />
        <StatTile label="Needs review" value={s.totals.pendingReview} tone={s.totals.pendingReview ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By caregiver">
          {s.byCaregiver.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No completed EVV visits in this range.</p> : (
            <div className="overflow-x-auto"><Table><Thead><Th>Caregiver</Th><Th align="right">Visits</Th><Th align="right">Compliant</Th><Th align="right">Rate</Th></Thead><tbody>{[...s.byCaregiver].sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0)).map((r) => <Tr key={r.staffId}><Td strong>{r.name}</Td><Td align="right">{r.required}</Td><Td align="right">{r.compliant}</Td><Td align="right"><Badge tone={(r.percent ?? 0) >= 90 ? "ok" : (r.percent ?? 0) >= 75 ? "warn" : "danger"}>{pct(r.percent)}</Badge></Td></Tr>)}</tbody></Table></div>
          )}
        </Card>
        <Card title="By service">
          {s.byService.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No completed EVV visits in this range.</p> : (
            <div className="overflow-x-auto"><Table><Thead><Th>Service</Th><Th align="right">Visits</Th><Th align="right">Compliant</Th><Th align="right">Rate</Th></Thead><tbody>{s.byService.map((r) => <Tr key={`${r.serviceCode} ${r.modifiers}`}><Td strong>{r.serviceCode} {r.modifiers}</Td><Td align="right">{r.required}</Td><Td align="right">{r.compliant}</Td><Td align="right">{pct(r.percent)}</Td></Tr>)}</tbody></Table></div>
          )}
        </Card>
        <Card title="By billing identifier" description="DHS evaluates every NPI and UMPI associated with the tax ID">
          {s.byBillingId.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing yet.</p> : (
            <div className="overflow-x-auto"><Table><Thead><Th>Identifier</Th><Th align="right">Visits</Th><Th align="right">Compliant</Th><Th align="right">Rate</Th></Thead><tbody>{s.byBillingId.map((r) => <Tr key={`${r.billingIdType}:${r.billingId}`}><Td strong>{r.billingIdType?.toUpperCase() ?? "—"} {r.billingId ?? "not set"}</Td><Td align="right">{r.required}</Td><Td align="right">{r.compliant}</Td><Td align="right">{pct(r.percent)}</Td></Tr>)}</tbody></Table></div>
          )}
        </Card>
        <Card title="Top reasons">
          {s.topExceptionReasons.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No reasons recorded in this range.</p> : (
            <ul className="divide-y divide-line-soft">{s.topExceptionReasons.map((r) => <li key={r.type} className="flex items-center justify-between px-5 py-2.5"><span className="text-text">{r.label}</span><span className="figure text-text-strong">{r.count}</span></li>)}</ul>
          )}
        </Card>
      </div>

      <Card title={`Approaching the monthly deadline · ${s.approachingDeadline.count}`} description={`Minnesota requires visits and corrections by the ${s.approachingDeadline.deadlineDay}th of the following month; flagged ${s.approachingDeadline.warningDays} days ahead.`} className="mt-4">
        {s.approachingDeadline.visits.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing is close to its deadline.</p> : (
          <ul className="divide-y divide-line-soft">{s.approachingDeadline.visits.map((v) => <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[13px]"><a href={`/evv?visit=${v.id}`} className="font-medium text-primary hover:underline">{v.serviceDate ? fmtDate(v.serviceDate) : "No date"}</a><span className="text-muted-foreground">due {fmtDate(v.deadline)}</span>{v.submissionStatus && <Badge tone={SUBMISSION[v.submissionStatus].tone}>{SUBMISSION[v.submissionStatus].label}</Badge>}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
