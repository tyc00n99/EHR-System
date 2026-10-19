import { getDb } from "@/db";
import { pollClaimStatus } from "@/billing/claims";
import { clearinghouseFromEnv } from "@/billing/clearinghouse";
import { fail, ok, requireCron } from "@/evv/api";
import { defaultOrganizationId } from "@/evv/context";

/**
 * Daily claim status read: acknowledgments and payments coming back from the clearinghouse. It
 * never sends a claim — claims leave only when a biller approves them (Oct 19, 2026). Scheduled in
 * vercel.json; needs CRON_SECRET.
 */
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    requireCron(req);
    const db = await getDb();
    const polled = await pollClaimStatus(db, await defaultOrganizationId(db), { userId: null }, clearinghouseFromEnv());
    return ok({ polled });
  } catch (e) { return fail(e); }
}
