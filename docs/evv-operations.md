# EVV operations: configuration, HHAX adapter, testing, deployment, onboarding, security

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EVV_AGGREGATOR_ADAPTER` | `mock` (default) or `hhax_mn`. |
| `EVV_SUBMISSION_ENABLED` | `1` to allow the HHAX adapter to transmit. Feature flag; off by default. |
| `HHAX_ENVIRONMENT` | `off`, `sandbox` or `production`. |
| `HHAX_BASE_URL` | Provided at onboarding. No default. |
| `HHAX_VISIT_PATH`, `HHAX_ACK_PATH` | Endpoint paths from the official specification. No default. |
| `HHAX_CLIENT_ID`, `HHAX_PROVIDER_ID`, `HHAX_CLIENT_SECRET` | Credentials issued by HHAX. Never committed, never logged. |
| `HHAX_TIMEOUT_MS` | Transport timeout (default 15000). |
| `CRON_SECRET` | Shared secret for the two EVV cron routes (already used by the code-rotation job). |
| `DATA_ENCRYPTION_KEY` | Existing key; also encrypts event coordinates. |

Everything else (geofence, real-time tolerance, deadline day, retry schedule, ack timeout) lives on
the `evv_policies` row and is edited through `PUT /api/evv/provider` `{ policy: {...} }`.

## The HHAX adapter and what is still blocked

`src/evv/adapters/hhax-minnesota.ts` implements the `EvvAggregatorAdapter` interface and fails
closed. With any configuration value missing, `submit` returns `blocked`; with everything present
it *still* returns `blocked`, because the official Minnesota HHAeXchange visit schema, endpoint
paths, authentication scheme and rejection-code table are not in this repository and are not
guessed. `GET /api/evv/integration/health` says so explicitly. Submissions land in
`blocked` and are re-queued automatically by reconciliation once `health().ok` is true.

Work that stays blocked until DHS/HHAX provide the material (see
`docs/evv-hhax-integration-checklist.md`):

1. Field mapping in `MinnesotaHhaxAdapter.transform()` from `OutboundVisit` (EVVora's canonical
   shape, `schema: "evvora-canonical/1"`) to the official visit record.
2. Authentication headers in `FetchHhaxTransport`.
3. Acknowledgment parsing in `checkAcknowledgment()` and `reconcile()`.
4. The vendor rejection-code table in `normalizeRejection()`.
5. Any state tolerances the official compliance policy specifies (set them on `evv_policies`).

The mock adapter (`src/evv/adapters/mock.ts`) is the default everywhere and is what the tests use.
It never leaves the process.

## Testing

```bash
npm test
```

Runs `node --test` over `src/evv/__tests__/*.test.ts` with an in-memory PGlite database and the
real migrations. No network, no real aggregator, invented names and PMIs only. Suites:

- `pure.test.ts` — compliance engine branches, Minnesota rule matching, geofence classification,
  DST / midnight dates, deadline arithmetic, units, backoff.
- `ingest.test.ts` — home and community visits, offline sync and duplicates, out-of-order events,
  GPS permission and accuracy, manual entry, overlaps and duplicates, EVV-required vs not, expired
  and exhausted authorizations, missing provider identifiers, DST transition, midnight crossing,
  event immutability and integrity hashes, caregiver mismatch.
- `workflow.test.ts` — corrections and resubmission, live-in (documented and not), shared care,
  transient failure with retry, permanent rejection, dead letter, fail-closed HHAX adapter,
  acknowledgment reconciliation, deadline alerts, void instead of delete, queue filters, reporting.
- `tenant.test.ts` — cross-tenant access, permissions, unassigned caregiver.

Also: `npm run lint`, `npx tsc --noEmit -p .`, `npm run build`.

## Deployment and rollback

1. Deploy normally; `npm run build` applies `drizzle/0022_evv.sql` (16 new tables, four nullable
   columns on `client_locations`). Existing data is untouched.
2. `vercel.json` schedules `/api/cron/evv-submit` (every 15 min) and `/api/cron/evv-reconcile`
   (every 6 h). Both need `CRON_SECRET`.
3. Leave `EVV_AGGREGATOR_ADAPTER=mock` (or unset) until HHAX credentials exist. The mock accepts
   locally and nothing leaves the server.
4. First run in an existing deployment: the module creates the provider profile, policy row,
   default payer and Minnesota rules on first use (`ensureEvvDefaults`). Review them at
   `GET /api/evv/provider` and `GET /api/evv/rules`.
5. Optional backfill of historical notes: `npm run evv:backfill` (dry run), then
   `npm run evv:backfill -- --apply [--since YYYY-MM-DD]`. Backfilled rows are `imported = true`,
   their events are verification method `other` with `imported: true` metadata, and the engine
   reports `IMPORTED_NOT_VERIFIED` — they are never represented as verified in real time.

Rollback: the migration only adds. To remove the module's tables run
`drizzle/manual/0022_evv_down.sql` (drops the `evv_*` tables and the four `client_locations`
columns) and remove the `0022_evv` entry from `drizzle/meta/_journal.json`; application code from
before this change runs against the resulting schema. Do this only if the tables hold nothing you
need — the down script is destructive by definition.

## Provider onboarding workflow (inside EVVora)

1. `PUT /api/evv/provider` with legal name, federal tax ID, Minnesota Medicaid provider ID, every
   NPI and UMPI, payers/MCOs, `evvSystem: "third_party"`.
2. Geocode client homes: set `lat`/`lng` on each client's default `client_locations` row (and
   `protectedAddress` for Safe at Home participants, `ivrPhone` for telephony).
3. Review `GET /api/evv/rules`; add payer-specific or newer versions as DHS publishes them.
4. Record live-in relationships (`POST /api/evv/live-in`) before any live-in entry is captured.
5. Run with the mock adapter until the HHAX checklist is complete, then set the HHAX variables,
   `EVV_SUBMISSION_ENABLED=1`, and the profile's `productionEnabled: true` — in that order, after a
   sandbox pilot.

## Security and PHI-handling decisions

- Tenant isolation: every EVV query filters on `organization_id`; proven by `tenant.test.ts`.
- Role-based access: per-route permission checks; caregivers restricted to their own visits;
  unique logins (`users.email` unique, `users.staffId` links one caregiver) — no shared caregiver
  accounts are created by this module.
- Transport: HTTPS via Vercel; the HHAX transport uses `fetch` over the configured HTTPS base URL.
- At rest: coordinates encrypted with AES-256-GCM; reveal is a separate, audited route.
- Logs: route errors log the message only; submission attempts store a payload hash; audit details
  carry ids, codes and counts, never names or coordinates; the mock adapter keeps payloads in memory
  for tests only.
- Immutability: `evv_events`, `evv_visit_versions`, `evv_submission_attempts` and
  `evv_audit_events` are insert-only by code; the audit chain is verifiable (`verifyChain`).
- Idempotency: (tenant, event id) and (tenant, idempotency key) are unique; submission keys are
  `visit:version:operation`.
- Rate limiting: token bucket per caller per process (serverless instances each hold their own).
- Sessions: the host's 30-day revocable sessions; bearer tokens are the same sessions.
- Secrets: environment only; `.env*` is git-ignored; no defaults for any HHAX value.
- Deletion: there is no delete path for EVV visits; `void` is reversible and retains everything.
- Assumptions: "real time" has no official numeric definition in the documents reviewed, so it is
  the policy row's `realTimeToleranceMinutes` (default 60) and must be set by the provider from
  the DHS compliance policy; the 500 m geofence and 200 m accuracy defaults are likewise
  EVVora defaults, not DHS numbers; the date of service is the clock-in's Central date; the
  monthly deadline defaults to the 14th and is configurable.
