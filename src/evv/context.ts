/**
 * The EVV context: which database, which tenant, who is acting. Every service takes one, and
 * every query it runs is scoped to `orgId`. The host app is one organisation per database today,
 * so `contextFor()` resolves the organisation row; the EVV tables carry `organization_id`
 * regardless, so isolation is enforced by the module, not assumed from the deployment.
 */
import { and, eq } from "drizzle-orm";
import { schema, type Db } from "@/db";
import { audited, type Executor } from "@/db/audited";
import { MN_EVV_RULE_SEED, MN_EVV_SOURCE } from "./rules";
import { MN_POLICY_SOURCES } from "./policy";

export interface EvvCtx {
  db: Db;
  orgId: string;
  actorUserId: string | null;
  /** Injectable clock so tests can pin "now". */
  now: () => Date;
}

export function makeCtx(db: Db, orgId: string, actorUserId: string | null, now: () => Date = () => new Date()): EvvCtx {
  return { db, orgId, actorUserId, now };
}

export const writer = (ctx: EvvCtx, db: Executor = ctx.db) => audited(db, { userId: ctx.actorUserId });

/** The organisation this deployment serves. */
export async function defaultOrganizationId(db: Db): Promise<string> {
  const [org] = await db.select({ id: schema.organizations.id }).from(schema.organizations).limit(1);
  if (!org) throw new Error("Organization is not configured.");
  return org.id;
}

/**
 * Makes sure a tenant has a provider profile, a policy row, a default payer and the Minnesota
 * service rules. Idempotent and cheap once populated; called from the seed and lazily on first use
 * so a database that predates the EVV module self-heals.
 */
export async function ensureEvvDefaults(db: Db, orgId: string, actorUserId: string | null = null): Promise<void> {
  const w = audited(db, { userId: actorUserId });
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId)).limit(1);
  if (!org) throw new Error("Organization not found.");

  const [profile] = await db.select({ id: schema.evvProviderProfiles.id }).from(schema.evvProviderProfiles).where(eq(schema.evvProviderProfiles.organizationId, orgId)).limit(1);
  if (!profile) {
    await w.insert(schema.evvProviderProfiles, { organizationId: orgId, legalName: org.name, federalTaxId: org.taxId, state: org.state ?? "MN" });
    if (org.npi) await w.insert(schema.evvProviderIdentifiers, { organizationId: orgId, type: "npi", value: org.npi, label: "Organization NPI" });
    if (org.umpi) await w.insert(schema.evvProviderIdentifiers, { organizationId: orgId, type: "umpi", value: org.umpi, label: "Organization UMPI" });
  }

  const [policy] = await db.select({ id: schema.evvPolicies.id }).from(schema.evvPolicies).where(and(eq(schema.evvPolicies.organizationId, orgId), eq(schema.evvPolicies.state, "MN"))).limit(1);
  if (!policy) {
    await w.insert(schema.evvPolicies, {
      organizationId: orgId, state: "MN",
      sourceUrl: MN_POLICY_SOURCES.compliance,
      sourceNote: "Geofence, real-time tolerance and plausibility bounds are EVVora defaults pending the provider's reading of the DHS compliance policy; the 14th-of-month deadline is DHS policy.",
    });
  }

  const [payer] = await db.select({ id: schema.evvPayers.id }).from(schema.evvPayers).where(eq(schema.evvPayers.organizationId, orgId)).limit(1);
  if (!payer) await w.insert(schema.evvPayers, { organizationId: orgId, name: "Minnesota Medicaid (MHCP fee-for-service)", kind: "medicaid_ffs", isDefault: true });

  const [rule] = await db.select({ id: schema.evvServiceRules.id }).from(schema.evvServiceRules).where(eq(schema.evvServiceRules.organizationId, orgId)).limit(1);
  if (!rule) {
    for (const r of MN_EVV_RULE_SEED) {
      await w.insert(schema.evvServiceRules, {
        organizationId: orgId, state: "MN", serviceCode: r.serviceCode, requiredModifiers: r.requiredModifiers, excludedModifiers: r.excludedModifiers ?? [],
        allowAdditionalModifiers: r.allowAdditionalModifiers ?? true, label: r.label, unitType: r.unitType, sharedCare: r.sharedCare ?? false,
        effectiveFrom: MN_EVV_SOURCE.effectiveDate, sourceUrl: MN_EVV_SOURCE.url, sourceLabel: MN_EVV_SOURCE.label, sourceEffectiveDate: MN_EVV_SOURCE.effectiveDate,
      });
    }
  }
}

export async function getPolicy(ctx: EvvCtx, state = "MN") {
  let [p] = await ctx.db.select().from(schema.evvPolicies).where(and(eq(schema.evvPolicies.organizationId, ctx.orgId), eq(schema.evvPolicies.state, state))).limit(1);
  if (!p) { await ensureEvvDefaults(ctx.db, ctx.orgId, ctx.actorUserId); [p] = await ctx.db.select().from(schema.evvPolicies).where(and(eq(schema.evvPolicies.organizationId, ctx.orgId), eq(schema.evvPolicies.state, state))).limit(1); }
  return p;
}

export async function getRules(ctx: EvvCtx) {
  let rows = await ctx.db.select().from(schema.evvServiceRules).where(eq(schema.evvServiceRules.organizationId, ctx.orgId));
  if (!rows.length) { await ensureEvvDefaults(ctx.db, ctx.orgId, ctx.actorUserId); rows = await ctx.db.select().from(schema.evvServiceRules).where(eq(schema.evvServiceRules.organizationId, ctx.orgId)); }
  return rows;
}

export async function getProfile(ctx: EvvCtx) {
  let [p] = await ctx.db.select().from(schema.evvProviderProfiles).where(eq(schema.evvProviderProfiles.organizationId, ctx.orgId)).limit(1);
  if (!p) { await ensureEvvDefaults(ctx.db, ctx.orgId, ctx.actorUserId); [p] = await ctx.db.select().from(schema.evvProviderProfiles).where(eq(schema.evvProviderProfiles.organizationId, ctx.orgId)).limit(1); }
  const identifiers = await ctx.db.select().from(schema.evvProviderIdentifiers).where(and(eq(schema.evvProviderIdentifiers.organizationId, ctx.orgId), eq(schema.evvProviderIdentifiers.active, true)));
  return { profile: p, identifiers };
}

export async function defaultPayerId(ctx: EvvCtx): Promise<string | null> {
  const rows = await ctx.db.select({ id: schema.evvPayers.id, isDefault: schema.evvPayers.isDefault }).from(schema.evvPayers).where(and(eq(schema.evvPayers.organizationId, ctx.orgId), eq(schema.evvPayers.active, true)));
  return rows.find((r) => r.isDefault)?.id ?? rows[0]?.id ?? null;
}
