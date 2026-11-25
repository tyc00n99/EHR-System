# HHAeXchange Minnesota — requirements coverage (November 25, 2026)

Audit of EVVora's EVV backend against three documents Tycoon supplied:
the HHAX *Minnesota DHS EVV Data Aggregator Specification* (rev. 10/28/2024), the *EVV Data
Aggregation Business Requirements – MN* (May 2023), and the HHAX *EVV Integration Agreement*
(the copy supplied is the NJ-titled template; its terms are HHAX's general API terms and the MN
requirements point to the same agreement).

Legend: **Built** = in code and tested · **Config** = built, switched on by configuration ·
**Needs Tycoon** = a signature, a form, credentials or a business decision · **N/A** = does not apply.

## Business requirements (MN)

| # | Requirement | Status | Where |
| --- | --- | --- | --- |
| 1 | One EVV system per provider number | Built | `evvSystem` on the provider profile; `hhax_direct` blocks EVVora from sending (`processSubmission`) |
| 2 | Third-party attestation (Cognito form) | Needs Tycoon | Checklist step 4 |
| 3 | HHAX contacts the provider within 2 business days | Needs Tycoon | — |
| 4 | Test plan, sandbox sign-off, then production credentials | Needs Tycoon | `HHAX_ENVIRONMENT=sandbox` first; production blocked until `productionEnabled` |
| 5 | A vendor already tested can be noted on later attestations | N/A for now | — |
| 6 | Real-time API: new and edited data sent at entry; no change after capture | Built | `src/evv/realtime.ts` sends after clock-out, manual entry, correction, void; events are insert-only; clock data is never resent changed |
| 7 | 21st Century Cures Act six elements | Built | service type, member, date, location, caregiver, start/end in every visit record |
| 8 | DHS reason code on every manual entry and edit | Built | `src/evv/dhs-codes.ts`; corrections carry `dhsReasonCode`/`dhsActionCode` (drawer and API); manual reasons map to codes |
| 9 | Review and correct exceptions | Built | EVV review queue, visit drawer |
| 10 | Keep complying as the spec changes | Ongoing | Code tables in `dhs-codes.ts` carry the spec revision |
| 11 | Retain records 7 years from payment | Built | nothing in EVV is deleted; void is reversible; versions and attempts kept |
| 12 | HHAX distributes visits to payers | N/A (HHAX) | payer ID sent per visit (`MIWS` for Waiver Services FFS) |
| 13 | DDI FFS visits billed through HHAX | Needs Tycoon (decision) | billing block built, off by default (`HHAX_SEND_BILLING`) |

## Specification

| Area | Status | Notes |
| --- | --- | --- |
| OAuth2 client credentials, 30-min token reuse, refresh on 401 | Built | `accessToken()` / `call()` |
| 5 calls/second | Built | shared 200 ms throttle |
| Sandbox / production base URLs | Config | `HHAX_ENVIRONMENT` |
| Caregiver before visit, not resent unchanged | Built | `ensureCaregiverSynced`, `evv_caregiver_syncs` |
| Caregiver SSN | Built | always the literal `999999999`; no real SSN leaves EVVora |
| Visit POST / PUT / DELETE, `~`-prefixed EVVMSID | Built | `submit` / `update` / `voidVisit` |
| Asynchronous result via transactions | Built | receipt → `submitted`; reconcile reads `GET /visits/transactions/{id}` |
| Unchanged data not resent | Built | content hash per attempt |
| UTC `YYYY-MM-DDThh:mm`, `US/Central`, schedule copied from visit | Built | `toHhaxVisit` |
| Calls: Mobile + GPS, Telephony + caller ID, FOB; service address | Built | `callFor`, `memberAddress` |
| Clock data immutable (101052), clock-out needs clock-in (101053) | Built | corrections change visit times only, add `editVisit` |
| Visit edit reason/action codes (Appendix B) | Built | `dhs-codes.ts` |
| MIWS procedure code table, payer initials | Built | local validation 101035 |
| Office qualifier (tax ID / NPI / UMPI) | Built | Settings → EVV |
| Appendix E/F rejection codes | Built | normalised into validation / auth / transient / not found |
| Billing block | Config, off | `HHAX_SEND_BILLING=1` |
| Waiver duty codes (performed tasks) | Config, off | `HHAX_SEND_TASKS=1` |
| Missed visits (optional) | Not built on purpose | would count against compliance; codes are in `dhs-codes.ts` for later |
| Exact receipt and transaction-status bodies | Needs sandbox | parser is tolerant; confirm against real responses |

## Integration agreement terms that touch the code

- Credentials confidential, no shared accounts: secrets only in Vercel env, never logged.
- Reasonable volume and rate limits: throttle and the "not resent unchanged" rule.
- Do not cache or store data accessed through the API: EVVora stores only its own submissions and
  HHAX's transaction id and status, not records pulled from HHAX.
- HHAX may audit API use; liability capped at $2,500; HHAX acts as claim submitter for billed visits.
  **Accepting the agreement is Tycoon's call.**

## NJ-only

Nothing NJ-specific was built. The supplied agreement is the HHAX template; NJ code tables,
NJ payers and NJ timezones do not apply to a Minnesota 245D provider.
