import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb, schema } from "@/db";
import { audited } from "@/db/audited";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "ehr_session";
const SESSION_HOURS = 24 * 30; // 30 days; sessions are revocable server-side (users.active, sessions table)

export type Role = (typeof schema.userRole.enumValues)[number];

export interface CurrentUser {
  id: string;
  email: string;
  role: Role;
  staffId: string | null;
  staffName: string | null;
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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
  const valid = user && user.active && (await verifyPassword(password, user.passwordHash));
  if (!valid) return { ok: false, message: "Email or password is incorrect." };

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
