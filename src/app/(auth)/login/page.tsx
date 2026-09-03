import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">D</span>
          <span className="text-lg font-semibold tracking-tight text-text-strong">245D EHR</span>
        </div>
        <div className="rounded-xl border border-line bg-card p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2>Log in</h2>
          <p className="mb-5 mt-1 text-[13px] text-muted-foreground">Use the email on your staff record.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
