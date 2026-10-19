import { getDb } from "@/db";
import { billableLines, pollClaimStatus, runClaims } from "@/billing/claims";
import { clearinghouseFromEnv } from "@/billing/clearinghouse";
import { fail, ok, requireCron } from "@/evv/api";
import { defaultOrganizationId } from "@/evv/context";

/**
 * Daily claim run. With CLAIMS_AUTO_SEND=1 it sends every ready note from the last 90 days to the
 * clearinghouse; either way it reads claim status back. Scheduled in vercel.json; needs CRON_SECRET.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    requireCron(req);
    const db = await getDb();
    const adapter = clearinghouseFromEnv();
    const actor = { userId: null };
    let sent: unknown = "auto-send off";
    if (process.env.CLAIMS_AUTO_SEND === "1") {
      const to = new Date();
      const lines = await billableLines(db, new Date(to.getTime() - 90 * 86_400_000), to);
      const ready = lines.filter((l) => l.state === "ready").map((l) => l.visitId);
      sent = ready.length ? await runClaims(db, { orgId: await defaultOrganizationId(db), actor, adapter, visitIds: ready, method: "clearinghouse" }) : "nothing ready";
    }
    const polled = await pollClaimStatus(db, actor, adapter);
    return ok({ sent, polled });
  } catch (e) { return fail(e); }
}
