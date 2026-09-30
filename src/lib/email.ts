import "server-only";

/**
 * Outbound email (Sept 30, 2026), used by the password-reset flow. Resend's REST API, no SDK —
 * the same shape as sms.ts with Twilio. Configure RESEND_API_KEY (and optionally MAIL_FROM) in
 * Vercel; without a key `emailConfigured()` is false and callers say so instead of failing.
 */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: { to: string; subject: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { ok: false, error: "Email is not configured (RESEND_API_KEY)." };
  const from = process.env.MAIL_FROM || "EVVora <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("[email] send failed", res.status, body.slice(0, 300));
      return { ok: false, error: `Email send failed (${res.status}).` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] send failed", err instanceof Error ? err.message : err);
    return { ok: false, error: "Email send failed." };
  }
}
