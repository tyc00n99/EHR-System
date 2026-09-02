import { Crumb, CrumbSep, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createSite } from "../actions";
import { SiteForm } from "../site-form";

export default async function NewSitePage() {
  await requireUser(["admin", "supervisor"]);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/sites">Sites and programs</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New site" />
      <SiteForm action={createSite} />
    </div>
  );
}
