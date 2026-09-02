import { Crumb, CrumbSep, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createStaff } from "../actions";
import { StaffForm } from "../staff-form";

export default async function NewStaffPage() {
  await requireUser(["admin"]);
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/staff">Staff</Crumb><CrumbSep /><Crumb>New</Crumb></>} title="New staff member" />
      <StaffForm action={createStaff} cancelHref="/staff" />
    </div>
  );
}
