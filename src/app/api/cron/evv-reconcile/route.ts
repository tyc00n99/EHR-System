import { getDb } from "@/db";
import { adapterFromEnv } from "@/evv/adapters";
import { fail, ok, requireCron } from "@/evv/api";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { reconcile } from "@/evv/reconciliation";

/** Reconciles acknowledgments, stuck submissions and the monthly deadline. Needs CRON_SECRET. */
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    requireCron(req);
    const db = await getDb();
    const ctx = makeCtx(db, await defaultOrganizationId(db), null);
    return ok(await reconcile(ctx, adapterFromEnv()));
  } catch (e) { return fail(e); }
}
