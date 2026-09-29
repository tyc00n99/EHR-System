import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { requireAbility } from "@/lib/auth";
import { createStaff } from "../actions";
import { StaffForm } from "../staff-form";

export default async function NewStaffPage() {
  await requireAbility("manage_staff");
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader eyebrow={<><Crumb href="/staff">Team</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New team member" />
      <StaffForm action={createStaff} cancelHref="/staff" />
    </div>
  );
}
