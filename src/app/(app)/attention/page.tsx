import { Card, Empty, PageHeader } from "@/components/kit";
import { AttentionList } from "./attention-list";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { attentionItems } from "@/lib/attention";

export const metadata = { title: "Review queue" };

const KIND: Record<string, { label: string; icon: keyof typeof Icon }> = {
  returned: { label: "Returned notes", icon: "edit" },
  unsigned: { label: "Unsigned notes", icon: "edit" },
  manual: { label: "Manual notes pending EVV evidence", icon: "flag" },
  open: { label: "Still clocked in", icon: "clock" },
  missed_shift: { label: "Missed shifts", icon: "calendar" },
  compliance: { label: "Staff compliance", icon: "audit" },
  orientation: { label: "Orientation before unsupervised contact", icon: "clients" },
  code: { label: "Clients without a signing code", icon: "id" },
  authorization: { label: "Authorizations running out", icon: "doc" },
};

export default async function AttentionPage({ searchParams }: PageProps<"/attention">) {
  const sp = await searchParams;
  const initialKind = typeof sp.kind === "string" && sp.kind in KIND ? sp.kind : "all";
  await requireUser(["admin", "supervisor"]);
  const items = await attentionItems();
  const groups = Object.keys(KIND).map((k) => ({ k, items: items.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Review queue" meta={<span>{items.length} item{items.length === 1 ? "" : "s"} across visits, staff, clients, and authorizations. Filter by priority or type. Select related records to resolve them together.</span>} />
      {items.length === 0 ? (
        <Card><Empty icon="check" title="Nothing needs attention">Every visit is signed, staff are compliant, and authorizations have room.</Empty></Card>
      ) : (
        <AttentionList key={initialKind} initialKind={initialKind} groups={groups.map(({ k, items }) => ({ kind: k, label: KIND[k].label, icon: KIND[k].icon, rows: items }))} />
      )}
    </div>
  );
}
