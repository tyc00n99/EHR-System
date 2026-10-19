import Link from "next/link";
import { Badge, Card, cx, Empty, PageHeader, Table, Td, Th, Thead, Tr, type Tone } from "@/components/kit";
import { getDb } from "@/db";
import { billableLines, sentClaims, type BillableLine } from "@/billing/claims";
import { clearinghouseFromEnv } from "@/billing/clearinghouse";
import { requireAbility } from "@/lib/auth";
import { fmtDate, fmtDateNum, fmtMoney } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodFromParam, shiftPayPeriod } from "@/lib/pay-period";
import { getPayRules } from "@/db/pay-queries";
import { DownloadButton, SendButton, TakeBack } from "./claim-run";

export const metadata = { title: "Billing" };

const CLAIM: Record<string, { label: string; tone: Tone }> = {
  sent: { label: "Sent", tone: "accent" },
  accepted: { label: "Accepted", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  paid: { label: "Paid", tone: "ok" },
  denied: { label: "Denied", tone: "danger" },
};

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  await requireAbility("billing");
  const sp = await searchParams;
  const rules = await getPayRules();
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined, rules);
  const isCurrent = period.startDate === currentPayPeriod(rules).startDate;
  const db = await getDb();
  const adapter = clearinghouseFromEnv();
  const health = adapter.health();
  const [all, sent] = await Promise.all([billableLines(db, period.start, period.end), sentClaims(db, period.startDate, period.endDate)]);
  const code = typeof sp.code === "string" ? sp.code : "";
  const codes = [...new Set(all.map((l) => l.serviceCode))].sort();
  const lines = code ? all.filter((l) => l.serviceCode === code) : all;
  const ready = lines.filter((l) => l.state === "ready");
  const hold = lines.filter((l) => l.state === "hold");
  const claimed = lines.filter((l) => l.state === "claimed");
  const byClient = Object.values(ready.reduce<Record<string, { personId: string; name: string; lines: BillableLine[] }>>((acc, l) => { (acc[l.personId] ??= { personId: l.personId, name: l.personName, lines: [] }).lines.push(l); return acc; }, {}));
  const total = (ls: BillableLine[]) => ls.reduce((n, l) => n + l.amount, 0);
  const q = (p: { startDate: string }) => `/billing?period=${p.startDate}${code ? `&code=${code}` : ""}`;
  const codeHref = (c: string) => `/billing?period=${period.startDate}${c ? `&code=${c}` : ""}`;
  const readyIds = ready.map((l) => l.visitId);
  const name = adapter.key === "mock" ? "the test clearinghouse" : "Waystar";

  return (
    <div>
      <PageHeader title="Billing" meta={<span>Signed notes become claim lines. EVVora sends them to Waystar as an 837P, and Waystar forwards them to MN-ITS.</span>} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={q(shiftPayPeriod(period, -1, rules))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {period.label}</span></div>
        <Link href={q(shiftPayPeriod(period, 1, rules))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        <div className="ml-auto flex gap-5 text-[13px] tabular-nums text-muted-foreground"><span><span className="font-medium text-ok">{fmtMoney(total(ready))}</span> ready</span><span><span className="font-medium text-warn">{fmtMoney(total(hold))}</span> on hold</span><span><span className="font-medium text-text-strong">{fmtMoney(total(claimed))}</span> sent</span></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-card px-3 py-2">
        <span className="text-[13px] text-muted-foreground">Service code</span>
        <Link href={codeHref("")} className={cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium", code ? "border-line bg-page text-text hover:bg-hover" : "border-primary bg-primary-soft text-primary")}>
          All<span className="tabular-nums opacity-70">{all.length}</span>
        </Link>
        {codes.map((c) => {
          const n = all.filter((l) => l.serviceCode === c).length;
          return (
            <Link key={c} href={codeHref(c)} title={labelForCode(c, [])} className={cx("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px] font-medium", code === c ? "border-primary bg-primary-soft text-primary" : "border-line bg-page text-text hover:bg-hover")}>
              <span className="font-mono">{c}</span><span className="tabular-nums opacity-70">{n}</span>
            </Link>
          );
        })}
        {code && <span className="ml-auto text-[13px] text-muted-foreground">{labelForCode(code, [])} · {fmtMoney(total(lines))} of {fmtMoney(total(all))}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Ready to send" description="One claim per client and authorization; each note is one service line." actions={<><Badge tone="ok">{ready.length} lines</Badge><SendButton visitIds={readyIds} label={adapter.key === "mock" ? "test clearinghouse" : "Waystar"} connected={health.ok} /></>}>
          {byClient.length === 0 ? <Empty icon="money" title="Nothing ready in this period" /> : byClient.map((c) => (
            <div key={c.personId} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center justify-between bg-sidebar px-5 py-1.5 text-[13px]"><Link href={`/clients/${c.personId}`} className="font-semibold text-text-strong hover:underline">{c.name}</Link><span className="tabular-nums text-muted-foreground">{c.lines.length} line{c.lines.length === 1 ? "" : "s"} · {fmtMoney(total(c.lines))}</span></div>
              <Table>
                <Thead><Th>Date</Th><Th>Service</Th><Th>Code</Th><Th align="right">Units</Th><Th align="right">Rate</Th><Th align="right">Amount</Th><Th>Rendered by</Th></Thead>
                <tbody>{c.lines.map((l) => <Tr key={l.visitId}><Td className="tabular-nums">{fmtDateNum(l.date)}</Td><Td><Link href={`/visits/${l.visitId}`} className="hover:underline">{labelForCode(l.serviceCode, [])}</Link></Td><Td className="tabular-nums">{[l.serviceCode, ...l.modifiers].join(" ")}</Td><Td align="right">{l.units}</Td><Td align="right">{fmtMoney(l.unitRate)}</Td><Td align="right" strong>{fmtMoney(l.amount)}</Td><Td className="text-muted-foreground">{l.staffName}</Td></Tr>)}</tbody>
              </Table>
            </div>
          ))}
        </Card>
        <div className="space-y-4">
          <Card title="Waystar" padded actions={<Badge tone={health.ok ? "ok" : "warn"}>{adapter.key === "mock" ? "test mode" : health.ok ? "connected" : "not connected"}</Badge>}>
            {adapter.key === "mock" ? (
              <p className="text-[13px] text-muted-foreground">Claims go to a test clearinghouse that accepts everything. Nothing reaches Waystar or MN-ITS.</p>
            ) : health.ok ? (
              <p className="text-[13px] text-muted-foreground">Ready lines are sent to Waystar as an 837P, and Waystar forwards them to MN-ITS. Acceptances, rejections and payments come back onto each claim.</p>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">Until the Waystar account is connected, download the 837P and upload it in Waystar&apos;s portal. The lines are marked as billed so nothing goes out twice.</p>
                <details className="mt-2 text-[13px]"><summary className="cursor-pointer font-medium text-text">What the connection still needs</summary><ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{health.problems.map((p) => <li key={p}>{p}</li>)}</ul></details>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-2"><DownloadButton visitIds={readyIds} /><Link href={`/reports/visits.csv?period=${period.startDate}`} className="inline-flex h-8 items-center rounded-md px-2 text-[13px] font-medium text-muted-foreground hover:bg-hover">CSV</Link></div>
          </Card>
          <Card title="On hold" description="Fix these before they can be sent" actions={<Badge tone={hold.length ? "warn" : "ok"}>{hold.length}</Badge>}>
            {hold.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing held.</p> : (
              <ul className="divide-y divide-line-soft">{hold.map((l) => <li key={l.visitId}><Link href={`/visits/${l.visitId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-hover"><span className="min-w-0"><span className="block truncate font-medium text-text-strong">{l.personName}</span><span className="block text-[13px] text-muted-foreground">{fmtDateNum(l.date)} · {l.holds.join(" · ")} · {fmtMoney(l.amount)}</span></span></Link></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
      <Card title="Sent claims" description={`Claims with service dates in this pay period, sent to ${name} or downloaded for upload.`} className="mt-4" actions={<Badge tone="neutral">{sent.length}</Badge>}>
        {sent.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No claims sent for this period yet.</p> : (
          <Table>
            <Thead><Th>Client</Th><Th>Dates of service</Th><Th align="right">Lines</Th><Th align="right">Amount</Th><Th>Status</Th><Th>Sent</Th><Th>File</Th><Th>{""}</Th></Thead>
            <tbody>{sent.map((c, i) => {
              const s = CLAIM[c.status] ?? { label: c.status, tone: "neutral" as Tone };
              const firstOfBatch = sent.findIndex((x) => x.batchId === c.batchId) === i;
              return (
                <Tr key={c.id}>
                  <Td><Link href={`/clients/${c.personId}`} className="font-medium hover:underline">{c.personName}</Link></Td>
                  <Td className="tabular-nums">{fmtDateNum(c.firstDate)}{c.lastDate !== c.firstDate ? ` – ${fmtDateNum(c.lastDate)}` : ""}</Td>
                  <Td align="right">{c.lines}</Td>
                  <Td align="right" strong>{fmtMoney(c.total)}</Td>
                  <Td><span title={c.statusMessage ?? undefined}><Badge tone={s.tone}>{s.label}</Badge></span></Td>
                  <Td className="text-muted-foreground">{fmtDate(c.sentAt)} · {c.method === "download" ? "downloaded" : c.clearinghouse === "mock" ? "test" : "Waystar"}</Td>
                  <Td><a href={`/billing/batches/${c.batchId}/837`} className="text-[13px] font-medium text-primary hover:underline">837P #{c.controlNumber}</a></Td>
                  <Td align="right">{firstOfBatch && c.status !== "paid" && <TakeBack batchId={c.batchId} />}</Td>
                </Tr>
              );
            })}</tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
