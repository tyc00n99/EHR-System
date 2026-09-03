import { notFound } from "next/navigation";
import { Badge, Card, Crumb, CrumbSep, Empty, PageHeader, PageIcon, Properties, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { getSite } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { getServiceType } from "@/lib/services";
import { createProgram } from "../actions";
import { ProgramForm, ProgramToggle } from "./program-form";

const TYPE_LABEL = { office: "Office", community_residential: "Community residential setting", day_services: "Day services facility", in_home: "In-home services" } as const;

export default async function SitePage({ params }: PageProps<"/sites/[id]">) {
  await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const site = await getSite(id);
  if (!site) notFound();
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/sites">Sites and programs</Crumb><CrumbSep /><Crumb>{site.name}</Crumb></>} icon={<PageIcon text={site.name[0]} />} title={site.name} meta={<span>{TYPE_LABEL[site.type]}</span>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card title="Site" padded>
          <Properties labelWidth={110} items={[
            { icon: "hash", label: "License", value: site.licenseNumber },
            { icon: "pin", label: "Address", value: [site.address1, site.city, site.zip].filter(Boolean).join(", ") || null },
            { icon: "phone", label: "Phone", value: site.phone },
          ]} />
        </Card>
        <Card title="Programs" description="Each program is one 245D service type delivered from this site">
          {site.programs.length === 0 ? <Empty icon="catalog" title="No programs yet">Add the first program below.</Empty> : (
            <Table>
              <Thead><Th>Program</Th><Th>245D service type</Th><Th>Planning</Th><Th>Status</Th><Th /></Thead>
              <tbody>
                {site.programs.map((p) => {
                  const t = getServiceType(p.serviceTypeId);
                  return (
                    <Tr key={p.id} muted={!p.active}>
                      <Td strong>{p.name}</Td>
                      <Td wrap>{t.name}</Td>
                      <Td><Badge tone={t.planningTrack === "245D.071" ? "accent" : "ok"}>{t.planningTrack}</Badge></Td>
                      <Td><Badge tone={p.active ? "ok" : "neutral"}>{p.active ? "active" : "inactive"}</Badge></Td>
                      <Td align="right"><ProgramToggle id={p.id} siteId={site.id} active={p.active} /></Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          <div className="border-t border-line-soft bg-sidebar px-5 py-4">
            <div className="mb-3 text-[13px] font-medium text-text-strong">Add a program</div>
            <ProgramForm action={createProgram.bind(null, site.id)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
