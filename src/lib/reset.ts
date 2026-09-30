import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { emailConfigured, sendEmail } from "./email";
import { hashPassword } from "./password";

/**
 * Password reset by emailed link (Sept 30, 2026). The token is 32 random bytes; only its SHA-256
 * lands in `password_resets`, so the database never holds anything a link can be rebuilt from.
 * Tokens live 30 minutes and are single-use. `requestPasswordReset` answers identically whether
 * or not the email exists — the form must never confirm which emails have logins.
 */
const TOKEN_MINUTES = 30;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export { emailConfigured };

export async function requestPasswordReset(email: string, origin: string): Promise<void> {
  if (!emailConfigured()) return;
  const db = await getDb();
  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, active: schema.users.active })
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .limit(1);
  if (!user || !user.active) return;

  const token = randomBytes(32).toString("base64url");
  await db.insert(schema.passwordResets).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_MINUTES * 60_000),
  });

  const link = `${origin}/reset?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: "Reset your EVVora password",
    text: `Someone asked to reset the password for this EVVora login.\n\nSet a new password here (the link works for ${TOKEN_MINUTES} minutes):\n${link}\n\nIf this wasn't you, you can ignore this email — nothing has changed.`,
  });
}

export async function completePasswordReset(token: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.passwordResets)
    .where(and(eq(schema.passwordResets.tokenHash, hashToken(token)), isNull(schema.passwordResets.usedAt), gt(schema.passwordResets.expiresAt, new Date())))
    .limit(1);
  if (!row) return { ok: false, message: "This reset link has expired or was already used. Request a new one." };

  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.id, row.id));
  // The user resets their own password, so they are the audited actor; the audit row shows the change.
  await audited(db, { userId: row.userId }).update(schema.users, row.userId, {
    passwordHash: await hashPassword(password),
    failedLogins: 0,
    lockedUntil: null,
  });
  return { ok: true };
}
