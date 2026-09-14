import { z } from "zod";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { markAcknowledged } from "@/evv/review";

/** POST /api/evv/visits/{visitId}/acknowledge — record an out-of-band acceptance. */
export async function POST(req: Request, { params }: { params: Promise<{ visitId: string }> }) {
  try {
    const { ctx } = await authenticate(req, "evv.resubmit");
    const { visitId } = await params;
    const { externalReferenceId, note } = z.object({ externalReferenceId: z.string().min(1).max(200), note: z.string().max(500).optional() }).parse(await readJson(req));
    return ok({ visit: await markAcknowledged(ctx, visitId, externalReferenceId, note) });
  } catch (e) { return fail(e); }
}
