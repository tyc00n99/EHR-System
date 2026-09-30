import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { oauthProviders } from "@/lib/oauth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

// This page deliberately wears the public website's palette (Hubble paper/navy), not the app
// theme — it is the doorway between the two. The hexes below are the site's tokens.
const PAPER = "#f0efeb";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.4 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.1 0 11.2-2 15-5.5l-7.5-5.8c-2.1 1.4-4.7 2.2-7.5 2.2-6.3 0-11.7-3.9-13.6-9.6l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function MicrosoftMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 23 23" aria-hidden>
      <rect width="10" height="10" x="1" y="1" fill="#F25022" />
      <rect width="10" height="10" x="12" y="1" fill="#7FBA00" />
      <rect width="10" height="10" x="1" y="12" fill="#00A4EF" />
      <rect width="10" height="10" x="12" y="12" fill="#FFB900" />
    </svg>
  );
}

const MARKS = { google: <GoogleMark />, microsoft: <MicrosoftMark /> };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reset?: string }> }) {
  // Only a real session skips the form. With the login turned off you can still come here on
  // purpose and sign in as a supervisor or a caregiver to see the app the way they do.
  if (await getSessionUser()) redirect("/");
  const sp = await searchParams;
  const providers = oauthProviders();

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10" style={{ background: PAPER }}>
      {/* The product, out of focus behind the door: your agency is one password away. Sample data only. */}
      <div aria-hidden className="absolute -inset-10 opacity-55 blur-[3px]">
        <div className="absolute inset-x-[4%] top-[6%] -bottom-[8%] rounded-3xl border border-[#e0dcd3] bg-[#fbfaf7] px-8 py-7 shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[#e0dcd3] pb-4">
            <span className="grid size-10 place-items-center rounded-full bg-[#dff3fa] text-[13px] font-bold text-[#0098c0]">KN</span>
            <div>
              <div className="text-[16px] font-bold text-[#1b1818]">Kevin Nguyen</div>
              <div className="text-[12.5px] font-medium text-[#767068]">PMI 12345678 · Client since Jul 1, 2026</div>
            </div>
          </div>
          {["62%", "84%", "71%", "78%", "52%", "66%"].map((w, i) => (
            <div key={i} className="mt-[18px] h-[15px] rounded-[7px] bg-[#edeae2]" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(${PAPER}59, ${PAPER}c0)` }} />

      <div className="relative w-[404px] max-w-full">
      <div className="rounded-[22px] border border-[#e0dcd3] bg-[#f8f7f3] p-9 shadow-[0_40px_100px_-24px_rgba(6,56,74,0.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand asset */}
        <img src="/evvora-wordmark.svg" alt="EVVora" width={84} height={22} className="h-[22px] w-auto" />
        <div className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#0098c0]">Welcome back</div>
        <div className="mb-6 mt-1 text-[26px] font-bold leading-tight tracking-tight text-[#1b1818]">Your agency is waiting.</div>

        {sp.reset === "1" && <p className="mb-4 rounded-lg bg-[#e3efe6] px-3 py-2 text-[13.5px] font-medium text-[#1f7a55]">Your password is updated. Log in with it here.</p>}
        {sp.error && <p className="mb-4 rounded-lg bg-[#f6e3dc] px-3 py-2 text-[13.5px] font-medium text-[#b8412f]">{sp.error}</p>}

        <LoginForm />

        {providers.length > 0 && (
          <>
            <div className="my-5 flex items-center gap-3 text-[12.5px] font-medium text-[#767068]">
              <span className="h-px flex-1 bg-[#e0dcd3]" />
              Or
              <span className="h-px flex-1 bg-[#e0dcd3]" />
            </div>
            <div className="space-y-2.5">
              {providers.map((p) => (
                <a
                  key={p.provider}
                  href={`/api/auth/${p.provider}`}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-[#d6d1c7] bg-white text-[14.5px] font-semibold text-[#1b1818] transition-colors hover:bg-[#f0efeb]"
                >
                  {MARKS[p.provider]}
                  Sign in with {p.label}
                </a>
              ))}
            </div>
          </>
        )}
      </div>

      {/* The trust row under the door: the claims a buyer checks before the password goes in. */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13px] font-medium text-[#5d6b70]">
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2.6l7.4 3v5.2c0 4.9-3.1 8.6-7.4 10.6-4.3-2-7.4-5.7-7.4-10.6V5.6l7.4-3z" />
          </svg>
          HIPAA Compliant
        </span>
        <span aria-hidden className="text-[#b9c0c3]">·</span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
            <path d="M14 3v5h5" />
            <path d="M9.3 14.2l1.9 1.9 3.5-4" />
          </svg>
          Audit Ready
        </span>
        <span aria-hidden className="text-[#b9c0c3]">·</span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 11.5L12 4l9 7.5" />
            <path d="M5.5 9.8V20h13V9.8" />
            <path d="M9.5 20v-6h5v6" />
          </svg>
          Built for 245D Home &amp; Community-Based Services
        </span>
      </div>
      </div>
    </div>
  );
}
