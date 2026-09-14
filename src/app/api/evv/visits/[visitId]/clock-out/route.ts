import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { clockOut } from "@/evv/ingest";
import { requireVisit } from "@/evv/visits";

/** POST /api/evv/visits/{visitId}/clock-out */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_out");
    const { visitId } = await params;
    const body = (await readJson(req)) as { event?: unknown } | null;
    const visit = await requireVisit(ctx, visitId);
    const actor = actorFor(user, user.role === "dsp" ? null : visit.staffId);
    const r = await clockOut(ctx, visitId, body?.event ?? body, actor);
    const status = r.duplicate ? 200 : r.visit.status === "awaiting_clock_in" ? 202 : 201;
    return ok({ duplicate: r.duplicate, flags: r.flags, visit: r.visit, event: { id: r.event.id, eventId: r.event.eventId, type: r.event.type, effectiveAt: r.event.effectiveAt, locationState: r.event.locationState, delayed: r.event.delayed, offline: r.event.offline } }, status);
  } catch (e) { return fail(e); }
}
