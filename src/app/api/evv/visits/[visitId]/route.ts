import { assertMayView, authenticate, fail, ok } from "@/evv/api";
import { visitDetail } from "@/evv/review";

/** GET /api/evv/visits/{visitId} — the visit with events, versions, corrections, exceptions, submissions. */
export async function GET(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx, user } = await authenticate(req, "evv.view_own");
    const { visitId } = await params;
    const detail = await visitDetail(ctx, visitId);
    assertMayView(user, detail.visit);
    return ok(detail);
  } catch (e) { return fail(e); }
}
