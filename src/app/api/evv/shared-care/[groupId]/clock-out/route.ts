import { z } from "zod";
import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { clockEventSchema } from "@/evv/ingest";
import { clockOutGroup } from "@/evv/shared-care";

/** POST /api/evv/shared-care/{groupId}/clock-out — { event, allocation?: "equal" | { personId: units } } */
export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_out");
    const { groupId } = await params;
    const body = z.object({ event: clockEventSchema, staffId: z.uuid().optional(), allocation: z.union([z.literal("equal"), z.record(z.string(), z.number().int().min(0))]).default("equal") }).parse(await readJson(req));
    const results = await clockOutGroup(ctx, groupId, body.event, actorFor(user, body.staffId ?? null), body.allocation);
    return ok({ results: results.map((r) => ({ visitId: r.visit.id, duplicate: r.duplicate, flags: r.flags, status: r.visit.status, units: r.visit.units })) }, 201);
  } catch (e) { return fail(e); }
}
