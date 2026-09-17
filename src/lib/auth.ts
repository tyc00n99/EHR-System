import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { lockDurationMs } from "./lockout";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "ehr_session";
const SESSION_HOURS = 24 * 30; // 30 days; sessions are revocable server-side (users.active, sessions table)

/**
 * Whether this deployment asks for a password.
 *
 * Off by default so the hosted link opens straight into the app. Everyone then arrives as the
 * first admin, which means every record — PMI numbers, dates of birth, addresses, medications —
 * is readable by anyone holding the URL. That is fine for the sample data in the seed, and it is a
 * reportable breach the day a real client is entered, so set REQUIRE_LOGIN=1 in Vercel before
 * anyone real goes in. Signing in still works either way: /login stays reachable, which is how you
 * look at the app as a supervisor or a caregiver.
 */
export function loginRequired(): boolean {
  // Production always requires a login; the open-access fallback exists for local development only,
  // so a redeploy that forgets the flag can never expose records.
  return process.env.NODE_ENV === "production" || process.env.REQUIRE_LOGIN === "1";
}

// A hash to verify against when the email is unknown, so a wrong email costs the same time as a wrong password.
const DECOY_HASH = "scrypt$00000000000000000000000000000000$" + "0".repeat(128);

export type Role = (typeof schema.userRole.enumValues)[number];

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  staffId: string | null;
  staffName: string | null;
}

/** The user a real session cookie names, with no open-access fallback. */
export const getSessionUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      role: schema.users.role,
      staffId: schema.users.staffId,
      firstName: schema.staff.firstName,
      lastName: schema.staff.lastName,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id))
    .where(and(eq(schema.sessions.id, token), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    role: r.role,
    staffId: r.staffId,
    staffName: r.firstName ? `${r.firstName} ${r.lastName}` : null,
  };
});

/** The account an open-access visitor arrives as: the first active admin on the org. */
const firstAdmin = cache(async (): Promise<CurrentUser | null> => {
  const db = await getDb();
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, staffId: schema.users.staffId, firstName: schema.staff.firstName, lastName: schema.staff.lastName })
    .from(schema.users)
    .leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id))
    .where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true)))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { id: r.id, email: r.email, role: r.role, staffId: r.staffId, staffName: r.firstName ? `${r.firstName} ${r.lastName}` : null };
});

/** Who this request counts as. Falls back to the admin when the login is turned off. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const signedIn = await getSessionUser();
  if (signedIn) return signedIn;
  return loginRequired() ? null : await firstAdmin();
});

/** Redirects to /login when signed out, or to / when the role is not allowed. */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/?denied=1");
  return user;
}

export function can(user: CurrentUser, action: "manage_people" | "manage_staff" | "manage_sites" | "edit_visits" | "clock"): boolean {
  switch (action) {
    case "manage_people":
    case "manage_sites":
    case "edit_visits":
      return user.role === "admin" || user.role === "supervisor";
    case "manage_staff":
      return user.role === "admin";
    case "clock":
      return user.staffId !== null;
  }
}

export async function signIn(email: string, password: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .limit(1);
  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    return { ok: false, message: `Too many failed sign-ins. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }
  const valid = (await verifyPassword(password, user?.passwordHash ?? DECOY_HASH)) && Boolean(user && user.active);
  if (!valid) {
    if (user) {
      const failures = user.failedLogins + 1;
      const lockMs = lockDurationMs(failures);
      await db.update(schema.users).set({ failedLogins: failures, lockedUntil: lockMs ? new Date(Date.now() + lockMs) : null }).where(eq(schema.users.id, user.id));
      if (lockMs) await audited(db, { userId: user.id }).event("login", user.id, "users", { locked: true, failures, minutes: lockMs / 60_000 });
    }
    return { ok: false, message: "Email or password is incorrect." };
  }
  if (user.failedLogins > 0 || user.lockedUntil) await db.update(schema.users).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.users.id, user.id));

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({ id: token, userId: user.id, expiresAt });
  await audited(db, { userId: user.id }).event("login", user.id);

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, token)).limit(1);
    await db.delete(schema.sessions).where(eq(schema.sessions.id, token));
    if (s) await audited(db, { userId: s.userId }).event("logout", s.userId);
  }
  jar.delete(SESSION_COOKIE);
}
