import "server-only";

/**
 * Text messages, currently through Twilio. Unconfigured, every send is a no-op that reports why,
 * so the app works without an account and nothing silently pretends a message went out.
 *
 * Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM to turn it on.
 */

export interface SmsResult {
  sent: boolean;
  /** Provider message id when sent, so it can be recorded in the audit log. */
  id?: string;
  reason?: string;
}

export function smsConfigured(): boolean {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);
}

/** Digits only, with a leading +1 for the ten-digit US numbers this app collects. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  if (raw.trim().startsWith("+") && d.length >= 8) return `+${d}`;
  return null;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const number = toE164(to);
  if (!number) return { sent: false, reason: "The phone number is not a number we can text." };
  if (!smsConfigured()) return { sent: false, reason: "Texting is off. An admin can turn it on by adding the Twilio settings to the app's environment." };

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN!}`).toString("base64");
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: number, From: process.env.TWILIO_FROM!, Body: body }),
    });
    const json = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { sent: false, reason: json.message ?? `Twilio returned ${res.status}.` };
    return { sent: true, id: json.sid };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "The message could not be sent." };
  }
}

/** The only message this app sends. Kept here so the wording is reviewed in one place. */
export function signingCodeMessage(org: string, firstName: string, code: string): string {
  return `${firstName}, your ${org} signing code is ${code}. Enter it on your caregiver's phone to sign each visit note. Do not share it with anyone, including staff.`;
}
