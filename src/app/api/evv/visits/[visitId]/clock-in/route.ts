import { z } from "zod";
import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { clockEventSchema, clockIn } from "@/evv/ingest";

const bodySchema = z.object({
  event: clockEventSchema,
  /** Present when the app created the visit id itself (offline) and the server has not seen it. */
  visit: z.object({
    personId: z.uuid(), staffId: z.uuid().optional(), serviceAgreementId: z.uuid().optional(), serviceCode: z.string().optional(), modifiers: z.array(z.string()).optional(),
    shiftId: z.uuid().optional(), payerId: z.uuid().optional(), liveIn: z.boolean().optional(),
  }).optional(),
});

/** POST /api/evv/visits/{visitId}/clock-in */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_in");
    const { visitId } = await params;
    const body = bodySchema.parse(await readJson(req));
    const actor = actorFor(user, body.visit?.staffId ?? null);
    const r = await clockIn(ctx, visitId, body.event, actor, body.visit ? { ...body.visit, staffId: actor.staffId } : undefined);
    return ok({ duplicate: r.duplicate, flags: r.flags, visit: r.visit, event: { id: r.event.id, eventId: r.event.eventId, type: r.event.type, effectiveAt: r.event.effectiveAt, locationState: r.event.locationState, delayed: r.event.delayed, offline: r.event.offline } }, r.duplicate ? 200 : 201);
  } catch (e) { return fail(e); }
}
