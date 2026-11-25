# EVV — HHAeXchange integration checklist (external steps still required)

EVVora's HHAeXchange adapter is built to the Minnesota specification (rev. 10/28/2024); see `evv-hhax-requirements-coverage.md`. Everything below needs DHS,
HHAeXchange, or the provider, and none of it can be inferred from public pages without inventing
endpoints or fields. Track each item here; the code that each unblocks is named.

| # | Step | Owner | Unblocks |
| --- | --- | --- | --- |
| 1 | Review the current Minnesota HHAX third-party EDI / API specification (visit record layout, required fields, code tables, authentication, endpoints, acknowledgment format). | Provider + EVVora | Done Nov 25, 2026 |
| 2 | Submit provider / vendor enrollment information to DHS (legal name, tax ID, Medicaid provider ID, all NPIs/UMPIs, payers/MCOs). Mirror it in `PUT /api/evv/provider`. | Provider | `evv_provider_profiles`, `evv_provider_identifiers`, `evv_payers` |
| 3 | Open the Minnesota EVV third-party integration request (DHS EVV onboarding page). | Provider | — |
| 4 | Complete the HHAX third-party EVV attestation. | Provider | — |
| 5 | Obtain sandbox/test credentials and the sandbox base URL. | HHAX | `EVV_AGGREGATOR_ADAPTER=hhax_mn`, `HHAX_ENVIRONMENT=sandbox`, `HHAX_CLIENT_ID`, `HHAX_CLIENT_SECRET`, `HHAX_SCOPE`, `EVV_SUBMISSION_ENABLED=1` |
| 6 | Mapping is built (Nov 25, 2026). In the sandbox, confirm the receipt and transaction-status response bodies against `transactionIdFrom` / `readTransaction` and adjust if HHAX's shape differs. | EVVora | `src/evv/adapters/hhax-minnesota.ts` |
| 7 | Submit test caregivers, members and visits (synthetic data only) to the sandbox. | Provider + EVVora | — |
| 8 | Validate acknowledgment and rejection handling end to end (accepted, accepted with warning, validation rejection, transient failure, duplicate). | EVVora | `reconcile()`, `processSubmission()` |
| 9 | Receive production credentials and base URL. | HHAX | `HHAX_ENVIRONMENT=production` |
| 10 | Enable production submission by feature flag: `EVV_SUBMISSION_ENABLED=1`, then the profile's `productionEnabled: true` via `PUT /api/evv/provider`. `GET /api/evv/integration/health` must report `productionSubmissionActive: true`. | Provider admin | `adapterFromEnv`, `evv_provider_profiles.production_enabled` |
| 11 | Conduct a controlled pilot: one caregiver, a few clients, daily review of `GET /api/evv/review-queue?rejected=true` and the compliance summary. | Provider | — |
| 12 | Monitor DHS provider compliance reports monthly against `GET /api/evv/compliance/summary` (which is an estimate, not the determination); adjust `evv_policies` where DHS's published tolerances differ from the defaults. | Provider | `evv_policies` |

Official references: Minnesota EVV overview and onboarding pages (mn.gov/dhs → EVV), the DHS EVV
compliance policy and verification-methods bulletins, and the CMS EVV outcomes and metrics.
Nothing in this repository claims certification with HHAeXchange.
