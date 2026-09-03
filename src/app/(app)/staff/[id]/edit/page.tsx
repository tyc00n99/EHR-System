import { notFound } from "next/navigation";
import { Crumb, CrumbSep, PageHeader } from "@/components/kit";
import { getStaff } from "@/db/queries";
import { requireUser } from "@/lib/auth";
import { updateStaff } from "../../actions";
import { StaffForm } from "../../staff-form";

export default async function EditStaffPage({ params }: PageProps<"/staff/[id]/edit">) {
  await requireUser(["admin"]);
  const { id } = await params;
  const s = await getStaff(id);
  if (!s) notFound();
  return (
    <div>
      <PageHeader eyebrow={<><Crumb href="/staff">Staff</Crumb><CrumbSep /><Crumb href={`/staff/${id}`}>{s.firstName} {s.lastName}</Crumb><CrumbSep /><Crumb>Edit</Crumb></>} title={`${s.firstName} ${s.lastName}`} meta={<span>{s.title}</span>} />
      <StaffForm action={updateStaff.bind(null, id)} defaults={s} cancelHref={`/staff/${id}`} />
    </div>
  );
}
