import { Badge, Card, Empty, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { listAudit } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Audit log" };

const actionTone = { insert: "ok", update: "accent", delete: "danger", login: "neutral", logout: "neutral", reveal: "warn" } as const;

export default async function AuditPage() {
  await requireUser(["admin"]);
  const rows = await listAudit(300);
  return (
    <div>
      <PageHeader title="Audit log" meta={<span>Every write to a client, staff, or visit record, with who made it and when. Newest first.</span>} />
      <Card>
        {rows.length === 0 ? <Empty icon="audit" title="Nothing recorded yet" /> : (
          <Table>
            <Thead><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Table</Th><Th>Record</Th><Th>Changed fields</Th></Thead>
            <tbody>
              {rows.map(({ entry: a, actorEmail }) => {
                const before = (a.before ?? {}) as Record<string, unknown>;
                const after = (a.after ?? {}) as Record<string, unknown>;
                const changed = a.action === "update" ? Object.keys(after).filter((k) => k !== "updatedAt" && JSON.stringify(before[k]) !== JSON.stringify(after[k])) : [];
                return (
                  <Tr key={a.id}>
                    <Td className="whitespace-nowrap tabular-nums text-muted-foreground">{fmtDateTime(a.at)}</Td>
                    <Td>{actorEmail ?? <span className="text-hint">system</span>}</Td>
                    <Td><Badge tone={actionTone[a.action]}>{a.action}</Badge></Td>
                    <Td className="font-mono text-xs">{a.tableName}</Td>
                    <Td className="font-mono text-xs text-muted-foreground">{a.recordId?.slice(0, 8)}</Td>
                    <Td wrap className="text-[13px] text-muted-foreground">{changed.join(", ")}</Td>
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
