import { getDb } from "@/db";
import { adapterFromEnv } from "@/evv/adapters";
import { fail, ok, requireCron } from "@/evv/api";
import { defaultOrganizationId, makeCtx } from "@/evv/context";
import { processQueue } from "@/evv/submission";

/** Drains the EVV submission queue. Scheduled in vercel.json; needs CRON_SECRET. */
export const maxDuration = 60;

export async function GET(req: Request) {
  try {
    requireCron(req);
    const db = await getDb();
    const ctx = makeCtx(db, await defaultOrganizationId(db), null);
    return ok(await processQueue(ctx, adapterFromEnv()));
  } catch (e) { return fail(e); }
}
