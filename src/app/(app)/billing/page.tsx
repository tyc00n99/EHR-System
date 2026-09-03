import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { periodLines } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodByIndex, payPeriodFromParam } from "@/lib/pay-period";

export const metadata = { title: "Billing" };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined);
  const isCurrent = period.index === currentPayPeriod().index;
  const lines = await periodLines(period.start, period.end);
  const ready = lines.filter((l) => l.signed && !l.manual);
  const hold = lines.filter((l) => !l.signed || l.manual);
  const byClient = Object.values(ready.reduce<Record<string, { personId: string; name: string; lines: typeof ready }>>((acc, l) => { (acc[l.personId] ??= { personId: l.personId, name: l.personName, lines: [] }).lines.push(l); return acc; }, {}));
  const total = (ls: typeof lines) => ls.reduce((n, l) => n + l.units * l.unitRate, 0);
  const q = (p: { startDate: string }) => `/billing?period=${p.startDate}`;

  return (
    <div>
      <PageHeader title="Billing" meta={<span>Claim lines for the pay period, priced from each agreement. Signed, live-captured visits are ready; the rest are held until the evidence is in.</span>} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={q(payPeriodByIndex(period.index - 1))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {period.label}</span></div>
        <Link href={q(payPeriodByIndex(period.index + 1))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        <div className="ml-auto flex gap-5 text-[13px] tabular-nums text-muted-foreground"><span><span className="font-medium text-ok">{fmtMoney(total(ready))}</span> ready</span><span><span className="font-medium text-warn">{fmtMoney(total(hold))}</span> on hold</span><span><span className="font-medium text-text-strong">{fmtMoney(total(lines))}</span> total</span></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card title="Ready to bill" description="Grouped by client. One row per visit becomes one 837P service line." actions={<Badge tone="ok">{ready.length} lines</Badge>}>
          {byClient.length === 0 ? <Empty icon="money" title="Nothing ready in this period" /> : byClient.map((c) => (
            <div key={c.personId} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center justify-between bg-sidebar px-5 py-1.5 text-[12px]"><Link href={`/clients/${c.personId}`} className="font-semibold text-text-strong hover:underline">{c.name}</Link><span className="tabular-nums text-muted-foreground">{c.lines.length} line{c.lines.length === 1 ? "" : "s"} · {fmtMoney(total(c.lines))}</span></div>
              <Table>
                <Thead><Th>Service</Th><Th>Code</Th><Th align="right">Units</Th><Th align="right">Rate</Th><Th align="right">Amount</Th><Th>Rendered by</Th></Thead>
                <tbody>{c.lines.map((l) => <Tr key={l.visitId}><Td><Link href={`/visits/${l.visitId}`} className="hover:underline">{labelForCode(l.serviceCode, [])}</Link></Td><Td className="tabular-nums">{l.serviceCode}</Td><Td align="right">{l.units}</Td><Td align="right">{fmtMoney(l.unitRate)}</Td><Td align="right" strong>{fmtMoney(l.units * l.unitRate)}</Td><Td className="text-muted-foreground">{l.staffName}</Td></Tr>)}</tbody>
              </Table>
            </div>
          ))}
        </Card>
        <div className="space-y-4">
          <Card title="On hold" description="Fix these before the claim run" actions={<Badge tone={hold.length ? "warn" : "ok"}>{hold.length}</Badge>}>
            {hold.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing held.</p> : (
              <ul className="divide-y divide-line-soft">{hold.map((l) => <li key={l.visitId}><Link href={`/visits/${l.visitId}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-hover"><span className="min-w-0"><span className="block truncate font-medium text-text-strong">{l.personName}</span><span className="block text-[12.5px] text-muted-foreground">{!l.signed ? "Not signed by client" : "Manual entry pending EVV"} · {fmtMoney(l.units * l.unitRate)}</span></span><Badge tone={!l.signed ? "danger" : "warn"}>{!l.signed ? "unsigned" : "manual"}</Badge></Link></li>)}</ul>
            )}
          </Card>
          <Card title="Claim run" padded>
            <p className="text-[13px] text-muted-foreground">837P generation and the MN-ITS submission are the next milestone. The lines above are already shaped for it: provider tax ID, PMI, HCPCS with modifiers, units, rendering NPI or UMPI, and dates of service.</p>
            <Link href={`/reports/visits.csv?period=${period.startDate}`} className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-page px-3 text-[13px] font-medium hover:bg-hover">Download period as CSV</Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
