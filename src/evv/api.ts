/**
 * HTTP plumbing for the EVV routes: who is calling, which tenant, what they may do, and how
 * errors come back. Reads the session from the cookie *or* an `Authorization: Bearer` header
 * carrying the same session token, so the caregiver app can use the login endpoint's token
 * without a cookie jar. Nothing here touches `next/headers`, so it is testable and reusable.
 */
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { SESSION_COOKIE, loginRequired, type CurrentUser, type Role } from "@/lib/auth";
import { defaultOrganizationId, makeCtx, type EvvCtx } from "./context";
import { hasEvvPermission, type EvvPermission } from "./permissions";
import { EvvError } from "./visits";

export interface EvvRequestContext { ctx: EvvCtx; user: CurrentUser }

function tokenFrom(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim() || null;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.split(/;\s*/).map((c) => c.split("=")).find(([k]) => k === SESSION_COOKIE);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

async function userFromToken(token: string): Promise<CurrentUser | null> {
  const db = await getDb();
  const [r] = await db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, staffId: schema.users.staffId, firstName: schema.staff.firstName, lastName: schema.staff.lastName })
    .from(schema.sessions).innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id)).leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id))
    .where(and(eq(schema.sessions.id, token), gt(schema.sessions.expiresAt, new Date()), eq(schema.users.active, true))).limit(1);
  return r ? { id: r.id, email: r.email, role: r.role, staffId: r.staffId, staffName: r.firstName ? `${r.firstName} ${r.lastName}` : null } : null;
}

/** Same open-access fallback the pages use when REQUIRE_LOGIN is off: the first active admin. */
async function openAccessUser(): Promise<CurrentUser | null> {
  if (loginRequired()) return null;
  const db = await getDb();
  const [r] = await db.select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, staffId: schema.users.staffId, firstName: schema.staff.firstName, lastName: schema.staff.lastName })
    .from(schema.users).leftJoin(schema.staff, eq(schema.users.staffId, schema.staff.id)).where(and(eq(schema.users.role, "admin"), eq(schema.users.active, true))).limit(1);
  return r ? { id: r.id, email: r.email, role: r.role, staffId: r.staffId, staffName: r.firstName ? `${r.firstName} ${r.lastName}` : null } : null;
}

/* ---------- rate limiting ---------- */

const buckets = new Map<string, { tokens: number; at: number }>();
const RATE = { capacity: 60, refillPerSecond: 1 };

/** Token bucket per caller, per process. On serverless each instance has its own; the
 *  idempotency keys are what make a burst harmless, this keeps it cheap. */
export function rateLimit(key: string, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: RATE.capacity, at: now };
  b.tokens = Math.min(RATE.capacity, b.tokens + ((now - b.at) / 1000) * RATE.refillPerSecond);
  b.at = now;
  if (b.tokens < 1) { buckets.set(key, b); return false; }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) buckets.clear();
  return true;
}

/* ---------- request → context ---------- */

export async function authenticate(req: Request, permission: EvvPermission): Promise<EvvRequestContext> {
  const token = tokenFrom(req);
  const user = (token ? await userFromToken(token) : null) ?? (await openAccessUser());
  if (!user) throw new EvvError(401, "UNAUTHENTICATED", "Sign in to use the EVV API.");
  if (!rateLimit(user.id)) throw new EvvError(429, "RATE_LIMITED", "Too many requests. Try again in a moment.");
  if (!hasEvvPermission(user, permission)) throw new EvvError(403, "FORBIDDEN", `This action needs ${permission}.`);
  const db = await getDb();
  const orgId = await defaultOrganizationId(db);
  return { ctx: makeCtx(db, orgId, user.id), user };
}

export function actorFor(user: CurrentUser, staffIdOverride?: string | null): { userId: string; staffId: string; role: Role } {
  const staffId = user.role === "dsp" ? user.staffId : (staffIdOverride ?? user.staffId);
  if (!staffId) throw new EvvError(422, "STAFF_REQUIRED", "A caregiver must be named for this event.");
  return { userId: user.id, staffId, role: user.role };
}

export async function readJson(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { throw new EvvError(400, "BAD_JSON", "Body must be JSON."); }
}

export function ok(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

/** Errors are structured, never stack traces, never PHI. */
export function fail(e: unknown): Response {
  if (e instanceof EvvError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { "cache-control": "no-store" } });
  if (e instanceof z.ZodError) return Response.json({ error: { code: "VALIDATION", message: "Check the request fields.", fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) } }, { status: 422, headers: { "cache-control": "no-store" } });
  console.error("evv api error:", e instanceof Error ? e.message : "unknown");
  return Response.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500, headers: { "cache-control": "no-store" } });
}

export function requireCron(req: Request): void {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const given = auth?.startsWith("Bearer ") ? auth.slice(7) : new URL(req.url).searchParams.get("key");
  if (!secret || given !== secret) throw new EvvError(401, "UNAUTHENTICATED", "Not authorised.");
}

/** Caregivers may only look at their own visits. */
export function assertMayView(user: CurrentUser, visit: { staffId: string }): void {
  if (hasEvvPermission(user, "evv.view_all")) return;
  if (user.staffId && user.staffId === visit.staffId) return;
  throw new EvvError(404, "VISIT_NOT_FOUND", "Visit not found.");
}
