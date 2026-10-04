import { ResetForm } from "./reset-form";

export const metadata = { title: "Set a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f4f4] px-4">
      <div className="w-[404px] max-w-full rounded-[22px] border border-[#e6e6e6] bg-[#fafafa] p-9 shadow-[0_24px_60px_-20px_rgba(6,56,74,0.25)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/evvora-wordmark.svg" alt="EVVora" width={84} height={22} className="h-[22px] w-auto" />
        <div className="mb-2 mt-5 text-[24px] font-bold leading-tight tracking-tight text-[#1a1a1a]">Set a new password</div>
        {token ? (
          <ResetForm token={token} />
        ) : (
          <p className="text-[14px] text-[#4b4b4b]">
            This page needs the link from your reset email. <a className="font-semibold text-[#0098c0] hover:underline" href="/forgot">Request a new one.</a>
          </p>
        )}
      </div>
    </div>
  );
}
