# EVV — HHAeXchange integration checklist (external steps still required)

EVVora's EVV module is complete up to the aggregator boundary. Everything below needs DHS,
HHAeXchange, or the provider, and none of it can be inferred from public pages without inventing
endpoints or fields. Track each item here; the code that each unblocks is named.

| # | Step | Owner | Unblocks |
| --- | --- | --- | --- |
| 1 | Review the current Minnesota HHAX third-party EDI / API specification (visit record layout, required fields, code tables, authentication, endpoints, acknowledgment format). | Provider + EVVora | `MinnesotaHhaxAdapter.transform`, `FetchHhaxTransport` headers, `HHAX_VISIT_PATH`, `HHAX_ACK_PATH`, `normalizeRejection` code table |
| 2 | Submit provider / vendor enrollment information to DHS (legal name, tax ID, Medicaid provider ID, all NPIs/UMPIs, payers/MCOs). Mirror it in `PUT /api/evv/provider`. | Provider | `evv_provider_profiles`, `evv_provider_identifiers`, `evv_payers` |
| 3 | Open the Minnesota EVV third-party integration request (DHS EVV onboarding page). | Provider | — |
| 4 | Complete the HHAX third-party EVV attestation. | Provider | — |
| 5 | Obtain sandbox/test credentials and the sandbox base URL. | HHAX | `HHAX_ENVIRONMENT=sandbox`, `HHAX_BASE_URL`, `HHAX_CLIENT_ID`, `HHAX_PROVIDER_ID`, `HHAX_CLIENT_SECRET` |
| 6 | Complete sandbox mapping: implement the official field mapping in `transform()`, header scheme in the transport, acknowledgment parsing in `checkAcknowledgment()` / `reconcile()`, vendor rejection codes in `normalizeRejection()`; then remove the schema-pending block in `MinnesotaHhaxAdapter.blocked()`. Add fixture tests for each official example record. | EVVora | `src/evv/adapters/hhax-minnesota.ts` |
| 7 | Submit test caregivers, members and visits (synthetic data only) to the sandbox. | Provider + EVVora | — |
| 8 | Validate acknowledgment and rejection handling end to end (accepted, accepted with warning, validation rejection, transient failure, duplicate). | EVVora | `reconcile()`, `processSubmission()` |
| 9 | Receive production credentials and base URL. | HHAX | `HHAX_ENVIRONMENT=production` |
| 10 | Enable production submission by feature flag: `EVV_SUBMISSION_ENABLED=1`, then the profile's `productionEnabled: true` via `PUT /api/evv/provider`. `GET /api/evv/integration/health` must report `productionSubmissionActive: true`. | Provider admin | `adapterFromEnv`, `evv_provider_profiles.production_enabled` |
| 11 | Conduct a controlled pilot: one caregiver, a few clients, daily review of `GET /api/evv/review-queue?rejected=true` and the compliance summary. | Provider | — |
| 12 | Monitor DHS provider compliance reports monthly against `GET /api/evv/compliance/summary` (which is an estimate, not the determination); adjust `evv_policies` where DHS's published tolerances differ from the defaults. | Provider | `evv_policies` |

Official references: Minnesota EVV overview and onboarding pages (mn.gov/dhs → EVV), the DHS EVV
compliance policy and verification-methods bulletins, and the CMS EVV outcomes and metrics.
Nothing in this repository claims certification with HHAeXchange.
