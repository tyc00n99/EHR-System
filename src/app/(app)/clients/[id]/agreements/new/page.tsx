import { notFound } from "next/navigation";
import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { getPerson } from "@/db/queries";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { requireUser } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { createAgreement, extractAgreement } from "../../../actions";
import { AgreementForm } from "./agreement-form";

export default async function NewAgreementPage({ params }: PageProps<"/clients/[id]/agreements/new">) {
  await requireUser(["admin", "supervisor"]);
  const { id } = await params;
  const person = await getPerson(id);
  if (!person) notFound();
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>New service agreement</Crumb></>} title="New service agreement" meta={<span>{fullName(person)} · PMI {person.pmi}</span>} />
      <AgreementForm action={createAgreement.bind(null, id)} extract={extractAgreement.bind(null, id)} cancelHref={`/clients/${id}`} defaultCounty={person.county} aiReady={aiConfigured()} />
    </div>
  );
}
