/**
 * A payer profile: the payer-specific mapping, validation and routing rules for a claim, kept in
 * code so every change is reviewed and versioned. A claim version records the profile key and
 * version it was built with, so an old claim can always be explained by the rules in force then.
 */
export interface PayerProfile {
  key: string;
  /** Bumped on any rule change. Old versions stay importable so old claims can be rebuilt. */
  version: string;
  name: string;
  kind: "medicaid_ffs" | "mco" | "other";
  /** False until the rules are checked against the payer's companion guide. */
  verified: boolean;
  sources: string[];
  /** SBR09 claim filing indicator. */
  claimFilingIndicator: string;
  /** Where the subscriber member ID comes from. */
  memberIdSource: "pmi" | "coverage";
  /** True when the payer's members are always their own subscriber (no 2000C patient loop). */
  subscriberMustBePatient: boolean;
  billingProviderSecondaryId: { loop: "2010BB"; qualifier: "G2"; value: "umpi" } | null;
  includePriorAuthorization: boolean;
  maxDiagnosisPointers: number;
  /** CLM05-3 values this payer accepts: 1 original, 7 replacement, 8 void. */
  frequencyCodes: ("1" | "7" | "8")[];
  /** Questions that must be answered before `verified` can become true. */
  openQuestions: string[];
}
