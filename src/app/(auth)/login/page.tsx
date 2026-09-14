import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage() {
  // Only a real session skips the form. With the login turned off you can still come here on
  // purpose and sign in as a supervisor or a caregiver to see the app the way they do.
  if (await getSessionUser()) redirect("/");
  return (
    <div className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
          <img src="/evvora-wordmark.svg" alt="EVVora" width={190} height={50} className="h-[50px] w-auto" />
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
