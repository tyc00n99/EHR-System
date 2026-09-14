import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { aiConfigured } from "@/lib/ai/extract-agreement";
import { requireUser } from "@/lib/auth";
import { createPerson } from "../actions";
import { IntakeReader } from "./intake-reader";

export const metadata = { title: "New client" };

export default async function NewClientPage() {
  await requireUser(["admin", "supervisor"]);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/clients">Clients</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New client" />
      <IntakeReader action={createPerson} aiReady={aiConfigured()} />
    </div>
  );
}
