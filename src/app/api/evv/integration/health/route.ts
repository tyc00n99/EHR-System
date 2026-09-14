import { adapterFromEnv } from "@/evv/adapters";
import { authenticate, fail, ok } from "@/evv/api";
import { getProfile } from "@/evv/context";

/** GET /api/evv/integration/health — adapter, environment, configuration problems. No secrets. */
export async function GET(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.manage_integration");
    const adapter = adapterFromEnv();
    const health = await adapter.health();
    const { profile } = await getProfile(ctx);
    const productionReady = health.ok && health.environment === "production" && profile.productionEnabled;
    return ok({ adapter: adapter.key, ...health, providerProductionEnabled: profile.productionEnabled, productionSubmissionActive: productionReady });
  } catch (e) { return fail(e); }
}
