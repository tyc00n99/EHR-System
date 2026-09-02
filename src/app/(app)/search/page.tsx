import Link from "next/link";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { listAgreementsWithUsage, listPeople, listStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  await requireUser(["admin", "supervisor"]);
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim().toLowerCase();
  const [people, staff, agreements] = q ? await Promise.all([listPeople(), listStaff(), listAgreementsWithUsage()]) : [[], [], []];
  const hit = (...fields: (string | null | undefined)[]) => fields.some((f) => f && f.toLowerCase().includes(q));
  const clients = people.filter((p) => hit(p.firstName, p.lastName, p.preferredName, p.pmi, p.email, p.county, p.caseManagerName));
  const staffHits = staff.filter((s) => hit(s.firstName, s.lastName, s.email, s.npi, s.umpi, s.title));
  const agreementHits = agreements.filter((a) => hit(a.agreement.agreementNumber, a.agreement.serviceCode));
  const total = clients.length + staffHits.length + agreementHits.length;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={q ? `Results for “${q}”` : "Search"} meta={<span>{q ? `${total} match${total === 1 ? "" : "es"} across clients, staff, and agreements` : "Type in the search box above to find a client, staff member, PMI, or agreement number."}</span>} />
      {q && total === 0 && <Card><Empty icon="search" title="No matches">Try a last name, a PMI number, or an agreement number.</Empty></Card>}
      <div className="space-y-4">
        {clients.length > 0 && <Card title="Clients" actions={<Badge>{clients.length}</Badge>}><ul className="divide-y divide-line-soft">{clients.map((p) => <li key={p.id}><Link href={`/clients/${p.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-hover"><span><span className="font-medium text-text-strong">{fullName(p)}</span><span className="ml-2 text-[13px] text-muted tabular-nums">PMI {p.pmi} · {p.waiverProgram} · {p.county}</span></span><Badge tone={p.status === "active" ? "ok" : p.status === "intake" ? "accent" : "neutral"}>{p.status}</Badge></Link></li>)}</ul></Card>}
        {staffHits.length > 0 && <Card title="Staff" actions={<Badge>{staffHits.length}</Badge>}><ul className="divide-y divide-line-soft">{staffHits.map((s) => <li key={s.id}><Link href={`/staff/${s.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-hover"><span><span className="font-medium text-text-strong">{s.firstName} {s.lastName}</span><span className="ml-2 text-[13px] text-muted">{s.title}</span></span><Badge tone={s.active ? "ok" : "neutral"}>{s.active ? "active" : "inactive"}</Badge></Link></li>)}</ul></Card>}
        {agreementHits.length > 0 && <Card title="Service agreements" actions={<Badge>{agreementHits.length}</Badge>}><ul className="divide-y divide-line-soft">{agreementHits.map((a) => <li key={a.agreement.id}><Link href={`/clients/${a.agreement.personId}?tab=authorizations`} className="flex items-center justify-between px-5 py-3 hover:bg-hover"><span><span className="font-medium text-text-strong tabular-nums">{a.agreement.agreementNumber}</span><span className="ml-2 text-[13px] text-muted">{a.personFirst} {a.personLast} · {a.agreement.serviceCode} {a.agreement.modifiers.join(" ")}</span></span><Badge tone={a.agreement.status === "active" ? "ok" : "neutral"}>{a.agreement.status}</Badge></Link></li>)}</ul></Card>}
      </div>
    </div>
  );
}
