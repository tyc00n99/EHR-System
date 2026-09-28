import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { requireAbility } from "@/lib/auth";
import { createStaff } from "../actions";
import { StaffForm } from "../staff-form";

export default async function NewStaffPage() {
  await requireAbility("manage_staff");
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/staff">Staff</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New staff member" />
      <StaffForm action={createStaff} cancelHref="/staff" />
    </div>
  );
}
