import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { decryptField } from "@/lib/crypto";
import { authenticate, fail, ok } from "@/evv/api";
import { evvAudit } from "@/evv/audit";
import { requireVisit } from "@/evv/visits";

/** GET /api/evv/visits/{visitId}/location — decrypts the two fixes for a reviewer. Audited. */
export async function GET(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.review");
    const { visitId } = await params;
    const visit = await requireVisit(ctx, visitId);
    const events = await ctx.db.select().from(schema.evvEvents).where(and(eq(schema.evvEvents.organizationId, ctx.orgId), eq(schema.evvEvents.evvVisitId, visit.id)));
    await evvAudit(ctx, "location.reveal", visit.id, { events: events.length });
    return ok({ fixes: events.map((e) => ({ eventId: e.id, type: e.type, locationState: e.locationState, distanceFromHomeMeters: e.distanceFromHomeMeters, coordinates: e.locationEncrypted ? JSON.parse(decryptField(e.locationEncrypted)) : null })) });
  } catch (e) { return fail(e); }
}
