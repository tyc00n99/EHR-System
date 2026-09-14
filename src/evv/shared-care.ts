/**
 * Shared care: one caregiver, one occurrence, several clients. The device sends one event; the
 * module keeps it as the source and derives one event per client visit (deterministic ids, so a
 * re-sync is still idempotent). Units are allocated explicitly on each client visit and the
 * method is recorded on the group.
 */
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import type { EvvVisit } from "@/db/schema";
import { evvAudit } from "./audit";
import { writer, type EvvCtx } from "./context";
import { clockIn, clockOut, type ClockActor, type ClockEventInput, type ClockResult } from "./ingest";
import { allocateShared } from "./units";
import { createVisit, evaluateVisit, EvvError, type CreateVisitInput } from "./visits";

export const sharedCareSchema = z.object({
  staffId: z.uuid().optional(),
  members: z.array(z.object({ personId: z.uuid(), serviceAgreementId: z.uuid().optional(), serviceCode: z.string().optional(), modifiers: z.array(z.string()).optional(), visitId: z.uuid().optional() })).min(2).max(6),
  allocation: z.union([z.literal("equal"), z.record(z.string(), z.number().int().min(0))]).default("equal"),
  note: z.string().max(500).optional(),
});

/** Derives a stable per-client event id from the device's event id. */
export function derivedEventId(sourceEventId: string, personId: string): string {
  const h = createHash("sha256").update(`${sourceEventId}:${personId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function createSharedCareGroup(ctx: EvvCtx, actor: ClockActor, raw: unknown): Promise<{ groupId: string; visits: EvvVisit[] }> {
  const input = sharedCareSchema.parse(raw);
  const staffId = input.staffId ?? actor.staffId;
  if (actor.role === "dsp" && staffId !== actor.staffId) throw new EvvError(403, "CAREGIVER_MISMATCH", "Caregivers can only create their own visits.");
  const group = await writer(ctx).insert(schema.evvSharedCareGroups, { organizationId: ctx.orgId, staffId, allocationMethod: input.allocation === "equal" ? "equal" : "manual", note: input.note ?? null, createdBy: ctx.actorUserId });
  const visits: EvvVisit[] = [];
  for (const m of input.members) {
    const create: CreateVisitInput = { id: m.visitId, personId: m.personId, staffId, serviceAgreementId: m.serviceAgreementId ?? null, serviceCode: m.serviceCode, modifiers: m.modifiers, sharedCareGroupId: group.id };
    visits.push(await createVisit(ctx, create));
  }
  await evvAudit(ctx, "shared_care.create", null, { groupId: group.id, members: visits.length, allocation: group.allocationMethod });
  return { groupId: group.id, visits };
}

async function groupVisits(ctx: EvvCtx, groupId: string): Promise<EvvVisit[]> {
  const rows = await ctx.db.select().from(schema.evvVisits).where(and(eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.sharedCareGroupId, groupId)));
  if (!rows.length) throw new EvvError(404, "GROUP_NOT_FOUND", "Shared-care group not found.");
  return rows;
}

/** Fans one device event out to every client visit in the group. */
async function fanOut(ctx: EvvCtx, groupId: string, raw: ClockEventInput, actor: ClockActor, kind: "in" | "out"): Promise<ClockResult[]> {
  const visits = await groupVisits(ctx, groupId);
  const results: ClockResult[] = [];
  for (const v of visits) {
    const input: ClockEventInput = { ...raw, eventId: derivedEventId(raw.eventId, v.personId), idempotencyKey: `${raw.idempotencyKey}:${v.personId}`, metadata: { ...(raw.metadata ?? {}), sharedCareSourceEventId: raw.eventId, sharedCareGroupId: groupId } };
    results.push(kind === "in" ? await clockIn(ctx, v.id, input, actor) : await clockOut(ctx, v.id, input, actor));
  }
  return results;
}

export const clockInGroup = (ctx: EvvCtx, groupId: string, raw: ClockEventInput, actor: ClockActor) => fanOut(ctx, groupId, raw, actor, "in");

export async function clockOutGroup(ctx: EvvCtx, groupId: string, raw: ClockEventInput, actor: ClockActor, allocation: "equal" | Record<string, number> = "equal"): Promise<ClockResult[]> {
  const results = await fanOut(ctx, groupId, raw, actor, "out");
  await allocateGroupUnits(ctx, groupId, allocation);
  return results.map((r) => r);
}

/** Records the unit split on every visit in the group. Manual splits must account for every client. */
export async function allocateGroupUnits(ctx: EvvCtx, groupId: string, allocation: "equal" | Record<string, number>): Promise<EvvVisit[]> {
  const visits = await groupVisits(ctx, groupId);
  const completed = visits.filter((v) => v.status === "completed" && v.units != null);
  if (!completed.length) return visits;
  const total = Math.max(...completed.map((v) => v.units ?? 0));
  const split = allocation === "equal" ? allocateShared(total, completed.map((v) => v.personId)) : allocation;
  if (allocation !== "equal") {
    for (const v of completed) if (!(v.personId in split)) throw new EvvError(422, "ALLOCATION_INCOMPLETE", "Every client in the group needs an allocation.");
  }
  const out: EvvVisit[] = [];
  for (const v of completed) {
    await writer(ctx).update(schema.evvVisits, v.id, { sharedCareUnitsAllocated: split[v.personId] ?? 0, sharedCare: true });
    await evvAudit(ctx, "shared_care.allocate", v.id, { groupId, units: split[v.personId] ?? 0, method: allocation === "equal" ? "equal" : "manual" });
    out.push(await evaluateVisit(ctx, v.id));
  }
  await writer(ctx).update(schema.evvSharedCareGroups, groupId, { allocationMethod: allocation === "equal" ? "equal" : "manual" });
  return out;
}
