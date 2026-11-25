/**
 * Real-time submission (HHAX MN business requirement 6). After the response is sent, drain the
 * visit's queued submissions through the configured adapter. Uses Next's `after`, so the caregiver
 * never waits on the aggregator; outside a request (scripts, tests) it does nothing and the
 * `/api/cron/evv-submit` job sends it on its next run. Turn it off with EVV_REALTIME_SUBMIT=0.
 */
import { after } from "next/server";
import { adapterFromEnv } from "./adapters";
import type { EvvCtx } from "./context";
import { sendVisitNow } from "./submission";

export function sendSoon(ctx: EvvCtx, visitId: string, env: NodeJS.ProcessEnv = process.env): void {
  if (env.EVV_REALTIME_SUBMIT === "0") return;
  try {
    after(async () => {
      try { await sendVisitNow(ctx, adapterFromEnv(env), visitId); }
      catch (e) { console.warn("evv real-time send deferred to the queue:", e instanceof Error ? e.message : "unknown"); }
    });
  } catch { /* not inside a request: the cron sends it */ }
}
