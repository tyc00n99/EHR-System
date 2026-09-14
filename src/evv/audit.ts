/**
 * Append-only, hash-chained EVV audit. Each row's hash covers the previous row's hash for the
 * same visit (or for the tenant, for visit-less actions), so removing or editing a row breaks
 * the chain and `verifyChain` says where. Details are structured and PHI-free: ids, codes,
 * counts, never names or coordinates.
 */
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvCtx } from "./context";

/** JSON with sorted keys, so a jsonb round trip (which reorders keys) hashes the same. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  return `{${Object.keys(v as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

function hashRow(input: { orgId: string; evvVisitId: string | null; action: string; actorUserId: string | null; details: unknown; at: string; previousHash: string | null }): string {
  return createHash("sha256").update(stableStringify(input)).digest("hex");
}

export async function evvAudit(ctx: EvvCtx, action: string, evvVisitId: string | null, details: Record<string, unknown> = {}): Promise<void> {
  const where = evvVisitId ? and(eq(schema.evvAuditEvents.organizationId, ctx.orgId), eq(schema.evvAuditEvents.evvVisitId, evvVisitId)) : and(eq(schema.evvAuditEvents.organizationId, ctx.orgId), isNull(schema.evvAuditEvents.evvVisitId));
  const [prev] = await ctx.db.select({ hash: schema.evvAuditEvents.hash }).from(schema.evvAuditEvents).where(where).orderBy(desc(schema.evvAuditEvents.seq)).limit(1);
  const at = ctx.now();
  const hash = hashRow({ orgId: ctx.orgId, evvVisitId, action, actorUserId: ctx.actorUserId, details, at: at.toISOString(), previousHash: prev?.hash ?? null });
  // Direct insert on purpose: the audit table is itself the audit, and `audited()` would write a
  // second copy of every row into audit_log.
  await ctx.db.insert(schema.evvAuditEvents).values({ organizationId: ctx.orgId, evvVisitId, action, actorUserId: ctx.actorUserId, details, previousHash: prev?.hash ?? null, hash, at });
}

/** Walks a visit's chain and reports the first break, if any. */
export async function verifyChain(ctx: EvvCtx, evvVisitId: string): Promise<{ ok: boolean; rows: number; brokenAt?: string }> {
  const rows = await ctx.db.select().from(schema.evvAuditEvents).where(and(eq(schema.evvAuditEvents.organizationId, ctx.orgId), eq(schema.evvAuditEvents.evvVisitId, evvVisitId))).orderBy(schema.evvAuditEvents.seq);
  let prev: string | null = null;
  for (const r of rows) {
    const expect = hashRow({ orgId: r.organizationId, evvVisitId: r.evvVisitId, action: r.action, actorUserId: r.actorUserId, details: r.details ?? {}, at: r.at.toISOString(), previousHash: prev });
    if (r.previousHash !== prev || r.hash !== expect) return { ok: false, rows: rows.length, brokenAt: r.id };
    prev = r.hash;
  }
  return { ok: true, rows: rows.length };
}

/** SHA-256 over the immutable fields of an event row, stored beside it. */
export function eventIntegrityHash(e: { eventId: string; type: string; deviceCapturedAt: Date | null; serverReceivedAt: Date; effectiveAt: Date | null; locationEncrypted: string | null; verificationMethod: string; actorStaffId: string | null; evvVisitId: string }): string {
  return createHash("sha256").update(stableStringify({ ...e, deviceCapturedAt: e.deviceCapturedAt?.toISOString() ?? null, serverReceivedAt: e.serverReceivedAt.toISOString(), effectiveAt: e.effectiveAt?.toISOString() ?? null })).digest("hex");
}
