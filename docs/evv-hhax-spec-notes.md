# HHAeXchange Minnesota aggregator — spec notes (read October 16, 2026)

Source documents, supplied by the user on Oct 16, 2026 (HHAX copyright; not committed):
- *Business Requirements for Third Party EVV Data Aggregation — MN EVV* (May 2023)
- *Minnesota DHS Electronic Visit Verification (EVV) Data Aggregator Specification* (revision 10/28/2024)

These notes are what the adapter in `src/evv/adapters/hhax-minnesota.ts` needs. Copy nothing from here into
customer-facing text; it is engineering reference.

## Status of Sonder Homecare's onboarding
- Oct 16, 2026: **Minnesota HHAeXchange Provider Enrollment Form submitted** (step 1 of the checklist). Portal
  credentials and LMS access arrive in 3–5 days; the Welcome Packet is the third-party-EVV variant.
- Next: step 2, the Third Party EVV Attestation – MN (names EVVora as vendor); HHAX emails within 2 business days.
  Then step 3, the API Configuration ticket ("MN API Onboarding Request") for sandbox credentials.

## Business requirements that bind the product
1. One EVV system per provider number — a third-party system and HHAX's own tool cannot run together.
2. Attestation before anything else; the provider affirms it read both documents.
3. **Real time via API**: new *and edited* data goes to HHAX at the moment of entry. Data sent cannot be modified
   inside HHAX; the provider affirms data is not manipulated after capture. No real time → HHAX may force the
   provider onto its tool.
4. Manual entries and edits must carry a DHS reason code (Appendix B lists them, below).
5. Provider must review and correct HHAX import exceptions (our EVV review queue).
6. Records retained seven years from date of payment.
7. Phase I certification = HHAX sandbox test plan with sign-off by both parties; Phase II = DHS certification at
   go-live. A vendor that has tested once lets later agencies attest "vendor already tested" and skip the cycle.

## Transport
- OAuth2 client credentials: `POST /identity/connect/token` body `client_id`, `client_secret`, `scope` (all issued
  by HHAX). Token lives **30 minutes**; reuse it; re-authenticate on 401. Bearer header on every call.
- Base URLs: sandbox `https://implementation.hhaexchange.com`, production `https://cloud.hhaexchange.com`.
- JSON only, TLS 1.2. **Maximum 5 calls per second per consumer** (429 when exceeded).
- Endpoints (`v1`):
  - `POST /api/v1/caregivers` — create or update one caregiver.
  - `POST /api/v1/visits` — batch of ≤100 visit records (new or update).
  - `PUT /api/v1/visits/{evvmsid}` — update one.
  - `DELETE /api/v1/visits/{evvmsid}` — delete one.
  - `GET /api/v1/visits/transactions/{transactionId}` — status of an earlier submission; returns EVVMSID + status
    per record. **Submission is asynchronous**: a 200 on POST is receipt, not acceptance. The spec does not print
    the status body; confirm its shape in the sandbox.
- **Caregiver records must exist before their visits** — otherwise the visit is rejected.
- Strings longer than the max are truncated silently; required-field problems reject the record.

## Identity
| Field | Value for a single-office 245D agency |
| --- | --- |
| `providerTaxID` | FEIN, 9 digits |
| `office.qualifier` / `identifier` | `FederalTaxID` / the FEIN again (NPI or UMPI per office if multi-office) |
| `member.qualifier` / `identifier` | `MedicaidID` / the client's **PMI** (`admissionId` optional) |
| `caregiver.qualifier` / `identifier` | `ExternalID` / our staff id, ≤20 chars |
| `payerID` | HHAX payer initials: **MIWS** Waiver Services FFS; MINN FMS FFS; MIHH Home Health FFS; MICS CFSS/PCA FFS; MCOs BCMP, HPMP, MDMP, UCMP, UHMP, SCMP, PWMP, ICMP, HHMP |
| `externalVisitID` | our visit id, ≤30 |
| `evvmsId` | HHAX's id on updates, **or** ours prefixed `~` (alphanumeric, `-`, `_`, ≤64) on create and update |

Caregiver record: `providerTaxId`, `qualifier` ExternalID, `externalID`, `ssn` = literal **`999999999`** (never the
real SSN), `dateOfBirth`, `lastName`/`firstName` (30), `gender` Male/Female/Other (default Other), `type` = `Both`,
`professionalLicenseNumber` = UMPI or default `999999999999`, `hireDate` (HHAX says default `1900-01-02`),
address with `state` and `zipcode` required; `email`/`phoneNumber` optional and *cleared* when sent empty.

## Visit record
- `procedureCode` + `procedureModifierCode[]` (≤4, two chars each). Waiver Services FFS table includes:
  H2014 U3; H2014 UC U3; H2014 UC UN U3; H0043 UC U3; H2015 U3; H2032 TF / TF TT; S5125; S5125 UC; S5125 UC UN;
  S5130 TG; S5135; S5135 U4; S5135 UA; S5135 UC; S5135 UC UN; S5150; **S5151 (daily)**; T1005; T1005 TG; S9125.
  MCO tables differ slightly per payer. Match is exact.
- All timestamps **UTC**, `YYYY-MM-DDThh:mm`; `timezone` = `US/Central`.
- `scheduleStartTime`/`scheduleEndTime` required even with no schedule — copy the visit times in.
- `visitStartDateTime`/`visitEndDateTime`: situational; setting them without clock data = **manually confirmed**.
- `evv.clockIn` / `evv.clockOut`: `callDateTime` (presence = confirmed via EVV), `callType` = `Mobile` whenever GPS
  was collected (`Telephony` needs `originatingPhoneNumber`), `callLatitude` (8,6) / `callLongitude` (9,6),
  `serviceAddress` (line1, city, state, zip), optional `locationType` Home/Community; clockOut may carry
  `performedTasks`/`refusedTasks` (waiver duty codes 320–325: 324 IHS with training, 325 without, 320 crisis
  respite, 321 homemaker w/ personal cares, 322 ICLS, 323 night supervision).
- State machine HHAX enforces: clock-out requires clock-in; **once manually confirmed, clock data is refused
  forever; once clock data is in, it cannot change**; a visit > 25 hours is rejected; missed-visit data and clock
  data in one record is rejected; a visit already billed in HHAX cannot be edited through the API.
  → Submit at clock-out, not clock-in, so a live visit is never frozen as "manual".
- `editVisit { edited, reasonCode, actionCode, notes(256) }` whenever a confirmed visit changes.
  Reason codes: 200 phone not linked, 201 member won't allow phone, 202 no phone, 203 phone in use, 204 service
  outside home, 205 phone line down, 206 member cancelled/suspended, **207 address did not link (GPS)**,
  **208 failed to call in, 209 failed to call out, 210 failed both**, 211 called early/late, 212 attendant id or
  task mismatch, 213 invalid FOB code, 214 attendant did not report, 215 FOB on order, 216 FOB malfunction,
  **217 unable to use mobile device, 218 no internet / EVV down, 219 data entry error**, 220 no replacement
  coverage, 221 timesheet received, **222 other**.
  Action codes: 101 confirmed with outside entity, 103 new attendant, 104 rescheduled, 105 cancelled/suspended,
  106 address updated, 107 phone updated, 108 collection method changed, 109 timesheet received and signed by
  supervisor, 110 mutual/cluster/live-in, 111 schedule change, 122 unverified — cannot bill, **123 supervisor
  approved change**, 124 confirmed with member — cannot bill, 125 timesheet verified, 126 other.
- `missedVisit { missed, reasonCode 600–609, actionCode 501–506, notes }`: reasons 600 no replacement, 601 attendant
  no-show, 602 member cancelled/suspended, 603 member refused, 604 refused — aide on vacation, 605–607 COVID,
  608 unplanned hospitalization, 609 other; actions 501 confirmed with member, 502 new attendant, 503 other,
  504 cancelled/suspended, 505 unverified, 506 rescheduled (all "cannot be billed").
- `billing { externalInvoiceNumber(18), totalBilledAmount, totalUnitsBilled, contractRate, diagnosisCodes[≤26] }`
  sent when the claim line goes out, so the HHAX record matches the claim for Q4 2026 prepayment validation.
- `billSecondaryPayer` block exists for coordination-of-benefits cases; not needed for 245D waiver FFS.
- `residingCaregiver` Yes/No required only for live-in caregivers.

## Errors
- 2xx accepted for processing, 4xx we fix, 5xx HHAX fixes, 429 rate limit.
- Appendix F (EVV) per-field codes 101001–101088, e.g. 101003 provider inactive, 101008 office inactive,
  101013 member inactive, 101018/101019 caregiver inactive / not linked to provider, 101021 visit > 25 h,
  101025–101027 payer missing/invalid/inactive, 101029 externalVisitID required, 101030/101031 EVVMSID
  required/not found, 101034–101037 procedure code missing/not found/inactive/changed, 101040/101041 timezone,
  101042/101043 schedule times, 101046/101048 visit times, 101084 billing fields incomplete, 101086 already billed,
  101088 date error. Appendix E (caregiver) 102001–1020xx mirror these for the caregiver record.

## Adapter build list (`src/evv/adapters/hhax-minnesota.ts`)
1. Token cache (30 min, re-auth on 401); 5 req/s throttle; both base URLs behind `EVV_HHAX_ENV`.
2. Caregiver sync: on staff create/edit and before the first visit for that caregiver; SSN literal default.
3. Visit transform from `evv_visits` + clock-in/out events + policy: UTC, schedule copy, `Mobile` + GPS,
   service address, `~`-prefixed EVVMSID = our visit id, `payerID` from the authorization's payer.
4. Manual/edited visits: map `manualEntryReason` and `visit_edits` reasons to Appendix B codes; action 123 by default.
5. Submit on clock-out (never before); batch ≤100; poll `transactions/{id}` into `checkAcknowledgment`;
   Appendix F → `normalizeRejection`; 429/5xx → retry with backoff, 4xx → correction required.
6. Billing block when the claim line is generated; `DELETE` only for voids that HHAX has not billed.
7. Fixture tests from the spec's sample transactions; remove the `blocked()` schema-pending guard last.
Still unknown until sandbox: client id/secret/scope, the transaction-status response body.
