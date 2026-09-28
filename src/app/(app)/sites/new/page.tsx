import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { requireAbility } from "@/lib/auth";
import { createSite } from "../actions";
import { SiteForm } from "../site-form";

export default async function NewSitePage() {
  await requireAbility("manage_sites");
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/sites">Sites and programs</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New site" />
      <SiteForm action={createSite} />
    </div>
  );
}
