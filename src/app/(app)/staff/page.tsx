import { requireUser } from "@/lib/auth";

export const metadata = { title: "Team" };

/**
 * The Team module has no list page of its own, exactly as Clients does not: the roster lives in
 * the panel beside the rail, and repeating it here would be the same names twice on one screen.
 * The compliance columns the old table carried are on /compliance, which is where they are acted on.
 */
export default async function StaffPage() {
  const user = await requireUser(["admin", "supervisor"]);
  const firstName = user.staffName?.split(" ")[0] ?? user.email.split("@")[0];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[32px] font-bold tracking-tight text-primary">Welcome, {firstName}</p>
    </div>
  );
}
