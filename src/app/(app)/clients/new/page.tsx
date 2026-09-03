import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { requireUser } from "@/lib/auth";
import { createPerson } from "../actions";
import { PersonForm } from "../person-form";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireUser(["admin", "supervisor"]);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New client" />
      <PersonForm action={createPerson} cancelHref="/clients" />
    </div>
  );
}
