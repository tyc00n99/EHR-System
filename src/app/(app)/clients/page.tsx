import { listAssignmentsForStaff, listPeople } from "@/db/queries";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Clients" };

/**
 * The Clients module has no list page of its own: the caseload lives in the panel beside the rail,
 * so repeating it here would be the same names twice on one screen. What is left is a greeting and
 * the one number worth knowing before you pick somebody.
 */
export default async function ClientsPage() {
  const user = await requireUser();
  const people = user.role === "dsp"
    ? (user.staffId ? (await listAssignmentsForStaff(user.staffId)).filter((a) => a.assignment.active).map((a) => a.person) : [])
    : await listPeople();
  const active = people.filter((p) => p.status === "active").length;
  const firstName = user.staffName?.split(" ")[0] ?? user.email.split("@")[0];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[28px] font-medium tracking-tight text-primary">Welcome, {firstName}</p>
      <p className="mt-3 max-w-sm text-[13.5px] text-muted-foreground">
        {people.length === 0
          ? "No clients yet. Add the first one from the list on the left."
          : <>{people.length} {people.length === 1 ? "person" : "people"} served · {active} active. Pick someone from the list to open their record.</>}
      </p>
    </div>
  );
}
