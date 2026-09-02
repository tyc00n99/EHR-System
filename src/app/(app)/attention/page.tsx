import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";
import { requireUser } from "@/lib/auth";
import { attentionItems } from "@/lib/attention";

export const metadata = { title: "Needs attention" };

const KIND: Record<string, { label: string; icon: keyof typeof Icon }> = {
  unsigned: { label: "Unsigned visits", icon: "edit" },
  manual: { label: "Manual visits pending EVV evidence", icon: "flag" },
  open: { label: "Visits left open", icon: "clock" },
  compliance: { label: "Staff compliance", icon: "audit" },
  orientation: { label: "Orientation before unsupervised contact", icon: "clients" },
  code: { label: "Clients without a signing code", icon: "id" },
  authorization: { label: "Authorizations running out", icon: "doc" },
};

export default async function AttentionPage() {
  await requireUser(["admin", "supervisor"]);
  const items = await attentionItems();
  const groups = Object.keys(KIND).map((k) => ({ k, items: items.filter((i) => i.kind === k) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Needs attention" meta={<span>{items.length} item{items.length === 1 ? "" : "s"} across visits, staff, clients, and authorizations. Worst first.</span>} />
      {items.length === 0 ? <Card><Empty icon="check" title="Nothing needs attention">Every visit is signed, staff are compliant, and authorizations have room.</Empty></Card> : (
        <div className="space-y-4">
          {groups.map(({ k, items }) => { const Ic = Icon[KIND[k].icon]; return (
            <Card key={k} title={KIND[k].label} actions={<Badge tone={items.some((i) => i.severity === "danger") ? "danger" : "warn"}>{items.length}</Badge>}>
              <ul className="divide-y divide-line-soft">
                {items.map((i, n) => (
                  <li key={n}>
                    <Link href={i.href} className="flex items-start gap-3 px-5 py-3 hover:bg-hover">
                      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${i.severity === "danger" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}><Ic size={15} /></span>
                      <span className="min-w-0 flex-1"><span className="block font-medium text-text-strong">{i.title}</span>{i.detail && <span className="block text-[13px] text-muted">{i.detail}</span>}</span>
                      <Icon.chevronRight size={16} className="mt-1 shrink-0 text-gray-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ); })}
        </div>
      )}
    </div>
  );
}
