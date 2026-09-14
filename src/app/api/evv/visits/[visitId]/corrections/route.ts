import { authenticate, fail, ok, readJson } from "@/evv/api";
import { correctVisit } from "@/evv/corrections";

/** POST /api/evv/visits/{visitId}/corrections */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.correct");
    const { visitId } = await params;
    const r = await correctVisit(ctx, visitId, await readJson(req));
    return ok(r, 201);
  } catch (e) { return fail(e); }
}
