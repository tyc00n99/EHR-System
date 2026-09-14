import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { addComment } from "@/evv/review";

/** POST /api/evv/visits/{visitId}/comments */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.review");
    const { visitId } = await params;
    const { body } = z.object({ body: z.string().min(1).max(4000) }).parse(await readJson(req));
    return ok({ comment: await addComment(ctx, visitId, body) }, 201);
  } catch (e) { return fail(e); }
}
