import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Forgot password" };

export default async function ForgotPage() {
  if (await getSessionUser()) redirect("/");
  const canEmail = emailConfigured();
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0efeb] px-4">
      <div className="w-[404px] max-w-full rounded-[22px] border border-[#e0dcd3] bg-[#f8f7f3] p-9 shadow-[0_24px_60px_-20px_rgba(6,56,74,0.25)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/evvora-wordmark.svg" alt="EVVora" width={84} height={22} className="h-[22px] w-auto" />
        <div className="mb-2 mt-5 text-[24px] font-bold leading-tight tracking-tight text-[#1b1818]">Reset your password</div>
        {canEmail ? (
          <>
            <p className="mb-6 text-[14px] text-[#4a4542]">Enter the email on your staff record and we&rsquo;ll send a link to set a new one.</p>
            <ForgotForm />
          </>
        ) : (
          <p className="mb-2 text-[14px] text-[#4a4542]">
            Password reset by email isn&rsquo;t set up on this deployment yet. Ask your administrator — they can set a new password for you from your staff record&rsquo;s Login tab.
          </p>
        )}
        <div className="mt-6 text-[13.5px] font-semibold text-[#0098c0]">
          <a href="/login" className="hover:underline">← Back to log in</a>
        </div>
      </div>
    </div>
  );
}
