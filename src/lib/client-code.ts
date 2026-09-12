import "server-only";
import { randomInt } from "node:crypto";
import type { Executor } from "@/db/audited";
import { audited } from "@/db/audited";
import { schema } from "@/db";
import { encryptField } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { sendSms, signingCodeMessage, smsConfigured, toE164 } from "@/lib/sms";

/** Six-digit signing code the person keeps private and enters to co-sign shift notes. */
export function generateClientCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** How long a code stands before the weekly job replaces it. */
export const CODE_ROTATION_DAYS = 7;

export interface IssuedCode {
  code: string;
  /** True when the person was texted, so the caller knows whether staff must read it out. */
  texted: boolean;
  reason?: string;
  /** Set when the code was issued but could not be stored for later reference. */
  referenceError?: string;
}

/**
 * Issues a new signing code: stores only the hash, then texts it to the person when they have a
 * mobile number and texting is configured. Returns the plain code so the caller can show it once
 * to staff when it could not be delivered.
 */
export async function issueClientCode(
  db: Executor,
  actorId: string | null,
  person: { id: string; firstName: string; phone: string | null; smsConsent?: boolean },
  orgName: string,
): Promise<IssuedCode> {
  const code = generateClientCode();
  const w = audited(db, { userId: actorId });
  const number = toE164(person.phone);
  const canText = Boolean(number) && person.smsConsent !== false && smsConfigured();
  const sms = canText
    ? await sendSms(number!, signingCodeMessage(orgName, person.firstName, code))
    : { sent: false, reason: !number ? "No mobile number on the client record." : person.smsConsent === false ? "The client has not agreed to receive texts." : "Texting is not configured." };
  // The hash is what signing checks, so it is issued even when the readable reference cannot be
  // written. Losing the reference is an inconvenience; refusing to issue a code stops the client
  // signing their next note.
  let reference: string | null = null;
  let referenceError: string | undefined;
  try {
    reference = encryptField(code);
  } catch (e) {
    referenceError = e instanceof Error ? e.message : "The signing code could not be stored for later reference.";
  }
  await w.update(schema.people, person.id, {
    signatureCodeHash: await hashPassword(code),
    // Kept recoverable so an admin can read it back to a client who has forgotten it.
    signatureCodeEncrypted: reference,
    signatureCodeSetAt: new Date(),
    signatureCodeSentAt: sms.sent ? new Date() : null,
    signatureCodeSentTo: sms.sent ? number : null,
  });
  return { code, texted: sms.sent, reason: sms.reason, referenceError };
}
