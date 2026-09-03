import { Badge, Card, PageHeader, Table, Td, Th, Thead, Tr } from "@/components/kit";
import { GROUP_LABELS, SERVICE_TYPES, WAIVER_NAMES, type ServiceCategory, type ServiceGroup } from "@/lib/services";

export const metadata = { title: "245D service types" };

const CATEGORIES: { key: ServiceCategory; title: string; blurb: string; cite: string }[] = [
  { key: "basic", title: "Basic support services", blurb: "Assistance, supervision, and care necessary for health and welfare. Not directed toward training, treatment, habilitation, or rehabilitation.", cite: "245D.03, subd. 1(b)" },
  { key: "intensive", title: "Intensive support services", blurb: "Assistance, supervision, and care plus services directed toward training, habilitation, or rehabilitation.", cite: "245D.03, subd. 1(c)" },
];

const GROUP_ORDER: ServiceGroup[] = ["respite", "in-home", "supervision", "community", "intervention", "residential", "day", "employment"];

export default function ServicesPage() {
  return (
    <div>
      <PageHeader title="245D service types" meta={<span>Every service the license governs, grouped the way 245D.03 lists them. Planning shows which service-planning rules apply: 245D.07 for the basic track, 245D.071 for the outcome-based intensive track.</span>} />
      <div className="space-y-6">
        {CATEGORIES.map((cat) => {
          const items = SERVICE_TYPES.filter((s) => s.category === cat.key);
          return (
            <Card key={cat.key} title={cat.title} description={cat.blurb} actions={<span className="text-xs text-muted-foreground">{cat.cite} · {items.length} services</span>}>
              <Table>
                <Thead><Th>Service</Th><Th>Waivers</Th><Th>Planning</Th><Th>Cite</Th></Thead>
                <tbody>
                  {GROUP_ORDER.map((g) => {
                    const rows = items.filter((s) => s.group === g);
                    if (rows.length === 0) return null;
                    return [
                      <tr key={`${g}-h`} className="border-t border-line-soft bg-sidebar"><td colSpan={4} className="px-5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">{GROUP_LABELS[g]}</td></tr>,
                      ...rows.map((s) => (
                        <Tr key={s.id}>
                          <Td wrap>
                            <div className="font-medium text-text-strong">{s.name}</div>
                            {s.note && <div className="mt-0.5 max-w-md text-xs leading-4 text-muted-foreground">{s.note}</div>}
                          </Td>
                          <Td wrap>
                            {s.waivers.length === 0 ? <span className="text-muted-foreground">Non-waiver</span> : (
                              <span className="flex flex-wrap gap-1">{s.waivers.map((w) => <span key={w} title={WAIVER_NAMES[w]} className="rounded bg-panel px-1.5 py-0.5 text-xs font-medium text-gray-700">{w}</span>)}</span>
                            )}
                          </Td>
                          <Td><Badge tone={s.planningTrack === "245D.071" ? "accent" : "ok"}>{s.planningTrack}</Badge></Td>
                          <Td className="whitespace-nowrap text-xs text-muted-foreground">{s.cite}</Td>
                        </Tr>
                      )),
                    ];
                  })}
                </tbody>
              </Table>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
