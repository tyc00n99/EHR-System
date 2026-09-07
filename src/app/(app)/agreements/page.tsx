import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/kit";
import { Table, Thead, Th, Tr, Td } from "@/components/kit";
import { Rule } from "@/components/rule";
import { listAgreementsWithUsage } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDate, isoDay } from "@/lib/format";
import { labelForCode } from "@/lib/hcpcs";

export const metadata = { title: "Authorizations" };

/**
 * Every authorization in one list, because "which ones run out this month" is a question the
 * client record cannot answer — it lives inside one person at a time.
 */
export default async function AgreementsPage() {
  await requireUser(["admin", "supervisor"]);
  const rows = await listAgreementsWithUsage();
  const today = isoDay();
  const in60 = isoDay(60);
  const active = rows.filter((r) => r.agreement.status === "active" && r.agreement.endDate >= today);
  const pct = (r: (typeof rows)[number]) => (r.agreement.authorizedUnits ? Math.round((r.unitsUsed / r.agreement.authorizedUnits) * 100) : 0);
  const pressing = active.filter((r) => pct(r) >= 75 || r.agreement.endDate <= in60).length;

  return (
    <div>
      <PageHeader
        title="Authorizations"
        meta={<span>{active.length} active · {pressing} running low on units or ending within 60 days</span>}
      />
      <Card
        title="Every service agreement"
        titleAfter={<Rule name="units" />}
        description="Sorted by end date, so the ones you have to renew are at the top."
      >
        {rows.length === 0 ? (
          <Empty icon="doc" title="No authorizations yet">Upload a DHS service agreement on a client record to add one.</Empty>
        ) : (
          <Table>
            <Thead>
              <Th>Client</Th><Th>Service</Th><Th>Agreement</Th><Th>Dates</Th>
              <Th align="right">Used</Th><Th align="right">Authorized</Th><Th>Consumed</Th><Th>Status</Th>
            </Thead>
            <tbody>
              {rows.map((r) => {
                const used = pct(r);
                const ending = r.agreement.status === "active" && r.agreement.endDate <= in60 && r.agreement.endDate >= today;
                const expired = r.agreement.endDate < today;
                return (
                  <Tr key={r.agreement.id}>
                    <Td><Link href={`/clients/${r.agreement.personId}`} className="font-medium text-text-strong hover:underline">{r.personFirst} {r.personLast}</Link></Td>
                    <Td wrap>{labelForCode(r.agreement.serviceCode, r.agreement.modifiers)}</Td>
                    <Td><Link href={`/clients/${r.agreement.personId}/agreements/${r.agreement.id}`} className="tabular-nums text-primary hover:underline">{r.agreement.agreementNumber}</Link></Td>
                    <Td><span className="text-muted-foreground">{fmtDate(r.agreement.startDate)} – {fmtDate(r.agreement.endDate)}</span></Td>
                    <Td align="right">{r.unitsUsed}</Td>
                    <Td align="right">{r.agreement.authorizedUnits}</Td>
                    <Td><Badge tone={used >= 90 ? "danger" : used >= 75 ? "warn" : "neutral"}>{used}%</Badge></Td>
                    <Td>
                      <span className="flex gap-1">
                        <Badge tone={expired ? "neutral" : r.agreement.status === "active" ? "ok" : "neutral"}>{expired ? "expired" : r.agreement.status}</Badge>
                        {ending && <Badge tone="warn">ends soon</Badge>}
                      </span>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
