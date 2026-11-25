import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { unvoidVisit, voidVisit } from "@/evv/corrections";
import { sendSoon } from "@/evv/realtime";

/** POST /api/evv/visits/{visitId}/void — reversible; DELETE is deliberately not implemented. */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.correct");
    const { visitId } = await params;
    const { reason, undo } = z.object({ reason: z.string().min(5).max(1000), undo: z.boolean().optional() }).parse(await readJson(req));
    const visit = undo ? await unvoidVisit(ctx, visitId, reason) : await voidVisit(ctx, visitId, reason);
    sendSoon(ctx, visitId);
    return ok({ visit });
  } catch (e) { return fail(e); }
}

export async function DELETE() {
  return Response.json({ error: { code: "NOT_ALLOWED", message: "EVV visits are never deleted. Use POST …/void with a reason." } }, { status: 405 });
}
