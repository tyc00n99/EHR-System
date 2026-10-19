/**
 * Minnesota Health Care Programs fee-for-service, billed to DHS (MN-ITS) through the clearinghouse.
 * Waiver services, Elderly Waiver included, go here: the agency bills DHS directly, not a health plan.
 *
 * Every mapping choice below is UNVERIFIED until it is checked against the 837P TR3 (005010X222A1),
 * the Minnesota Uniform Companion Guide and Waystar's companion guide. `verified` stays false and
 * the open questions are listed so nobody mistakes this file for a confirmed specification.
 */
import type { PayerProfile } from "./types";

export const MHCP_FFS_V1: PayerProfile = {
  key: "mhcp-ffs",
  version: "2026-10-19.1",
  name: "Minnesota DHS (MHCP fee-for-service)",
  kind: "medicaid_ffs",
  verified: false,
  sources: [
    "ASC X12N 837P 005010X222A1 (licensed TR3; not yet in docs/waystar/)",
    "Minnesota Uniform Companion Guide for the 837P, v18.0 (public; reviewed, not yet reconciled)",
    "Waystar 837P companion guide (not received)",
  ],
  claimFilingIndicator: "MC",
  memberIdSource: "pmi",
  subscriberMustBePatient: true,
  billingProviderSecondaryId: { loop: "2010BB", qualifier: "G2", value: "umpi" },
  includePriorAuthorization: true,
  maxDiagnosisPointers: 4,
  frequencyCodes: ["1", "7", "8"],
  openQuestions: [
    "Atypical providers: the MN guide puts the TIN first and the UMPI in REF*G2; confirm the loop (2010BB vs 2010AA) for a provider with no NPI.",
    "Whether DHS wants the service agreement number in REF*G1 on every claim.",
    "Waystar's payer ID for Minnesota DHS.",
    "Whether rendering provider loop 2310B is required when it equals the billing provider.",
  ],
};
