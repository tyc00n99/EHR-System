import Link from "next/link";
import { Badge, Card, Empty, Kpi, PageHeader, Table, Td, Th, Thead, Tr, cx } from "@/components/kit";
import { TrendChart } from "@/components/trend-chart";
import { attentionItems } from "@/lib/attention";
import { countOpenVisits, listAgreementsWithUsage, listAllCredentials, listPeople, listStaff, periodLines } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { complianceSummary, evaluateCompliance } from "@/lib/credentials";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";
import { currentPayPeriod, payPeriodByIndex, payPeriodFromParam, type PayPeriod } from "@/lib/pay-period";

export const metadata = { title: "Owner view" };

function summarize(lines: Awaited<ReturnType<typeof periodLines>>) {
  const revenue = lines.reduce((n, l) => n + l.units * l.unitRate, 0);
  const labor = lines.reduce((n, l) => n + (l.minutes / 60) * l.payRate, 0);
  const hours = lines.reduce((n, l) => n + l.minutes, 0) / 60;
  const units = lines.reduce((n, l) => n + l.units, 0);
  const atRisk = lines.filter((l) => !l.signed || l.manual);
  return { revenue, labor, margin: revenue - labor, hours, units, visits: lines.length, atRisk, atRiskRevenue: atRisk.reduce((n, l) => n + l.units * l.unitRate, 0) };
}

function isoDaysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const delta = (now: number, prev: number) => (prev === 0 ? null : Math.round(((now - prev) / prev) * 100));

function Delta({ now, prev, money }: { now: number; prev: number; money?: boolean }) {
  const d = delta(now, prev);
  if (d === null) return <span className="text-muted-foreground">vs last period: {money ? fmtMoney(prev) : prev}</span>;
  return <span className={d >= 0 ? "text-ok" : "text-danger"}>{d >= 0 ? "▲" : "▼"} {Math.abs(d)}% vs last period</span>;
}

export default async function OwnerPage({ searchParams }: PageProps<"/owner">) {
  await requireUser(["admin"]);
  const sp = await searchParams;
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined);
  const prev = payPeriodByIndex(period.index - 1);
  const isCurrent = period.index === currentPayPeriod().index;
  const trendPeriods: PayPeriod[] = Array.from({ length: 6 }, (_, i) => payPeriodByIndex(period.index - 5 + i));

  const [lines, prevLines, trend, agreements, people, staffRows, creds, open, attention] = await Promise.all([
    periodLines(period.start, period.end),
    periodLines(prev.start, prev.end),
    Promise.all(trendPeriods.map((p) => periodLines(p.start, p.end).then((l) => ({ p, s: summarize(l) })))),
    listAgreementsWithUsage(),
    listPeople(),
    listStaff(true),
    listAllCredentials(),
    countOpenVisits(),
    attentionItems(),
  ]);
  const now = summarize(lines), before = summarize(prevLines);
  const sparkRev = trend.map((t) => t.s.revenue), sparkMargin = trend.map((t) => t.s.margin), sparkHours = trend.map((t) => t.s.hours);
  const today = isoDaysFromNow(0);
  const in60 = isoDaysFromNow(60);
  const daysElapsed = Math.min(14, Math.max(1, Math.round((new Date(today + "T12:00:00Z").getTime() - new Date(period.startDate + "T12:00:00Z").getTime()) / 86_400_000) + 1));

  const activeAgreements = agreements.filter((a) => a.agreement.status === "active" && a.agreement.endDate >= today);
  const authRisk = activeAgreements
    .map((a) => ({ ...a, pctUsed: pct(a.unitsUsed, a.agreement.authorizedUnits), remainingValue: (a.agreement.authorizedUnits - a.unitsUsed) * Number(a.agreement.unitRate), expiringSoon: a.agreement.endDate <= in60 }))
    .filter((a) => a.pctUsed >= 75 || a.expiringSoon)
    .sort((x, y) => (x.agreement.endDate < y.agreement.endDate ? -1 : 1));
  const bookValue = activeAgreements.reduce((n, a) => n + (a.agreement.authorizedUnits - a.unitsUsed) * Number(a.agreement.unitRate), 0);

  const staffCompliance = staffRows.map((s) => ({ s, ...complianceSummary(evaluateCompliance(s.hireDate, creds.get(s.id) ?? [])) }));
  const nonCompliant = staffCompliance.filter((x) => x.overdue > 0);

  const census = { active: people.filter((p) => p.status === "active").length, intake: people.filter((p) => p.status === "intake").length, discharged: people.filter((p) => p.status === "discharged").length };
  const byWaiver = Object.entries(people.filter((p) => p.status === "active").reduce<Record<string, number>>((m, p) => ((m[p.waiverProgram] = (m[p.waiverProgram] ?? 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const noCode = people.filter((p) => p.status === "active" && !p.signatureCodeHash);
  const q = (p: PayPeriod) => `/owner?period=${p.startDate}`;
  void fmtDateTime;
  
  return (
    <div>
      <PageHeader title="Owner insights" meta={<span>Money, billing risk, authorizations, and licensing exposure in one place.</span>} />

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={q(prev)} aria-label="Previous pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {period.label}</span></div>
        <Link href={q(payPeriodByIndex(period.index + 1))} aria-label="Next pay period" className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        {!isCurrent && <Link href="/owner" className="text-[13px] text-primary hover:underline">Jump to current</Link>}
        {open.length > 0 && <span className="ml-auto text-[13px] text-muted-foreground"><span className="font-medium text-primary">{open.length}</span> visit{open.length === 1 ? "" : "s"} in progress right now</span>}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Billable this period" value={fmtMoney(now.revenue)} note={isCurrent ? `Day ${daysElapsed} of 14 · last period ${fmtMoney(before.revenue)}` : <Delta now={now.revenue} prev={before.revenue} money />} spark={sparkRev} href="/billing" />
        <Kpi label="Profit expectations" value={fmtMoney(now.margin)} note={`${pct(now.margin, now.revenue)}% of billable · gross pay ${fmtMoney(now.labor)}`} tone={now.margin < 0 ? "danger" : undefined} spark={sparkMargin} />
        <Kpi label="Caregiver hours" value={now.hours.toFixed(1)} note={`${now.visits} completed note${now.visits === 1 ? "" : "s"} · ${now.units} units`} spark={sparkHours} href="/visits" />
        <Kpi label="Revenue at risk" value={fmtMoney(now.atRiskRevenue)} note={now.atRisk.length ? `${now.atRisk.length} note${now.atRisk.length === 1 ? "" : "s"} unsigned or manual` : "Every note signed and captured live"} tone={now.atRisk.length ? "warn" : "ok"} href="/attention" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="What you bill against what you pay" description="Billable revenue and caregiver gross pay, last six pay periods. Hover for the numbers." padded>
          <TrendChart points={trend.map(({ p, s }) => ({ label: p.label.split(" – ")[0], revenue: s.revenue, labor: s.labor, current: p.index === period.index }))} />
        </Card>

        <Card title="Census" description="Who you serve and how much authorized work is on the books">
          <div className="grid grid-cols-3 divide-x divide-line-soft border-b border-line-soft">
            {[["Active", census.active, "ok"], ["Intake", census.intake, "accent"], ["Discharged", census.discharged, "neutral"]].map(([l, n]) => (
              <div key={String(l)} className="px-5 py-3"><div className="text-[13px] text-muted-foreground">{l}</div><div className="figure text-[24px] text-text-strong">{n}</div></div>
            ))}
          </div>
          <div className="px-5 py-3 text-[13px]">
            <div className="mb-1.5 flex flex-wrap gap-1.5">{byWaiver.map(([w, n]) => <Badge key={w}>{w} · {n}</Badge>)}</div>
            <div className="text-muted-foreground">Unbilled authorized value across active agreements: <span className="font-medium tabular-nums text-text-strong">{fmtMoney(bookValue)}</span></div>
            {noCode.length > 0 && <div className="mt-1 text-danger">{noCode.length} active client{noCode.length === 1 ? " has" : "s have"} no signing code, so their visits cannot be signed.</div>}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card title="Authorizations to watch" description="Over 75% used or ending within 60 days. Request the next agreement before these run out.">
          {authRisk.length === 0 ? <Empty icon="doc" title="Nothing running out">All active authorizations have room and time.</Empty> : (
            <Table>
              <Thead><Th>Client</Th><Th>Service</Th><Th>Used</Th><Th>Ends</Th><Th align="right">Left</Th></Thead>
              <tbody>
                {authRisk.map((a) => (
                  <Tr key={a.agreement.id}>
                    <Td strong><Link href={`/clients/${a.agreement.personId}`} className="hover:underline">{a.personFirst} {a.personLast}</Link></Td>
                    <Td>{labelForCode(a.agreement.serviceCode, a.agreement.modifiers)}</Td>
                    <Td><span className="flex items-center gap-2"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-panel"><span className={cx("block h-full", a.pctUsed >= 90 ? "bg-danger" : "bg-warn")} style={{ width: `${a.pctUsed}%` }} /></span><span className="tabular-nums">{a.pctUsed}%</span></span></Td>
                    <Td className={cx("tabular-nums", a.expiringSoon ? "text-danger" : "text-muted-foreground")}>{fmtDate(a.agreement.endDate)}</Td>
                    <Td align="right">{fmtMoney(a.remainingValue)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Needs attention" description="Worst first. Everything here is a licensing, billing, or payroll problem." actions={<Link href="/attention" className="text-[13px] font-medium text-primary hover:underline">All {attention.length}</Link>}>
          {attention.length === 0 ? <Empty icon="check" title="Nothing needs attention" /> : (
            <ul className="divide-y divide-line-soft">
              {attention.slice(0, 7).map((i, n) => (
                <li key={n}><Link href={i.href} className="flex items-start gap-3 px-5 py-2.5 hover:bg-hover"><span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", i.severity === "danger" ? "bg-danger" : "bg-warn")} /><span className="min-w-0"><span className="block truncate font-medium text-text-strong">{i.title}</span><span className="block truncate text-[12.5px] text-muted-foreground">{i.detail}</span></span></Link></li>
              ))}
            </ul>
          )}
          <div className="grid grid-cols-3 divide-x divide-line-soft border-t border-line-soft bg-sidebar text-center">
            <div className="px-3 py-2"><div className="figure text-[20px] text-text-strong">{nonCompliant.length}</div><div className="text-[11.5px] text-muted-foreground">staff out of compliance</div></div>
            <div className="px-3 py-2"><div className="figure text-[20px] text-text-strong">{now.atRisk.filter((l) => !l.signed).length}</div><div className="text-[11.5px] text-muted-foreground">unsigned visits</div></div>
            <div className="px-3 py-2"><div className="figure text-[20px] text-text-strong">{open.length}</div><div className="text-[11.5px] text-muted-foreground">clocked in now</div></div>
          </div>
        </Card>
      </div>

    </div>
  );
}
