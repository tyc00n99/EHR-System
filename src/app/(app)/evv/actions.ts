"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { adapterFromEnv } from "@/evv/adapters";
import { evvAudit } from "@/evv/audit";
import { defaultOrganizationId, getPolicy, getProfile, makeCtx, writer, type EvvCtx } from "@/evv/context";
import { correctVisit, unvoidVisit, voidVisit } from "@/evv/corrections";
import { createLiveInRelationship, endLiveInRelationship } from "@/evv/live-in";
import { hasEvvPermission, type EvvPermission } from "@/evv/permissions";
import { reconcile } from "@/evv/reconciliation";
import { acknowledgeException, addComment, assignException, markAcknowledged, markReviewed } from "@/evv/review";
import { processQueue, resubmitVisit } from "@/evv/submission";
import { EvvError } from "@/evv/visits";
import { requireUser } from "@/lib/auth";
import { fromLocalInput } from "@/lib/format";
import { formToObject, type ActionState } from "@/lib/validation";

async function office(permission: EvvPermission): Promise<EvvCtx> {
  const user = await requireUser(["admin", "supervisor"]);
  if (!hasEvvPermission(user, permission)) throw new EvvError(403, "FORBIDDEN", `This needs ${permission}.`);
  const db = await getDb();
  return makeCtx(db, await defaultOrganizationId(db), user.id);
}

const done = (message?: string): ActionState => { revalidatePath("/evv"); return { ok: true, message }; };
const failed = (e: unknown): ActionState => ({ message: e instanceof Error ? e.message : "Something went wrong." });

export async function reviewVisitAction(visitId: string, note?: string): Promise<ActionState> {
  try { await markReviewed(await office("evv.review"), visitId, note); return done("Marked reviewed."); } catch (e) { return failed(e); }
}

export async function correctVisitAction(visitId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const d = formToObject(fd) as Record<string, string | undefined>;
    const changes: Record<string, unknown> = {};
    if (d.clockInAt) changes.clockInAt = fromLocalInput(d.clockInAt).toISOString();
    if (d.clockOutAt) changes.clockOutAt = fromLocalInput(d.clockOutAt).toISOString();
    if (d.locationType) changes.locationType = d.locationType;
    if (d.serviceCode) changes.serviceCode = d.serviceCode;
    if (d.modifiers) changes.modifiers = d.modifiers.split(/[\s,]+/).filter(Boolean);
    await correctVisit(await office("evv.correct"), visitId, { reasonCode: d.reasonCode, explanation: d.explanation, changes });
    return done("Correction saved. The visit is a new version and will be resubmitted.");
  } catch (e) { return failed(e); }
}

export async function voidVisitAction(visitId: string, reason: string, undo = false): Promise<ActionState> {
  try { const ctx = await office("evv.correct"); if (undo) await unvoidVisit(ctx, visitId, reason); else await voidVisit(ctx, visitId, reason); return done(undo ? "Void reversed." : "Visit voided. Everything is retained."); } catch (e) { return failed(e); }
}

export async function resubmitAction(visitId: string): Promise<ActionState> {
  try { await resubmitVisit(await office("evv.resubmit"), visitId); return done("Queued for resubmission."); } catch (e) { return failed(e); }
}

export async function acknowledgeAction(visitId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try { const d = formToObject(fd) as Record<string, string | undefined>; if (!d.externalReferenceId) return { errors: { externalReferenceId: "Enter the aggregator's reference" } }; await markAcknowledged(await office("evv.resubmit"), visitId, d.externalReferenceId, d.note); return done("Marked acknowledged."); } catch (e) { return failed(e); }
}

export async function commentAction(visitId: string, _prev: ActionState, fd: FormData): Promise<ActionState> {
  try { await addComment(await office("evv.review"), visitId, String(fd.get("body") ?? "")); return done(); } catch (e) { return failed(e); }
}

export async function exceptionAction(exceptionId: string, action: "acknowledge" | "resolve" | "assign", note?: string, assigneeUserId?: string): Promise<ActionState> {
  try {
    const ctx = await office("evv.review");
    if (action === "assign") { if (!assigneeUserId) return { message: "Choose who to assign it to." }; await assignException(ctx, exceptionId, assigneeUserId); return done("Assigned."); }
    await acknowledgeException(ctx, exceptionId, action === "resolve", note);
    return done(action === "resolve" ? "Resolved." : "Acknowledged.");
  } catch (e) { return failed(e); }
}

/* ---------- settings ---------- */

export async function saveProviderAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await office("evv.configure");
    const d = formToObject(fd) as Record<string, string | undefined>;
    const { profile } = await getProfile(ctx);
    if (!d.legalName || !d.federalTaxId) return { errors: { ...(d.legalName ? {} : { legalName: "Required" }), ...(d.federalTaxId ? {} : { federalTaxId: "Required" }) } };
    await writer(ctx).update(schema.evvProviderProfiles, profile.id, { legalName: d.legalName, federalTaxId: d.federalTaxId, medicaidProviderId: d.medicaidProviderId ?? null, hhaxProviderId: d.hhaxProviderId ?? null, evvSystem: d.evvSystem === "hhax_direct" ? "hhax_direct" : "third_party", productionEnabled: fd.get("productionEnabled") === "true" });
    await evvAudit(ctx, "provider.configure", null, { profile: true });
    return done("Provider details saved.");
  } catch (e) { return failed(e); }
}

export async function addIdentifierAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await office("evv.configure");
    const d = formToObject(fd) as Record<string, string | undefined>;
    if (!d.value || !/^[A-Za-z0-9]{5,20}$/.test(d.value)) return { errors: { value: "Enter the NPI or UMPI" } };
    await writer(ctx).insert(schema.evvProviderIdentifiers, { organizationId: ctx.orgId, type: d.type === "npi" ? "npi" : "umpi", value: d.value.trim(), label: d.label ?? null });
    await evvAudit(ctx, "provider.configure", null, { identifiers: 1 });
    return done("Identifier added.");
  } catch (e) { return failed(e instanceof Error && /unique/i.test(e.message) ? new Error("That identifier is already listed.") : e); }
}

export async function toggleIdentifierAction(id: string, active: boolean): Promise<ActionState> {
  try { const ctx = await office("evv.configure"); const [row] = await ctx.db.select().from(schema.evvProviderIdentifiers).where(eq(schema.evvProviderIdentifiers.id, id)).limit(1); if (!row || row.organizationId !== ctx.orgId) return { message: "Not found." }; await writer(ctx).update(schema.evvProviderIdentifiers, id, { active }); return done(); } catch (e) { return failed(e); }
}

export async function addPayerAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await office("evv.configure");
    const d = formToObject(fd) as Record<string, string | undefined>;
    if (!d.name) return { errors: { name: "Required" } };
    const isDefault = fd.get("isDefault") === "true";
    if (isDefault) for (const p of await ctx.db.select({ id: schema.evvPayers.id }).from(schema.evvPayers).where(eq(schema.evvPayers.organizationId, ctx.orgId))) await writer(ctx).update(schema.evvPayers, p.id, { isDefault: false });
    await writer(ctx).insert(schema.evvPayers, { organizationId: ctx.orgId, name: d.name, kind: d.kind === "mco" ? "mco" : d.kind === "other" ? "other" : "medicaid_ffs", externalPayerId: d.externalPayerId ?? null, isDefault });
    await evvAudit(ctx, "provider.configure", null, { payers: 1 });
    return done("Payer added.");
  } catch (e) { return failed(e); }
}

export async function savePolicyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await office("evv.configure");
    const d = formToObject(fd) as Record<string, string | undefined>;
    const policy = await getPolicy(ctx, "MN");
    const n = (k: string, min: number, max: number) => { const v = Number(d[k]); if (!Number.isInteger(v) || v < min || v > max) throw new Error(`${k} must be a whole number between ${min} and ${max}.`); return v; };
    await writer(ctx).update(schema.evvPolicies, policy.id, {
      geofenceMeters: n("geofenceMeters", 50, 10_000), maxAccuracyMeters: n("maxAccuracyMeters", 10, 5000), realTimeToleranceMinutes: n("realTimeToleranceMinutes", 0, 1440), maxFutureSkewMinutes: n("maxFutureSkewMinutes", 0, 120),
      maxVisitMinutes: n("maxVisitMinutes", 60, 2880), minVisitMinutes: n("minVisitMinutes", 0, 60), submissionDeadlineDay: n("submissionDeadlineDay", 1, 28), deadlineWarningDays: n("deadlineWarningDays", 1, 28),
      maxSubmissionAttempts: n("maxSubmissionAttempts", 1, 50), ackTimeoutHours: n("ackTimeoutHours", 1, 720),
      liveInNonRealTimeAllowed: fd.get("liveInNonRealTimeAllowed") === "true", billingHoldOnNoncompliant: fd.get("billingHoldOnNoncompliant") === "true",
    });
    await evvAudit(ctx, "provider.configure", null, { policy: Object.keys(d) });
    return done("Policy saved.");
  } catch (e) { return failed(e); }
}

export async function addRuleAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const ctx = await office("evv.configure");
    const d = formToObject(fd) as Record<string, string | undefined>;
    if (!d.serviceCode || !/^[A-Za-z][0-9A-Za-z]{3,5}$/.test(d.serviceCode)) return { errors: { serviceCode: "Enter the HCPCS code" } };
    if (!d.label) return { errors: { label: "Required" } };
    if (!d.effectiveFrom) return { errors: { effectiveFrom: "Required" } };
    const mods = (v?: string) => (v ?? "").toUpperCase().split(/[\s,]+/).filter(Boolean);
    let version = 1;
    if (d.supersedesId) {
      const [old] = await ctx.db.select().from(schema.evvServiceRules).where(eq(schema.evvServiceRules.id, d.supersedesId)).limit(1);
      if (!old || old.organizationId !== ctx.orgId) return { message: "Rule to replace not found." };
      version = old.version + 1;
      await writer(ctx).update(schema.evvServiceRules, old.id, { active: false, effectiveTo: old.effectiveTo ?? d.effectiveFrom });
    }
    const row = await writer(ctx).insert(schema.evvServiceRules, {
      organizationId: ctx.orgId, state: "MN", serviceCode: d.serviceCode.toUpperCase(), requiredModifiers: mods(d.requiredModifiers), excludedModifiers: mods(d.excludedModifiers), allowAdditionalModifiers: fd.get("allowAdditionalModifiers") !== "false",
      label: d.label, requiresEvv: fd.get("requiresEvv") !== "false", unitType: (["fifteen_minute", "hourly", "daily", "per_visit"].includes(d.unitType ?? "") ? d.unitType : "fifteen_minute") as "fifteen_minute", sharedCare: fd.get("sharedCare") === "true",
      effectiveFrom: d.effectiveFrom, effectiveTo: d.effectiveTo ?? null, version, supersedesId: d.supersedesId ?? null, sourceUrl: d.sourceUrl ?? null, sourceLabel: d.sourceLabel ?? null, createdBy: ctx.actorUserId,
    });
    await evvAudit(ctx, "rule.create", null, { ruleId: row.id, serviceCode: row.serviceCode, version });
    return done(version > 1 ? "New rule version saved; the old one is closed." : "Rule added.");
  } catch (e) { return failed(e); }
}

export async function retireRuleAction(id: string): Promise<ActionState> {
  try { const ctx = await office("evv.configure"); const [row] = await ctx.db.select().from(schema.evvServiceRules).where(eq(schema.evvServiceRules.id, id)).limit(1); if (!row || row.organizationId !== ctx.orgId) return { message: "Not found." }; await writer(ctx).update(schema.evvServiceRules, id, { active: false, effectiveTo: row.effectiveTo ?? new Date().toISOString().slice(0, 10) }); await evvAudit(ctx, "rule.retire", null, { ruleId: id }); return done("Rule retired."); } catch (e) { return failed(e); }
}

export async function addLiveInAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  try { await createLiveInRelationship(await office("evv.configure"), formToObject(fd)); return done("Live-in relationship recorded."); } catch (e) { return failed(e); }
}

export async function endLiveInAction(id: string, effectiveTo: string): Promise<ActionState> {
  try { await endLiveInRelationship(await office("evv.configure"), id, effectiveTo); return done("Relationship ended."); } catch (e) { return failed(e); }
}

/* ---------- integration ---------- */

export async function runQueueAction(): Promise<ActionState> {
  try { const r = await processQueue(await office("evv.manage_integration"), adapterFromEnv()); return done(`Processed ${r.processed} submission${r.processed === 1 ? "" : "s"}${r.processed ? `: ${Object.entries(r.byStatus).map(([k, v]) => `${v} ${k}`).join(", ")}` : ""}.`); } catch (e) { return failed(e); }
}

export async function reconcileAction(): Promise<ActionState> {
  try { const r = await reconcile(await office("evv.manage_integration"), adapterFromEnv()); return done(`Reconciled: ${r.acknowledged} acknowledged, ${r.rejected} rejected, ${r.requeued} re-queued, ${r.deadlineWarnings} deadline warning${r.deadlineWarnings === 1 ? "" : "s"}.`); } catch (e) { return failed(e); }
}
