import { authenticate, fail, ok } from "@/evv/api";
import { reviewQueue } from "@/evv/review";

/** GET /api/evv/review-queue?from&to&personId&staffId&serviceCode&complianceStatus&submissionStatus&exceptionType&payerId&billingId&manualOrCorrected&rejected&approachingDeadline&openExceptionsOnly&limit&offset */
export async function GET(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.review");
    return ok(await reviewQueue(ctx, Object.fromEntries(new URL(req.url).searchParams)));
  } catch (e) { return fail(e); }
}
