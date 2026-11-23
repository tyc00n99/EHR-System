/**
 * Build-time password recovery for a hosted database nobody can sign in to.
 * Runs after migrations on every build, and does nothing unless both
 * ADMIN_RESET_EMAIL and ADMIN_RESET_PASSWORD are set. Each password is applied
 * once: the audit log keeps a fingerprint of it, so later builds with the same
 * variables leave a password the person has since changed alone. Delete the two
 * variables once you are signed in.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db/index";
import { hashPassword } from "../src/lib/password";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

async function main() {
  const email = process.env.ADMIN_RESET_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_RESET_PASSWORD?.trim();
  if (!email || !password) return;
  if (password.length < 10) { console.error("[reset-admin] ADMIN_RESET_PASSWORD must be at least 10 characters; skipped."); return; }

  const db = await getDb();
  const logins = await db.select({ email: schema.users.email, role: schema.users.role, active: schema.users.active }).from(schema.users);
  console.log(`[reset-admin] logins: ${logins.map((u) => `${u.email} (${u.role}${u.active ? "" : ", inactive"})`).join(", ")}`);

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.email}) = ${email}`).limit(1);
  if (!user) { console.error(`[reset-admin] no login for ${email}; nothing changed.`); return; }

  const fingerprint = createHash("sha256").update(`${email}:${password}`).digest("hex").slice(0, 16);
  const [done] = await db
    .select({ id: schema.auditLog.id })
    .from(schema.auditLog)
    .where(and(eq(schema.auditLog.tableName, "users"), eq(schema.auditLog.recordId, user.id), sql`${schema.auditLog.after}->>'resetFingerprint' = ${fingerprint}`))
    .limit(1);
  if (done) { console.log(`[reset-admin] this password was already applied to ${email}; left alone.`); return; }

  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.users)
      .set({ passwordHash, active: true, failedLogins: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id));
    await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
    await tx.insert(schema.auditLog).values({
      actorUserId: null,
      action: "update",
      tableName: "users",
      recordId: user.id,
      after: { passwordReset: true, via: "build", resetFingerprint: fingerprint },
    });
  });
  console.log(`[reset-admin] password reset and lockout cleared for ${email}.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
