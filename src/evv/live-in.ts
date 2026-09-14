/**
 * Live-in caregiver relationships. The exemption exists only when a relationship row covers the
 * date; the engine checks that, not a flag on the visit, so a manual visit cannot claim it.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { evvAudit } from "./audit";
import { writer, type EvvCtx } from "./context";
import { EvvError } from "./visits";

export const liveInSchema = z.object({
  personId: z.uuid(),
  staffId: z.uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  documentationRef: z.string().min(3).max(500),
  note: z.string().max(1000).optional(),
}).refine((r) => !r.effectiveTo || r.effectiveTo >= r.effectiveFrom, { message: "End must be on or after start", path: ["effectiveTo"] });

export async function createLiveInRelationship(ctx: EvvCtx, raw: unknown) {
  const input = liveInSchema.parse(raw);
  const [person] = await ctx.db.select({ id: schema.people.id }).from(schema.people).where(eq(schema.people.id, input.personId)).limit(1);
  const [member] = await ctx.db.select({ id: schema.staff.id }).from(schema.staff).where(eq(schema.staff.id, input.staffId)).limit(1);
  if (!person || !member) throw new EvvError(404, "NOT_FOUND", "Client or caregiver not found.");
  const row = await writer(ctx).insert(schema.evvLiveInRelationships, { organizationId: ctx.orgId, ...input, effectiveTo: input.effectiveTo ?? null, note: input.note ?? null, approvedBy: ctx.actorUserId });
  await evvAudit(ctx, "live_in.create", null, { relationshipId: row.id, effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo });
  return row;
}

export async function endLiveInRelationship(ctx: EvvCtx, id: string, effectiveTo: string) {
  const [row] = await ctx.db.select().from(schema.evvLiveInRelationships).where(and(eq(schema.evvLiveInRelationships.id, id), eq(schema.evvLiveInRelationships.organizationId, ctx.orgId))).limit(1);
  if (!row) throw new EvvError(404, "NOT_FOUND", "Relationship not found.");
  const updated = await writer(ctx).update(schema.evvLiveInRelationships, id, { effectiveTo, active: effectiveTo >= row.effectiveFrom });
  await evvAudit(ctx, "live_in.end", null, { relationshipId: id, effectiveTo });
  return updated;
}

export async function listLiveInRelationships(ctx: EvvCtx) {
  return ctx.db.select().from(schema.evvLiveInRelationships).where(eq(schema.evvLiveInRelationships.organizationId, ctx.orgId)).orderBy(schema.evvLiveInRelationships.effectiveFrom);
}
