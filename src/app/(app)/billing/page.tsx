import Link from "next/link";
import { Badge, Card, cx, Empty, PageHeader, Table, Td, Th, Thead, Tr, type Tone } from "@/components/kit";
import { getDb } from "@/db";
import { defaultOrganizationId } from "@/evv/context";
import { centsToDollars } from "@/billing/money";
import { authorizationSummaries, billableLines, billingSetup, ensureBillingDefaults, sentClaims, type BillableLine } from "@/billing/claims";
import { evvLabel } from "@/billing/labels";
import { RULES, SOURCE_LABEL, type Check, type RuleId } from "@/billing/rules";
import { clearinghouseFromEnv } from "@/billing/clearinghouse";
import { requireAbility } from "@/lib/auth";
import { fmtDate, fmtDateNum, fmtMoney, isoDay } from "@/lib/format";
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
  const user = await requireAbility("billing");
  const sp = await searchParams;
  const rules = await getPayRules();
  const period = payPeriodFromParam(typeof sp.period === "string" ? sp.period : undefined, rules);
  const isCurrent = period.startDate === currentPayPeriod(rules).startDate;
  const db = await getDb();
  const adapter = clearinghouseFromEnv();
  const health = adapter.health();
  const orgId = await defaultOrganizationId(db);
  // The billing provider and the DHS payer exist from the first visit to Billing on (idempotent).
  await ensureBillingDefaults(db, orgId, { userId: user.id }).catch(() => ensureBillingDefaults(db, orgId, { userId: user.id }));
  const [all, sent, setup] = await Promise.all([billableLines(db, orgId, period.start, period.end), sentClaims(db, orgId, period.startDate, period.endDate), billingSetup(db, orgId)]);
  const code = typeof sp.code === "string" ? sp.code : "";
  const codes = [...new Set(all.map((l) => l.serviceCode))].sort();
  const lines = code ? all.filter((l) => l.serviceCode === code) : all;
  const ready = lines.filter((l) => l.state === "ready");
  const hold = lines.filter((l) => l.state === "hold");
  const claimed = lines.filter((l) => l.state === "claimed");
  const byClient = Object.values(ready.reduce<Record<string, { personId: string; name: string; lines: BillableLine[] }>>((acc, l) => { (acc[l.personId] ??= { personId: l.personId, name: l.personName, lines: [] }).lines.push(l); return acc; }, {}));
  const total = (ls: BillableLine[]) => centsToDollars(ls.reduce((n, l) => n + l.amountCents, 0));
  const q = (p: { startDate: string }) => `/billing?period=${p.startDate}${code ? `&code=${code}` : ""}`;
  const codeHref = (c: string) => `/billing?period=${period.startDate}${c ? `&code=${c}` : ""}`;
  const readyIds = ready.map((l) => l.visitId);
  const name = adapter.key === "mock" ? "the mock clearinghouse" : "Waystar";
  const flagged = ready.filter((l) => l.warnings.length);
  const auths = await authorizationSummaries(db, orgId, lines, isoDay(0));
  // A fix that is only a query string (`?visit=…`) opens over this page, keeping the period and filter.
  const fixHref = (f: string) => (f.startsWith("?") ? `${q(period)}&${f.slice(1)}` : f);
  const groups = attentionGroups(lines);

  return (
    <div>
      <PageHeader title="Billing" meta={<span>Signed notes become claim lines. EVVora sends them to Waystar as an 837P, and Waystar forwards them to MN-ITS.</span>} />
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line bg-sidebar px-3 py-2">
        <Link href={q(shiftPayPeriod(period, -1, rules))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">‹</Link>
        <div className="text-[13px] font-medium text-text-strong">{isCurrent ? "Current pay period" : "Pay period"} <span className="font-normal text-muted-foreground">· {period.label}</span></div>
        <Link href={q(shiftPayPeriod(period, 1, rules))} className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-hover">›</Link>
        <div className="ml-auto flex gap-5 text-[13px] tabular-nums text-muted-foreground"><span><span className="font-medium text-ok">{fmtMoney(total(ready))}</span> ready</span><span><span className="font-medium text-warn">{fmtMoney(total(hold))}</span> on hold</span>{flagged.length > 0 && <span><span className="font-medium text-text-strong">{flagged.length}</span> ready with warnings</span>}<span><span className="font-medium text-text-strong">{fmtMoney(total(claimed))}</span> sent</span></div>
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
        <Card title="Ready to send" description="One claim per client and authorization; each note is one service line." actions={<><Badge tone="ok">{ready.length} lines</Badge><SendButton visitIds={readyIds} label={adapter.key === "mock" ? "mock clearinghouse" : "Waystar"} connected={health.ok} /></>}>
          {byClient.length === 0 ? <Empty icon="money" title="Nothing ready in this period" /> : byClient.map((c) => (
            <div key={c.personId} className="border-b border-line-soft last:border-b-0">
              <div className="flex items-center justify-between bg-sidebar px-5 py-1.5 text-[13px]"><Link href={`/clients/${c.personId}`} className="font-semibold text-text-strong hover:underline">{c.name}</Link><span className="tabular-nums text-muted-foreground">{c.lines.length} line{c.lines.length === 1 ? "" : "s"} · {fmtMoney(total(c.lines))}</span></div>
              <Table>
                <Thead><Th>Date</Th><Th>Service</Th><Th>Code</Th><Th align="right">Units</Th><Th align="right">Amount</Th><Th>Rendered by</Th><Th>EVV</Th></Thead>
                <tbody>{c.lines.map((l) => {
                  const e = evvLabel(l.evv);
                  return (
                    <Tr key={l.visitId}>
                      <Td className="tabular-nums">{fmtDateNum(l.date)}</Td>
                      <Td><Link href={fixHref(`?visit=${l.visitId}`)} className="hover:underline">{labelForCode(l.serviceCode, l.modifiers)}</Link></Td>
                      <Td className="tabular-nums">{[l.serviceCode, ...l.modifiers].join(" ")}</Td>
                      <Td align="right">{l.units}</Td>
                      <Td align="right" strong>{fmtMoney(centsToDollars(l.amountCents))}</Td>
                      <Td className="text-muted-foreground">{l.staffName}</Td>
                      <Td wrap><span className="flex flex-col items-start gap-1"><Badge tone={e.tone}>{e.label}</Badge>{l.warnings.length > 0 && <span title={l.warnings.map((w) => w.message).join("\n")}><Badge tone="warn">{l.warnings.length} warning{l.warnings.length === 1 ? "" : "s"}</Badge></span>}</span></Td>
                    </Tr>
                  );
                })}</tbody>
              </Table>
            </div>
          ))}
        </Card>
        <div className="space-y-4">
          <Card title="Waystar" padded actions={<Badge tone={health.ok ? "ok" : "warn"}>{adapter.key === "mock" ? "Mock — not sent to Waystar" : health.ok ? "connected" : "not connected"}</Badge>}>
            {adapter.key === "mock" ? (
              <p className="text-[13px] text-muted-foreground">This is a mock clearinghouse for testing. Claims are kept here, nothing reaches Waystar or MN-ITS, and no acknowledgment or payment comes back on its own.</p>
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
          <Card title="Billing setup" description="What every claim depends on" actions={<Badge tone={setup.some((c) => c.severity === "block") ? "danger" : setup.length ? "warn" : "ok"}>{setup.length ? `${setup.length} to check` : "Complete"}</Badge>}>
            {setup.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">The billing provider and payer are set up.</p> : (
              <ul className="divide-y divide-line-soft">{setup.map((c) => (
                <li key={c.id} className="px-5 py-2.5 text-[13px]">
                  <div className="flex items-start justify-between gap-3"><span className="font-medium text-text-strong">{c.message}</span><Badge tone={c.severity === "block" ? "danger" : "warn"}>{c.severity === "block" ? "Blocks sending" : "Warning"}</Badge></div>
                  <div className="mt-0.5 text-muted-foreground">{RULES[c.id].basis}{c.fix && <> <Link href={c.fix} className="font-medium text-primary hover:underline">{c.fixLabel}</Link></>}</div>
                </li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
      <Card title="Needs attention" description="Every rule a note fails, with where the rule comes from and where to fix it. Held notes cannot be sent; warnings can." className="mt-4" actions={<><Badge tone={hold.length ? "danger" : "ok"}>{hold.length} held</Badge><Badge tone={flagged.length ? "warn" : "ok"}>{flagged.length} with warnings</Badge></>}>
        {groups.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">Nothing held or flagged in this period.</p> : groups.map((g) => {
          const spec = RULES[g.id];
          return (
            <details key={g.id} open={g.severity === "block"} className="group border-b border-line-soft last:border-b-0">
              <summary className="flex cursor-pointer list-none items-start gap-3 px-5 py-3 hover:bg-hover">
                <span className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-90">›</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-medium text-text-strong">{spec.label}</span><Badge tone={g.severity === "block" ? "danger" : "warn"}>{g.severity === "block" ? "Holds billing" : "Warning"}</Badge><Badge tone="neutral">{SOURCE_LABEL[spec.source]}</Badge>{!spec.verified && <Badge tone="neutral">Not yet verified</Badge>}</span>
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{spec.basis} <span className="font-mono opacity-70">{g.id}</span></span>
                </span>
                <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{g.items.length} note{g.items.length === 1 ? "" : "s"} · {fmtMoney(total(g.items.map((i) => i.line)))}</span>
              </summary>
              <Table>
                <Thead><Th>Client</Th><Th>Date</Th><Th>Service</Th><Th>What is wrong</Th><Th>{""}</Th></Thead>
                <tbody>{g.items.slice(0, 25).map(({ line: l, check: c }, i) => (
                  <Tr key={`${l.visitId}-${i}`}>
                    <Td><Link href={`/clients/${l.personId}`} className="font-medium hover:underline">{l.personName}</Link></Td>
                    <Td className="tabular-nums">{fmtDateNum(l.date)}</Td>
                    <Td className="tabular-nums">{[l.serviceCode, ...l.modifiers].join(" ")}</Td>
                    <Td wrap>{c.message}</Td>
                    <Td align="right">{c.fix && <Link href={fixHref(c.fix)} className="text-[13px] font-medium text-primary hover:underline">{c.fixLabel}</Link>}</Td>
                  </Tr>
                ))}</tbody>
              </Table>
              {g.items.length > 25 && <p className="px-5 py-2 text-[13px] text-muted-foreground">And {g.items.length - 25} more.</p>}
            </details>
          );
        })}
      </Card>
      <Card title="Authorizations" description="Units on the authorizations these notes draw on. Ready units are counted before they are sent." className="mt-4" actions={<Badge tone={auths.some((a) => a.flags.some((f) => f.tone === "danger")) ? "danger" : auths.some((a) => a.flags.length) ? "warn" : "neutral"}>{auths.length}</Badge>}>
        {auths.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No notes in this period.</p> : (
          <Table>
            <Thead><Th>Client</Th><Th>Authorization</Th><Th>Service</Th><Th>Dates</Th><Th align="right">Authorized</Th><Th align="right">Billed</Th><Th align="right">Reserved</Th><Th align="right">Ready</Th><Th align="right">Held</Th><Th align="right">Left</Th><Th>{""}</Th></Thead>
            <tbody>{auths.map((a) => (
              <Tr key={a.agreementId}>
                <Td><Link href={`/clients/${a.personId}`} className="font-medium hover:underline">{a.personName}</Link></Td>
                <Td><Link href={`/clients/${a.personId}?tab=overview`} className="tabular-nums hover:underline">{a.agreementNumber}</Link></Td>
                <Td className="tabular-nums">{[a.serviceCode, ...a.modifiers].join(" ")}</Td>
                <Td className="tabular-nums">{fmtDateNum(a.startDate)} – {fmtDateNum(a.endDate)}</Td>
                <Td align="right">{a.authorized.toLocaleString()}</Td>
                <Td align="right">{a.billed.toLocaleString()}</Td>
                <Td align="right">{a.reserved.toLocaleString()}</Td>
                <Td align="right">{a.readyInView.toLocaleString()}</Td>
                <Td align="right">{a.heldInView.toLocaleString()}</Td>
                <Td align="right" strong>{a.left.toLocaleString()}</Td>
                <Td><span className="flex flex-wrap gap-1">{a.flags.map((f) => <Badge key={f.message} tone={f.tone}>{f.message}</Badge>)}</span></Td>
              </Tr>
            ))}</tbody>
          </Table>
        )}
      </Card>
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
                  <Td align="right" strong>{fmtMoney(centsToDollars(c.totalCents))}</Td>
                  <Td><span title={c.statusMessage ?? undefined}><Badge tone={s.tone}>{s.label}</Badge></span></Td>
                  <Td className="text-muted-foreground">{fmtDate(c.sentAt)} · {c.method === "download" ? "downloaded" : c.clearinghouse === "mock" ? "mock, not sent" : "Waystar"}</Td>
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

interface Group { id: RuleId; severity: "block" | "warn"; items: { line: BillableLine; check: Check }[] }

/** Lines that fail a rule, grouped by rule: holds first, then warnings, larger groups first. */
function attentionGroups(lines: BillableLine[]): Group[] {
  const by = new Map<RuleId, Group>();
  for (const l of lines) {
    if (l.state === "claimed") continue;
    for (const c of l.checks) {
      const g = by.get(c.id) ?? by.set(c.id, { id: c.id, severity: c.severity, items: [] }).get(c.id)!;
      if (c.severity === "block") g.severity = "block";
      g.items.push({ line: l, check: c });
    }
  }
  return [...by.values()].sort((a, b) => (a.severity === b.severity ? b.items.length - a.items.length : a.severity === "block" ? -1 : 1));
}
