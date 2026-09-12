import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Field-level encryption for the few values that must never sit in plain text
 * (SSN). AES-256-GCM with a key from DATA_ENCRYPTION_KEY (64 hex characters).
 */
function key(): Buffer {
  // Trimmed and unquoted because a key pasted into a hosting dashboard usually arrives with a
  // trailing newline or a pair of quotes attached, and a key that is right but untrimmed looks
  // exactly like a key that is missing. The length is named in the error for the same reason:
  // "got 65 characters" tells you it is the newline, without printing the key itself.
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim().replace(/^["']|["']$/g, "");
  if (!raw) throw new Error("DATA_ENCRYPTION_KEY is not set. See .env.example.");
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(`DATA_ENCRYPTION_KEY must be 64 hex characters; got ${raw.length} character${raw.length === 1 ? "" : "s"}. See .env.example.`);
  }
  return Buffer.from(raw, "hex");
}

export function encryptField(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64")}`;
}

export function decryptField(stored: string): string {
  if (!stored.startsWith("v1:")) throw new Error("Unknown ciphertext format");
  const buf = Buffer.from(stored.slice(3), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function formatSsn(digits: string): string {
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}
