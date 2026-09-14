/**
 * Compliance policy: the state-specific judgement calls, behind an interface so a second state
 * is a second class, not a rewrite. Every tolerance comes from the `evv_policies` row.
 */
import type { EvvPolicy } from "@/db/schema";
import type { VerificationMethod } from "./types";

export interface EvvCompliancePolicy {
  readonly state: string;
  readonly config: EvvPolicy;
  /** Verification methods that count as electronic capture for this state. */
  electronicMethods(): ReadonlySet<VerificationMethod>;
  /** Whether a device→server delay of this many minutes still counts as real time. */
  isRealTime(delayMinutes: number): boolean;
  /** Whether a live-in caregiver's entry may be captured outside real time. */
  liveInMayBeNonRealTime(): boolean;
  /** Whether billing should hold, rather than warn, on a noncompliant visit. */
  holdBillingOnNoncompliant(): boolean;
}

export class MinnesotaEvvCompliancePolicy implements EvvCompliancePolicy {
  readonly state = "MN";
  constructor(readonly config: EvvPolicy) {}
  electronicMethods(): ReadonlySet<VerificationMethod> {
    // Minnesota's approved methods: mobile app (GPS), telephony (IVR), and a fixed device (FOB).
    return new Set<VerificationMethod>(["mobile", "ivr", "fob"]);
  }
  isRealTime(delayMinutes: number): boolean {
    return delayMinutes <= this.config.realTimeToleranceMinutes;
  }
  liveInMayBeNonRealTime(): boolean {
    return this.config.liveInNonRealTimeAllowed;
  }
  holdBillingOnNoncompliant(): boolean {
    return this.config.billingHoldOnNoncompliant;
  }
}

export function policyFor(config: EvvPolicy): EvvCompliancePolicy {
  switch (config.state) {
    case "MN":
    default:
      return new MinnesotaEvvCompliancePolicy(config);
  }
}

export const MN_POLICY_SOURCES = {
  compliance: "https://www.dhs.state.mn.us/main/idcplg?IdcService=GET_DYNAMIC_CONVERSION&RevisionSelectionMethod=LatestReleased&dDocName=mndhs-067176",
  verificationMethods: "https://www.dhs.state.mn.us/main/idcplg?IdcService=GET_DYNAMIC_CONVERSION&RevisionSelectionMethod=LatestReleased&dDocName=mndhs-063376",
  overview: "https://mn.gov/dhs/partners-and-providers/news-initiatives-reports-workgroups/long-term-services-and-supports/evv/",
} as const;
