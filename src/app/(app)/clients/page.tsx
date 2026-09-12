import { requireUser } from "@/lib/auth";

export const metadata = { title: "Clients" };

/**
 * The Clients module has no list page of its own: the caseload lives in the panel beside the rail,
 * so repeating it here would be the same names twice on one screen. What is left is a greeting.
 */
export default async function ClientsPage() {
  const user = await requireUser();
  const firstName = user.staffName?.split(" ")[0] ?? user.email.split("@")[0];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-[28px] font-medium tracking-tight text-primary">Welcome, {firstName}</p>
    </div>
  );
}
