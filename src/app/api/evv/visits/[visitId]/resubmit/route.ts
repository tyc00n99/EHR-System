import { authenticate, fail, ok } from "@/evv/api";
import { resubmitVisit } from "@/evv/submission";
import { sendSoon } from "@/evv/realtime";

/** POST /api/evv/visits/{visitId}/resubmit */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.resubmit");
    const { visitId } = await params;
    const submission = await resubmitVisit(ctx, visitId);
    sendSoon(ctx, visitId);
    return ok({ submission }, 202);
  } catch (e) { return fail(e); }
}
