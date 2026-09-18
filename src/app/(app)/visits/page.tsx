import { Crumb, CrumbSep, LinkButton, PageHeader } from "@/components/kit";
import { VisitsTable } from "./visits-table";
import { VisitTotals } from "./visit-totals";
import { VisitSheet } from "./record/visit-sheet";
import { getPerson } from "@/db/queries";
import { can, requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { buildVisitTable } from "@/lib/visit-table";

export const metadata = { title: "Notes" };



export default async function VisitsPage({ searchParams }: PageProps<"/visits">) {
  const user = await requireUser();
  const sp = await searchParams;
  const personId = typeof sp.person === "string" ? sp.person : undefined;
  const person = personId ? await getPerson(personId) : null;
  const vt = await buildVisitTable({ sp, personId, staffId: user.role === "dsp" ? (user.staffId ?? undefined) : undefined });
  const title = person ? `Notes for ${fullName(person)}` : user.role === "dsp" ? "My notes" : "Notes";
  const openVisit = typeof sp.visit === "string" ? sp.visit : null;
  const exportQ = `${vt.range.param}${vt.single.staff ? `&staff=${vt.single.staff}` : ""}`;
  return (
    <div>
      {openVisit && <VisitSheet id={openVisit} />}
      <PageHeader
        eyebrow={person && <><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${person.id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>Notes</Crumb></>}
        title={title}
        meta={<VisitTotals t={vt.totals} />}
        actions={can(user, "edit_visits") && <LinkButton href="/visits/new" variant="outline">Enter a note manually</LinkButton>}
      />
      <VisitsTable rows={vt.rows} filters={vt.filters} options={vt.options} presets={vt.presets} base={{ path: "/visits", keep: personId ? { person: personId } : {} }} showClient={!person} exportCsv={can(user, "edit_visits") ? `/reports/visits.csv?${exportQ}` : undefined} exportPdf={can(user, "edit_visits") ? `/reports/visits.pdf?${exportQ}` : undefined} />
    </div>
  );
}

