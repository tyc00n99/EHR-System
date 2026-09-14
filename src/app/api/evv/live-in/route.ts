import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { createLiveInRelationship, endLiveInRelationship, listLiveInRelationships } from "@/evv/live-in";

/** GET /api/evv/live-in */
export async function GET(req: Request) {
  try { const { ctx } = await authenticate(req, "evv.view_all"); return ok({ relationships: await listLiveInRelationships(ctx) }); } catch (e) { return fail(e); }
}

/** POST /api/evv/live-in — create; or { id, effectiveTo } to end one. */
export async function POST(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.configure");
    const body = await readJson(req);
    const end = z.object({ id: z.uuid(), effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).safeParse(body);
    if (end.success) return ok({ relationship: await endLiveInRelationship(ctx, end.data.id, end.data.effectiveTo) });
    return ok({ relationship: await createLiveInRelationship(ctx, body) }, 201);
  } catch (e) { return fail(e); }
}
