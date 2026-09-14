import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { acknowledgeException, assignException } from "@/evv/review";

/** POST /api/evv/exceptions/{exceptionId} — { action: "acknowledge" | "resolve" | "assign", note?, assigneeUserId? } */
export async function POST(req: Request, { params }: { params: Promise<{ exceptionId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.review");
    const { exceptionId } = await params;
    const body = z.object({ action: z.enum(["acknowledge", "resolve", "assign"]), note: z.string().max(1000).optional(), assigneeUserId: z.uuid().optional() }).parse(await readJson(req));
    if (body.action === "assign") { if (!body.assigneeUserId) throw new z.ZodError([{ code: "custom", path: ["assigneeUserId"], message: "Required", input: undefined }]); return ok({ exception: await assignException(ctx, exceptionId, body.assigneeUserId) }); }
    return ok({ exception: await acknowledgeException(ctx, exceptionId, body.action === "resolve", body.note) });
  } catch (e) { return fail(e); }
}
