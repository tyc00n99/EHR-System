import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { authenticate, fail, ok } from "@/evv/api";
import { billingReadiness, checkAuthorization } from "@/evv/authorization";
import { getPolicy } from "@/evv/context";
import { latestSubmission, requireVisit } from "@/evv/visits";

/** GET /api/evv/visits/{visitId}/billing — the separate facts a claim generator needs. */
export async function GET(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.view_all");
    const { visitId } = await params;
    const visit = await requireVisit(ctx, visitId);
    const [authorization, submission, policy, open] = await Promise.all([
      checkAuthorization(ctx, visit), latestSubmission(ctx, visit.id), getPolicy(ctx, "MN"),
      ctx.db.select({ id: schema.evvExceptions.id }).from(schema.evvExceptions).where(and(eq(schema.evvExceptions.evvVisitId, visit.id), eq(schema.evvExceptions.status, "open"))),
    ]);
    const check = billingReadiness({ visit, compliance: { status: visit.complianceStatus, reasons: visit.complianceReasons as never }, authorization, submission, openExceptions: open.length, policy });
    return ok({ visitId: visit.id, ...check, authorization });
  } catch (e) { return fail(e); }
}
