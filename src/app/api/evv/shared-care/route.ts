import { actorFor, authenticate, fail, ok, readJson } from "@/evv/api";
import { createSharedCareGroup } from "@/evv/shared-care";

/** POST /api/evv/shared-care — one caregiver, several clients, one occurrence. */
export async function POST(req: Request) {
  try {
    const { ctx, user } = await authenticate(req, "evv.clock_in");
    const body = (await readJson(req)) as { staffId?: string };
    const actor = actorFor(user, body?.staffId ?? null);
    return ok(await createSharedCareGroup(ctx, actor, body), 201);
  } catch (e) { return fail(e); }
}
