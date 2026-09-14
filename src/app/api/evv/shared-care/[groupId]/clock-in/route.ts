import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { clockEventSchema } from "@/evv/ingest";
import { clockInGroup } from "@/evv/shared-care";

/** POST /api/evv/shared-care/{groupId}/clock-in — one device event, every client visit in the group. */
export async function POST(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_in");
    const { groupId } = await params;
    const body = (await readJson(req)) as { event?: unknown; staffId?: string };
    const results = await clockInGroup(ctx, groupId, clockEventSchema.parse(body?.event ?? body), actorFor(user, body?.staffId ?? null));
    return ok({ results: results.map((r) => ({ visitId: r.visit.id, duplicate: r.duplicate, flags: r.flags, status: r.visit.status })) }, 201);
  } catch (e) { return fail(e); }
}
