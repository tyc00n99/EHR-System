import { authenticate, fail, ok } from "@/evv/api";
import { resubmitVisit } from "@/evv/submission";

/** POST /api/evv/visits/{visitId}/resubmit */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.resubmit");
    const { visitId } = await params;
    return ok({ submission: await resubmitVisit(ctx, visitId) }, 202);
  } catch (e) { return fail(e); }
}
