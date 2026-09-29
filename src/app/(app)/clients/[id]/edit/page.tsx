import { notFound } from "next/navigation";
import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { getPerson } from "@/db/queries";
import { requireAbility } from "@/lib/auth";
import { fullName } from "@/lib/format";
import { updatePerson } from "../../actions";
import { PersonForm } from "../../person-form";

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  await requireAbility("manage_people");
  const { id } = await params;
  const person = await getPerson(id);
  if (!person) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader eyebrow={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb href={`/clients/${id}`}>{fullName(person)}</Crumb><CrumbSep /><Crumb>Edit</Crumb></>} title={`Edit ${fullName(person)}`} />
      <PersonForm action={updatePerson.bind(null, id)} defaults={person} cancelHref={`/clients/${id}`} />
    </div>
  );
}
