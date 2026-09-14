# EVV API contracts

All routes are JSON, under `/api/evv/`, and authenticate with the app's session: the `ehr_session`
cookie, or `Authorization: Bearer <session token>` (the same token the cookie carries) for the
caregiver app. Every response carries `cache-control: no-store`. Errors are
`{ "error": { "code", "message", "fields?" } }` — never stack traces, never PHI.

Permissions (`src/evv/permissions.ts`): `evv.clock_in`, `evv.clock_out`, `evv.view_own` (dsp,
supervisor, admin); `evv.view_all`, `evv.review`, `evv.correct`, `evv.resubmit`,
`evv.view_compliance` (supervisor, admin); `evv.configure`, `evv.manage_integration` (admin).
Caregivers only ever see visits whose `staffId` is their own.

Rate limit: 60 requests per caller with 1/s refill, per process (`429 RATE_LIMITED`).

## Clock event body

```json
{
  "eventId": "uuid generated on the device",
  "idempotencyKey": "device-unique string, ≥ 8 chars",
  "deviceCapturedAt": "2026-09-14T15:00:00-05:00",
  "deviceUtcOffsetMinutes": -300,
  "latitude": 44.9778, "longitude": -93.265, "accuracyMeters": 12,
  "locationPermissionDenied": false,
  "locationSource": "gps | network | ivr | fob | manual | none",
  "locationType": "home | community | alternate | protected",
  "verificationMethod": "mobile | ivr | fob | live_in | manual | other",
  "registeredLocationRef": "IVR line or FOB id (optional)",
  "deviceId": "installation id",
  "offline": true,
  "metadata": { "appVersion": "1.2.0", "os": "iOS 19" },
  "manualReason": "required when verificationMethod is manual"
}
```

### `POST /api/evv/visits` — plan a visit
Body: `{ id?, personId, staffId?, serviceAgreementId?, serviceCode?, modifiers?, shiftId?, scheduledStartAt?, scheduledEndAt?, payerId?, liveIn? }`. `id` may be a client-generated UUID. Returns `201 { visit }`.

### `GET /api/evv/visits?from&to` — list (own visits for caregivers)

### `GET /api/evv/visits/{visitId}` — detail
`{ visit (with submissionDeadline), events (no coordinates), versions, corrections, exceptions, submissions, comments, counts }`.

### `POST /api/evv/visits/{visitId}/clock-in`
Body: `{ "event": <clock event>, "visit"?: { personId, staffId?, serviceAgreementId?, serviceCode?, modifiers?, shiftId?, payerId?, liveIn? } }`.
`visit` creates the visit under the given id when the server has never seen it (offline flow).
Responses: `201` stored, `200` duplicate (`duplicate: true`), `403 CAREGIVER_MISMATCH | NOT_ASSIGNED`,
`404 VISIT_NOT_FOUND`, `409 ALREADY_CLOCKED_IN | IDEMPOTENCY_CONFLICT | VISIT_VOIDED`, `422 VALIDATION`.
Body: `{ duplicate, flags: [reason codes raised at ingestion], visit, event: { id, eventId, type, effectiveAt, locationState, delayed, offline } }`.

### `POST /api/evv/visits/{visitId}/clock-out`
Body: `{ "event": <clock event> }`. `201` completed, `202` stored while awaiting a delayed clock-in,
`200` duplicate, `409 ALREADY_CLOCKED_OUT`. After a completed clock-out the server has finalised
duration and units, evaluated compliance and authorization, opened exceptions, queued the
aggregator submission and set billing readiness. The 245D note is never marked complete here.

### `POST /api/evv/visits/{visitId}/corrections` (`evv.correct`)
`{ reasonCode: FORGOT_CLOCK_IN | FORGOT_CLOCK_OUT | DEVICE_FAILURE | NO_CONNECTIVITY | WRONG_CLIENT | WRONG_SERVICE | WRONG_TIME | LOCATION_ERROR | CLIENT_REQUEST | SUPERVISOR_REVIEW | OTHER, explanation (≥ 10 chars), changes: { clockInAt?, clockOutAt?, locationType?, serviceCode?, modifiers?, staffId?, personId?, serviceAgreementId?, verificationMethod? } }`
→ `201 { visit, correction }`. Creates a new version; queues an `update` submission.

### `POST /api/evv/visits/{visitId}/void` (`evv.correct`)
`{ reason (≥ 5 chars), undo?: true }`. Reversible. `DELETE` on the same path returns `405`.

### `POST /api/evv/visits/{visitId}/resubmit` (`evv.resubmit`) → `202 { submission }`
### `POST /api/evv/visits/{visitId}/acknowledge` (`evv.resubmit`) `{ externalReferenceId, note? }`
### `POST /api/evv/visits/{visitId}/review` (`evv.review`) `{ note? }`
### `POST /api/evv/visits/{visitId}/comments` (`evv.review`) `{ body }`
### `GET /api/evv/visits/{visitId}/billing` (`evv.view_all`)
`{ readiness, reasons, facts: { complianceStatus, submissionStatus, accepted, authorizationMatch, unitsSupportedByDuration, manualOrCorrected, outstandingExceptions }, authorization: { found, activeOnDate, serviceMatches, modifiersMatch, unitsWithinAuthorized, unitsUsedBefore, authorizedUnits } }`
### `GET /api/evv/visits/{visitId}/location` (`evv.review`, audited) — decrypted fixes.

### `GET /api/evv/review-queue` (`evv.review`)
Query: `from, to, personId, staffId, serviceCode, complianceStatus, submissionStatus, exceptionType, payerId, billingId, manualOrCorrected, rejected, approachingDeadline, openExceptionsOnly, limit, offset`.
Items carry `exceptions`, `submissionDeadline`, `overdue`.

### `POST /api/evv/exceptions/{exceptionId}` (`evv.review`)
`{ action: "acknowledge" | "resolve" | "assign", note?, assigneeUserId? }`.

### Shared care
`POST /api/evv/shared-care` `{ staffId?, members: [{ personId, serviceAgreementId?, serviceCode?, modifiers?, visitId? }] (2–6), allocation?: "equal" | { personId: units }, note? }` → `201 { groupId, visits }`
`POST /api/evv/shared-care/{groupId}/clock-in` `{ event }` / `.../clock-out` `{ event, allocation? }`.

### Configuration
`GET /api/evv/compliance/summary?from&to` (`evv.view_compliance`) — see `docs/evv-operations.md`.
`GET | POST /api/evv/rules` (`evv.configure` to write; a new version supersedes with `supersedesId`).
`GET | PUT /api/evv/provider` (`evv.configure` to write) — profile, identifiers, payers, policy.
`GET | POST /api/evv/live-in` (`evv.configure` to write).
`GET /api/evv/integration/health` (`evv.manage_integration`).

### Scheduled jobs (Vercel cron, `CRON_SECRET`)
`GET /api/cron/evv-submit` every 15 minutes; `GET /api/cron/evv-reconcile` every 6 hours.
