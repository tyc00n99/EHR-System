import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { authenticate, fail, ok, readJson } from "@/evv/api";
import { evvAudit } from "@/evv/audit";
import { getPolicy, getProfile, writer } from "@/evv/context";

/** GET /api/evv/provider — enrollment data, identifiers, payers and policy for the tenant. */
export async function GET(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.view_compliance");
    const { profile, identifiers } = await getProfile(ctx);
    const payers = await ctx.db.select().from(schema.evvPayers).where(eq(schema.evvPayers.organizationId, ctx.orgId));
    const policy = await getPolicy(ctx, "MN");
    const problems: string[] = [];
    if (!profile.medicaidProviderId) problems.push("Minnesota Medicaid provider ID missing");
    if (!identifiers.length) problems.push("No NPI or UMPI recorded");
    if (!profile.hhaxProviderId) problems.push("HHAeXchange provider identifier missing (assigned at onboarding)");
    if (!payers.some((p) => p.active)) problems.push("No active payer");
    return ok({ profile, identifiers, payers, policy, problems, ready: problems.length === 0 });
  } catch (e) { return fail(e); }
}

const putSchema = z.object({
  profile: z.object({ legalName: z.string().min(1).max(200).optional(), federalTaxId: z.string().regex(/^\d{2}-?\d{7}$/).optional(), medicaidProviderId: z.string().max(50).optional(), hhaxProviderId: z.string().max(100).optional(), evvSystem: z.enum(["third_party", "hhax_direct"]).optional(), productionEnabled: z.boolean().optional() }).optional(),
  identifiers: z.array(z.object({ type: z.enum(["npi", "umpi"]), value: z.string().min(5).max(20), label: z.string().max(100).optional(), effectiveFrom: z.string().optional(), effectiveTo: z.string().optional(), active: z.boolean().optional() })).optional(),
  payers: z.array(z.object({ id: z.uuid().optional(), name: z.string().min(1).max(200), kind: z.enum(["medicaid_ffs", "mco", "other"]).default("medicaid_ffs"), externalPayerId: z.string().max(100).optional(), isDefault: z.boolean().optional(), active: z.boolean().optional() })).optional(),
  policy: z.object({ geofenceMeters: z.number().int().min(50).max(10_000).optional(), maxAccuracyMeters: z.number().int().min(10).max(5000).optional(), realTimeToleranceMinutes: z.number().int().min(0).max(24 * 60).optional(), maxFutureSkewMinutes: z.number().int().min(0).max(120).optional(), maxVisitMinutes: z.number().int().min(60).max(48 * 60).optional(), minVisitMinutes: z.number().int().min(0).max(60).optional(), submissionDeadlineDay: z.number().int().min(1).max(28).optional(), deadlineWarningDays: z.number().int().min(1).max(28).optional(), liveInNonRealTimeAllowed: z.boolean().optional(), billingHoldOnNoncompliant: z.boolean().optional(), maxSubmissionAttempts: z.number().int().min(1).max(50).optional(), ackTimeoutHours: z.number().int().min(1).max(720).optional() }).optional(),
});

/** PUT /api/evv/provider — update enrollment data, identifiers, payers and policy. Admin only. */
export async function PUT(req: Request) {
  try {
    const { ctx } = await authenticate(req, "evv.configure");
    const body = putSchema.parse(await readJson(req));
    const { profile } = await getProfile(ctx);
    if (body.profile) await writer(ctx).update(schema.evvProviderProfiles, profile.id, body.profile);
    for (const i of body.identifiers ?? []) {
      const [existing] = await ctx.db.select().from(schema.evvProviderIdentifiers).where(and(eq(schema.evvProviderIdentifiers.organizationId, ctx.orgId), eq(schema.evvProviderIdentifiers.type, i.type), eq(schema.evvProviderIdentifiers.value, i.value))).limit(1);
      if (existing) await writer(ctx).update(schema.evvProviderIdentifiers, existing.id, { label: i.label ?? existing.label, effectiveFrom: i.effectiveFrom ?? existing.effectiveFrom, effectiveTo: i.effectiveTo ?? existing.effectiveTo, active: i.active ?? existing.active });
      else await writer(ctx).insert(schema.evvProviderIdentifiers, { organizationId: ctx.orgId, type: i.type, value: i.value, label: i.label ?? null, effectiveFrom: i.effectiveFrom ?? null, effectiveTo: i.effectiveTo ?? null, active: i.active ?? true });
    }
    for (const p of body.payers ?? []) {
      if (p.isDefault) for (const other of await ctx.db.select({ id: schema.evvPayers.id }).from(schema.evvPayers).where(and(eq(schema.evvPayers.organizationId, ctx.orgId), eq(schema.evvPayers.isDefault, true)))) await writer(ctx).update(schema.evvPayers, other.id, { isDefault: false });
      if (p.id) await writer(ctx).update(schema.evvPayers, p.id, { name: p.name, kind: p.kind, externalPayerId: p.externalPayerId ?? null, isDefault: p.isDefault ?? false, active: p.active ?? true });
      else await writer(ctx).insert(schema.evvPayers, { organizationId: ctx.orgId, name: p.name, kind: p.kind, externalPayerId: p.externalPayerId ?? null, isDefault: p.isDefault ?? false, active: p.active ?? true });
    }
    if (body.policy) { const policy = await getPolicy(ctx, "MN"); await writer(ctx).update(schema.evvPolicies, policy.id, body.policy); }
    await evvAudit(ctx, "provider.configure", null, { profile: Boolean(body.profile), identifiers: body.identifiers?.length ?? 0, payers: body.payers?.length ?? 0, policy: body.policy ? Object.keys(body.policy) : [] });
    return GET(req);
  } catch (e) { return fail(e); }
}
