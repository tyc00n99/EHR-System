import Link from "next/link";
import { Badge, Card, Empty, LinkButton, PageHeader } from "@/components/kit";
import { Icon } from "@/components/icons";
import { listSitesWithPrograms } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { getServiceType } from "@/lib/services";

export const metadata = { title: "Sites and programs" };

const TYPE_LABEL = { office: "Office", community_residential: "Community residential setting", day_services: "Day services facility", in_home: "In-home services" } as const;

export default async function SitesPage() {
  await requireUser(["admin", "supervisor"]);
  const sites = await listSitesWithPrograms();
  return (
    <div>
      <PageHeader title="Sites and programs" meta={<span>{sites.length} sites · {sites.reduce((n, s) => n + s.programs.length, 0)} programs</span>} actions={<LinkButton href="/sites/new" variant="primary">New site</LinkButton>} />
      {sites.length === 0 ? <Card><Empty icon="sites" title="No sites yet" action={<LinkButton href="/sites/new" variant="primary">Add a site</LinkButton>} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {sites.map((s) => (
            <Card key={s.id} title={s.name} description={`${TYPE_LABEL[s.type]}${s.licenseNumber ? ` · License ${s.licenseNumber}` : ""}`} actions={<Link href={`/sites/${s.id}`} className="text-[13px] font-medium text-primary hover:underline">Manage</Link>}>
              {s.address1 && <div className="flex items-center gap-2 border-b border-line-soft px-5 py-2.5 text-[13px] text-muted-foreground"><Icon.pin size={14} className="text-gray-400" />{s.address1}, {s.city} {s.zip}</div>}
              {s.programs.length === 0 ? <p className="px-5 py-4 text-[13px] text-muted-foreground">No programs at this site.</p> : (
                <ul className="divide-y divide-line-soft">
                  {s.programs.map((p) => {
                    const t = getServiceType(p.serviceTypeId);
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                        <div className="min-w-0">
                          <div className={`truncate font-medium ${p.active ? "text-text-strong" : "text-hint line-through"}`}>{p.name}</div>
                          <div className="truncate text-xs text-muted-foreground">{t.name}</div>
                        </div>
                        <Badge tone={t.category === "intensive" ? "accent" : "ok"}>{t.category}</Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
