import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { markReviewed } from "@/evv/review";

/** POST /api/evv/visits/{visitId}/review */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.review");
    const { visitId } = await params;
    const { note } = z.object({ note: z.string().max(500).optional() }).parse((await readJson(req).catch(() => ({}))) ?? {});
    return ok({ visit: await markReviewed(ctx, visitId, note) });
  } catch (e) { return fail(e); }
}
