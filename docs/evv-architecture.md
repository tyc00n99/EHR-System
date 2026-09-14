# EVV module — architecture, data model and status definitions

EVVora's Electronic Visit Verification module lives in `src/evv/` and is isolated from the rest of the
application: it has its own tables, its own audit trail and its own HTTP surface under `/api/evv/*`.
The 245D service note (`visits`) stays the source of truth for documentation; an EVV visit links
to it and never replaces it.

## Layers

| Layer | Where | Notes |
| --- | --- | --- |
| Canonical domain model | `src/db/schema.ts` (tables prefixed `evv_`), `src/evv/types.ts` | No aggregator field names anywhere. |
| Event ingestion | `src/evv/ingest.ts` | Clock-in / clock-out; idempotent; never discards an authentic event. |
| Compliance engine | `src/evv/compliance.ts`, `src/evv/policy.ts` | Pure and deterministic; every tolerance comes from `evv_policies`. |
| Exceptions & corrections | `src/evv/visits.ts` (exceptions), `src/evv/corrections.ts` | Versioned; originals retained. |
| Aggregator adapter | `src/evv/adapters/` | `EvvAggregatorAdapter` interface, `MinnesotaHhaxAdapter` (fails closed), `MockAggregatorAdapter`. |
| Submission queue | `src/evv/submission.ts` + `/api/cron/evv-submit` | DB-backed, exponential backoff with jitter, dead-letter. |
| Reconciliation | `src/evv/reconciliation.ts` + `/api/cron/evv-reconcile` | Acknowledgments, stuck rows, monthly deadline. |
| Authorization & claims linkage | `src/evv/authorization.ts` | Separate facts, no single `isValid`. |
| Reporting | `src/evv/reporting.ts` | Estimated internal rate, labelled as such. |
| Immutable audit | `src/evv/audit.ts` (`evv_audit_events`, hash-chained) + the host's `audit_log` via `audited()` | |
| HTTP | `src/evv/api.ts`, `src/app/api/evv/**` | Cookie or bearer session; permission per route; rate limit. |
| Bridge from the existing web clock | `src/evv/bridge.ts` | Web clock-in/out, manual entry, edit and void produce EVV records too. |

## Tenancy

The host application is one organisation per database. Every EVV table nevertheless carries
`organization_id` and every query in `src/evv/` is scoped by the `EvvCtx.orgId` it is given, so the
module is provably isolated (see `src/evv/__tests__/tenant.test.ts`, which runs two organisations
in one database). `contextFor`/`defaultOrganizationId` resolve the tenant today; a shared database
later only needs a different resolver.

## Data model

- `evv_provider_profiles` — legal name, federal tax ID, Minnesota Medicaid provider ID, HHAX
  provider identifier, EVV system selection, production-enablement flag, time zone.
- `evv_provider_identifiers` — every NPI / UMPI associated with the tax ID, effective-dated.
- `evv_payers` — payers / MCOs.
- `evv_policies` — per-state tolerances: geofence metres, max GPS accuracy, real-time tolerance,
  future-skew limit, min/max visit minutes, monthly deadline day, warning window, live-in
  non-real-time allowance, billing hold, retry schedule, ack timeout. Nothing is hardcoded.
- `evv_service_rules` — versioned rules deciding whether a code + modifier combination requires
  EVV (required / excluded modifiers, unit type, shared care, payer scope, effective dates, source
  URL and date). Seeded from the DHS list in `src/evv/rules.ts` (`MN_EVV_RULE_SEED`).
- `evv_live_in_relationships` — documented, effective-dated live-in caregiver relationships.
- `evv_shared_care_groups` — one occurrence with several clients and the allocation method.
- `evv_visits` — the canonical visit (current projection, `version` column). Provider identifiers,
  member ID and service are snapshotted at creation.
- `evv_visit_versions` — insert-only snapshot of the visit at every version, with the cause.
- `evv_events` — insert-only clock-in / clock-out events: client event UUID, idempotency key,
  device-captured time, device UTC offset, server-received time, effective time, encrypted
  coordinates (`location_encrypted`, AES-256-GCM with `DATA_ENCRYPTION_KEY`), accuracy, source,
  location type and classification, distance from home, registered IVR/FOB reference, verification
  method, device id, offline and delayed flags, actor, non-PHI metadata, integrity hash.
- `evv_corrections` — original and corrected values, reason code, explanation, who, when, prior and
  resulting versions, whether it makes the visit noncompliant, whether resubmission is required.
- `evv_exceptions` — open / acknowledged / resolved / waived, assignable, never deleted.
- `evv_visit_comments` — internal reviewer comments.
- `evv_submissions` / `evv_submission_attempts` — one row per visit version per aggregator with
  idempotency key, status, attempts, timestamps, external reference, transport result, normalised
  rejection category, vendor code, message, next retry, resubmission chain; attempts hold a payload
  hash, never the payload.
- `evv_audit_events` — append-only, hash-chained per visit (`verifyChain`).
- `client_locations` gained `lat`, `lng`, `protected_address` and `ivr_phone` (additive, nullable).

Indexes cover tenant, service date, caregiver, client, compliance status, submission status and
external reference id; uniqueness covers (tenant, event id), (tenant, idempotency key),
(tenant, submission idempotency key), (visit, version).

## Status definitions (independent of one another)

**Visit lifecycle** (`evv_visits.status`): `planned` → `in_progress` → `completed`;
`awaiting_clock_in` when a clock-out synced before its clock-in; `voided` (reversible, reason
required, everything retained).

**EVV compliance** (`compliance_status`), decided by `evaluateCompliance`:

| Status | Meaning |
| --- | --- |
| `COMPLIANT` | All six federal elements captured electronically (mobile / IVR / FOB), in real time per policy, with allowed location outcome. Also used, with reason `EVV_NOT_REQUIRED`, for services no rule covers. |
| `NONCOMPLIANT` | Elements present but at least one was manual, corrected, delayed beyond tolerance, outside the geofence without a community designation, without location, by a disallowed method, or an undocumented live-in claim. |
| `INCOMPLETE` | A federal element is missing (usually no clock-out yet). |
| `EXEMPT_LIVE_IN` | A documented live-in relationship covers the date. |
| `PENDING_REVIEW` | Ambiguous: duplicate, caregiver mismatch, implausible values, out-of-order events, aggregator rejection, voided. |

Reason codes are in `src/evv/types.ts` (`REASON`). Authorization problems
(`AUTHORIZATION_*`, `SERVICE_CODE_MISMATCH`, `PROVIDER_IDENTIFIER_MISSING`) are reported in the
reasons but do not decide the status: they are billing facts.

**Submission** (`evv_submissions.status` and the roll-up on the visit): `queued`, `transmitting`,
`submitted` (awaiting acknowledgment), `accepted`, `accepted_with_warning`, `rejected`,
`retry_scheduled`, `correction_required` (validation rejection, waits for a correction),
`resubmitted` (superseded by a later version), `permanently_failed` (dead letter), `blocked`
(configuration missing — never mistaken for acceptance).

**Billing readiness** (`billing_readiness`): `not_ready` (incomplete or voided), `ready`,
`ready_with_warnings` (noncompliant, unaccepted, authorization warnings, open exceptions),
`hold` (policy `billingHoldOnNoncompliant` is on and the visit is noncompliant).
`GET /api/evv/visits/{id}/billing` returns the separate facts behind it.

**Service-note status** (`visits.staffSignedAt`, `approvedAt`, `clientSignedAt`) is untouched by
this module. Signatures are not an EVV requirement.

## Offline synchronisation

- The app generates the event UUID and, for a new visit, the visit UUID.
- `device_captured_at` is stored verbatim and is the visit's clock time; `server_received_at` is
  stored beside it; `effective_at` differs only when the device time is implausibly in the future
  (beyond `maxFutureSkewMinutes`), in which case server time is used and `IMPLAUSIBLE_TIMESTAMP` is
  raised — the device value is still kept.
- A repeat of the same event id or idempotency key returns the original (`duplicate: true`).
- A clock-out that arrives first puts the visit in `awaiting_clock_in`; when the clock-in arrives
  and is earlier, the visit completes; if it is not earlier, both events stay and an
  `OUT_OF_ORDER_EVENTS` exception asks a person.
- An event received later than `realTimeToleranceMinutes` after capture is `delayed`, gets an
  informational `DELAYED_SYNC` exception, and the engine reports `NOT_VERIFIED_REAL_TIME`. Whether
  that makes the visit noncompliant is the policy's call, not a fixed rule.

## Location and privacy

Only clock-in and clock-out carry a fix. Coordinates are encrypted at rest and decrypted only by
`GET /api/evv/visits/{id}/location` (needs `evv.review`, audited as `location.reveal`). The
classification stored beside them (`location_state`) is one of: `captured`, `inside_geofence`,
`outside_geofence`, `community`, `unavailable`, `permission_denied`, `accuracy_insufficient`,
`protected_address`, `registered_location`, `not_applicable`. The geofence distance and accuracy
threshold are policy rows. A client location marked `protected_address` (Safe at Home) is recorded
without any comparison.

## Live-in and shared care

- Live-in: `POST /api/evv/live-in` creates an effective-dated relationship with a documentation
  reference. Only a relationship covering the service date makes a visit `EXEMPT_LIVE_IN`; a visit
  that claims live-in without one is `NONCOMPLIANT` with `LIVE_IN_NOT_DOCUMENTED` and
  `MANUAL_ENTRY`. Whether a live-in entry may be captured outside real time is
  `liveInNonRealTimeAllowed`.
- Shared care: `POST /api/evv/shared-care` creates a group and one visit per client; the group
  clock-in / clock-out routes take one device event and derive one event per client (stable ids,
  so a re-sync is idempotent). Units are computed per visit from the duration and the allocation
  (`equal` or an explicit map) is written to `shared_care_units_allocated` and audited.
