import "server-only";
import { randomInt } from "node:crypto";
import type { Executor } from "@/db/audited";
import { audited } from "@/db/audited";
import { schema } from "@/db";
import { hashPassword } from "@/lib/password";
import { sendSms, signingCodeMessage, smsConfigured, toE164 } from "@/lib/sms";

/** Six-digit signing code the person keeps private and enters to co-sign shift notes. */
export function generateClientCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** How long a code stands before rotation offers to replace it. */
export const CODE_ROTATION_DAYS = 14;

export interface IssuedCode {
  code: string;
  /** True when the person was texted, so the caller knows whether staff must read it out. */
  texted: boolean;
  reason?: string;
}

/**
 * Issues a new signing code: stores only the hash, then texts it to the person when they have a
 * mobile number and texting is configured. Returns the plain code so the caller can show it once
 * to staff when it could not be delivered.
 */
export async function issueClientCode(
  db: Executor,
  actorId: string | null,
  person: { id: string; firstName: string; phone: string | null },
  orgName: string,
): Promise<IssuedCode> {
  const code = generateClientCode();
  const w = audited(db, { userId: actorId });
  const number = toE164(person.phone);
  const sms = number && smsConfigured() ? await sendSms(number, signingCodeMessage(orgName, person.firstName, code)) : { sent: false, reason: number ? "Texting is not configured." : "No mobile number on the client record." };
  await w.update(schema.people, person.id, {
    signatureCodeHash: await hashPassword(code),
    signatureCodeSetAt: new Date(),
    signatureCodeSentAt: sms.sent ? new Date() : null,
    signatureCodeSentTo: sms.sent ? number : null,
  });
  return { code, texted: sms.sent, reason: sms.reason };
}
