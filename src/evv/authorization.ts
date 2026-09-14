/**
 * Authorization and claims linkage. Each check is its own fact — no single `isValid` — because
 * a claim reviewer needs to know *which* thing is wrong: the span, the units, the code.
 */
import { and, eq, ne, sum } from "drizzle-orm";
import { schema } from "@/db";
import type { EvvPolicy, EvvSubmission, EvvVisit } from "@/db/schema";
import type { EvvCtx } from "./context";
import { policyFor } from "./policy";
import { REASON, type AuthorizationCheck, type BillingReadiness, type ComplianceStatus, type ReasonCode } from "./types";

const norm = (m: string[]) => [...m].map((x) => x.toUpperCase()).sort().join(" ");

/** Compares the visit against its service agreement, counting units already used elsewhere on it. */
export async function checkAuthorization(ctx: EvvCtx, visit: EvvVisit): Promise<AuthorizationCheck | null> {
  if (!visit.serviceAgreementId) return { found: false, activeOnDate: false, serviceMatches: false, modifiersMatch: false, unitsWithinAuthorized: false, unitsUsedBefore: 0, authorizedUnits: 0 };
  const [a] = await ctx.db.select().from(schema.serviceAgreements).where(eq(schema.serviceAgreements.id, visit.serviceAgreementId)).limit(1);
  if (!a) return { found: false, activeOnDate: false, serviceMatches: false, modifiersMatch: false, unitsWithinAuthorized: false, unitsUsedBefore: 0, authorizedUnits: 0 };
  const date = visit.serviceDate ?? "";
  const activeOnDate = a.status === "active" && a.startDate <= date && a.endDate >= date;
  const serviceMatches = a.serviceCode.toUpperCase() === visit.serviceCode.toUpperCase();
  const modifiersMatch = norm(a.modifiers) === norm(visit.modifiers);
  const [used] = await ctx.db
    .select({ units: sum(schema.evvVisits.units) })
    .from(schema.evvVisits)
    .where(and(eq(schema.evvVisits.organizationId, ctx.orgId), eq(schema.evvVisits.serviceAgreementId, a.id), ne(schema.evvVisits.id, visit.id), ne(schema.evvVisits.status, "voided")));
  const unitsUsedBefore = Number(used?.units ?? 0);
  const unitsWithinAuthorized = unitsUsedBefore + (visit.units ?? 0) <= a.authorizedUnits;
  return { found: true, activeOnDate, serviceMatches, modifiersMatch, unitsWithinAuthorized, unitsUsedBefore, authorizedUnits: a.authorizedUnits };
}

export interface BillingCheck {
  readiness: BillingReadiness;
  reasons: ReasonCode[];
  /** The separate facts a claim generator asks about. */
  facts: {
    complianceStatus: ComplianceStatus;
    submissionStatus: EvvSubmission["status"] | null;
    accepted: boolean;
    authorizationMatch: boolean;
    unitsSupportedByDuration: boolean;
    manualOrCorrected: boolean;
    outstandingExceptions: number;
  };
}

/**
 * Billing readiness, kept apart from compliance. A noncompliant visit is still billable under
 * the provider's claims-review process unless the policy says to hold it; what the claim
 * generator gets is the list of facts, not a yes/no.
 */
export function billingReadiness(input: { visit: EvvVisit; compliance: { status: ComplianceStatus; reasons: ReasonCode[] }; authorization: AuthorizationCheck | null; submission: EvvSubmission | null; openExceptions: number; policy: EvvPolicy }): BillingCheck {
  const { visit, compliance, authorization, submission, policy } = input;
  const reasons: ReasonCode[] = [];
  const authOk = Boolean(authorization?.found && authorization.activeOnDate && authorization.serviceMatches && authorization.modifiersMatch && authorization.unitsWithinAuthorized);
  if (authorization && !authorization.found) reasons.push(REASON.AUTHORIZATION_MISMATCH);
  if (authorization?.found && !authorization.activeOnDate) reasons.push(REASON.AUTHORIZATION_EXPIRED);
  if (authorization?.found && (!authorization.serviceMatches || !authorization.modifiersMatch)) reasons.push(REASON.SERVICE_CODE_MISMATCH);
  if (authorization?.found && !authorization.unitsWithinAuthorized) reasons.push(REASON.AUTHORIZATION_UNITS_EXCEEDED);
  const manualOrCorrected = visit.manualEntry || visit.corrected;
  if (manualOrCorrected) reasons.push(visit.corrected ? REASON.CORRECTED_VISIT : REASON.MANUAL_ENTRY);
  const unitsSupportedByDuration = visit.units != null && visit.durationMinutes != null && visit.units >= 0;
  const accepted = submission?.status === "accepted" || submission?.status === "accepted_with_warning";
  if (visit.evvRequired && submission?.status === "rejected") reasons.push(REASON.AGGREGATOR_REJECTION);

  let readiness: BillingReadiness;
  if (visit.status === "voided" || compliance.status === "INCOMPLETE" || visit.status !== "completed") readiness = "not_ready";
  else if (compliance.status === "NONCOMPLIANT" && policyFor(policy).holdBillingOnNoncompliant()) readiness = "hold";
  else if (reasons.length || compliance.status === "NONCOMPLIANT" || compliance.status === "PENDING_REVIEW" || (visit.evvRequired && !accepted) || input.openExceptions > 0) readiness = "ready_with_warnings";
  else readiness = "ready";

  return {
    readiness, reasons,
    facts: { complianceStatus: compliance.status, submissionStatus: submission?.status ?? null, accepted, authorizationMatch: authOk, unitsSupportedByDuration, manualOrCorrected, outstandingExceptions: input.openExceptions },
  };
}
