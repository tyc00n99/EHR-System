import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { evvAudit } from "@/evv/audit";
import { getRules, writer } from "@/evv/context";
import { EvvError } from "@/evv/visits";

/** GET /api/evv/rules — every rule, including superseded versions. */
export async function GET(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.view_compliance");
    return ok({ rules: await getRules(ctx) });
  } catch (e) { return fail(e); }
}

const ruleSchema = z.object({
  serviceCode: z.string().min(4).max(6),
  requiredModifiers: z.array(z.string().length(2)).max(4).default([]),
  excludedModifiers: z.array(z.string().length(2)).max(4).default([]),
  allowAdditionalModifiers: z.boolean().default(true),
  label: z.string().min(1).max(200),
  requiresEvv: z.boolean().default(true),
  unitType: z.enum(["fifteen_minute", "hourly", "daily", "per_visit"]).default("fifteen_minute"),
  sharedCare: z.boolean().default(false),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  payerId: z.uuid().optional(),
  sourceUrl: z.string().url().optional(),
  sourceLabel: z.string().max(300).optional(),
  sourceEffectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** When set, the new rule supersedes this one (which is closed as of effectiveFrom). */
  supersedesId: z.uuid().optional(),
});

/** POST /api/evv/rules — add a rule or a new version of one. Old versions are never edited. */
export async function POST(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.configure");
    const body = ruleSchema.parse(await readJson(req));
    let version = 1;
    if (body.supersedesId) {
      const [old] = await ctx.db.select().from(schema.evvServiceRules).where(eq(schema.evvServiceRules.id, body.supersedesId)).limit(1);
      if (!old || old.organizationId !== ctx.orgId) throw new EvvError(404, "RULE_NOT_FOUND", "Rule to supersede not found.");
      version = old.version + 1;
      await writer(ctx).update(schema.evvServiceRules, old.id, { active: false, effectiveTo: old.effectiveTo ?? body.effectiveFrom });
    }
    const row = await writer(ctx).insert(schema.evvServiceRules, { organizationId: ctx.orgId, state: "MN", ...body, serviceCode: body.serviceCode.toUpperCase(), requiredModifiers: body.requiredModifiers.map((m) => m.toUpperCase()), excludedModifiers: body.excludedModifiers.map((m) => m.toUpperCase()), effectiveTo: body.effectiveTo ?? null, payerId: body.payerId ?? null, version, supersedesId: body.supersedesId ?? null, createdBy: ctx.actorUserId, sourceUrl: body.sourceUrl ?? null, sourceLabel: body.sourceLabel ?? null, sourceEffectiveDate: body.sourceEffectiveDate ?? null });
    await evvAudit(ctx, "rule.create", null, { ruleId: row.id, serviceCode: row.serviceCode, version, supersedesId: row.supersedesId });
    return ok({ rule: row }, 201);
  } catch (e) { return fail(e); }
}
