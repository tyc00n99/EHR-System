# Waystar billing integration — Phase 0 plan

Status: **Phase 0 (discovery and plan). Awaiting approval. No feature code beyond what is already on PR #26.**
Written 2026-10-19. Owner: Tycoon. This file is the record of what is known, what is assumed, and what blocks production. Update it whenever a document lands in `docs/waystar/`.

Labels used throughout:
- **Verified**: read in this repository, or in an authoritative source cited inline.
- **Policy**: a product decision for you to approve; not a regulatory fact.
- **Unverified**: believed but not yet confirmed against an authoritative document. Must not drive production behaviour until verified.
- **Unknown**: needs an answer from you, Waystar, DHS or a payer.

---

## 1. What the repository has today

### 1.1 Stack and infrastructure (verified)
| Area | What exists | Where |
| --- | --- | --- |
| App | Next.js 16 App Router, React 19, TypeScript, Tailwind v4 | `package.json`, `src/app` |
| Database | Postgres (Neon) in production, PGlite locally; Drizzle ORM; migrations under `drizzle/`, applied at build by `scripts/migrate.ts` | `src/db/schema.ts`, `src/db/index.ts` |
| Background jobs | Vercel Cron hitting `/api/cron/*` route handlers, authenticated by `CRON_SECRET` (`requireCron`). No queue/worker system; durability comes from database rows (`evv_submissions` is the pattern). | `vercel.json`, `src/app/api/cron/*`, `src/evv/api.ts` |
| File storage | `stored_files` table (bytea), served only through authenticated route handlers with `Cache-Control: private, no-store`. No object store, no documented retention policy. | `src/db/schema.ts` (`storedFiles`) |
| Tests | `node --test` with `tsx`, in-memory PGlite with the real migrations, two-tenant fixtures | `src/evv/__tests__/harness.ts`, `npm test` |
| Secrets | Environment variables (Vercel project env), documented in `.env.example`. Nothing committed. | `.env.example` |
| Logging/analytics | No Sentry, analytics or log drain packages in the repo. `console` logging only; EVV bridge logs "without PHI" by convention. | grep of `package.json`/`src` |

### 1.2 Tenancy, permissions, audit, encryption (verified)
- **Tenancy**: the app is effectively one organisation per database (`getOrganization()` reads the first row). The EVV module is the exception: every EVV table carries `organization_id` and every EVV query is scoped by `EvvCtx.orgId`, with a two-tenant isolation test (`src/evv/__tests__/tenant.test.ts`). **Billing should follow the EVV pattern** (org-scoped tables and queries, tested across two tenants) so it does not deepen the single-tenant assumption.
- **Roles and abilities**: `requireAbility("billing")` gates the Billing page; abilities are editable per role in Settings → Roles (`src/lib/abilities.ts`). One `billing` ability today; no split between preparing, approving and posting.
- **Audit**: every PHI write goes through `audited(db, actor)` (`src/db/audited.ts`), which writes before/after snapshots to `audit_log` in the same transaction; `event("reveal", …)` records sensitive reads.
- **Encryption**: AES-256-GCM field encryption (`src/lib/crypto.ts`, `DATA_ENCRYPTION_KEY`) for SSNs and signing codes. Database-at-rest and TLS-in-transit are provided by Neon/Vercel. No field-level encryption of billing data yet.

### 1.3 Domain models relevant to billing (verified)
| Concept | Today | Gap for billing |
| --- | --- | --- |
| Agency / billing provider | `organizations`: name, tax ID, NPI, UMPI, licence, address, phone. EVV adds `evv_provider_profiles` (legal name, federal tax ID, MHCP provider ID) and `evv_provider_identifiers` (dated NPI/UMPI list). | No taxonomy code, no pay-to address, no service-facility record, two overlapping provider records. |
| Client / patient | `people`: name, DOB, `sexAtBirth`, PMI (8 digits, unique), waiver program enum (CADI, BI, DD, EW, CFSS, CAC), county, address. | Fine as patient demographics. |
| Subscriber / coverage | `client_funding_sources`: free-text payer, waiver, member ID, priority, start/end date. | No relationship-to-subscriber, no link to a payer master, no payer routing ID. PMI is treated as the member ID everywhere. |
| Payer | `evv_payers` (EVV only): name, kind (`medicaid_ffs`/`mco`/`other`), external ID. | No claims payer master or payer profile. |
| Diagnoses | `client_diagnoses`: ICD-10 code, description, primary flag, archive. Entered by staff on the Profile tab. | No source/provenance (who documented it, from what document); no per-claim pointer selection. |
| Authorizations | `service_agreements`: agreement number, HCPCS code, modifiers, authorized units, unit rate (numeric), unit minutes, start/end, county, status, archive. EVV has `checkAuthorization()`. | No rate history, no provider-on-agreement field, no unit reservation ledger. |
| Visits / encounters | `visits`: snapshot of provider tax ID, PMI, service code, modifiers, rendering NPI/UMPI, place of service, units; clock times and GPS; signatures; status; `manualEntry` + evidence. | Usable as the billable service. |
| Notes, signing, edits | Caregiver sign (`staffSignedAt`) and client co-sign (`clientSignedAt`) or unable-to-sign reason. **"A note is accepted when the caregiver submits it… Nothing locks on approval any more; only voided visits are read-only"** (AGENTS.md, Sept 2026). Edits to time/location go through `recordEdit` → `visit_edits` (field diffs) + audit log; documentation fields are overwritten in place. | **Conflicts with your requirement** that notes lock before billing and later changes become addenda. See §7. |
| EVV | `src/evv/`: own visit projection, insert-only events, compliance engine, HHAX aggregator queue, `billingReadiness()` facts. | Reusable as an input to claim readiness; must stay a separate integration. |
| Claims / payments | Only what PR #26 adds (below). No payments, ledger, remittance or work items anywhere. | Most of Phase 1+. |

### 1.4 Existing billing work (PR #26, open, not merged)
| Piece | State | Keep / change |
| --- | --- | --- |
| `src/app/(app)/billing/page.tsx`: ready / on hold / sent claims, service-code chips, pay-period pager | Working against synthetic data | **Keep the shell**, re-shape into the four workspaces (§6). Theme untouched. |
| `src/billing/claims.ts`: readiness holds (signatures, manual evidence, units, diagnosis, address), grouping by client × agreement, no double-billing of a note | Working, tested | **Keep logic, modify**: readiness becomes rule-based and traceable (§5.2); money uses `Math.round(x*100)/100` on floats, which **violates the integer-money requirement** and must change to integer cents. |
| `src/billing/x12-837p.ts`: pure 837P 005010X222A1 builder | Working for our own fixtures only. **Not validated against the TR3, the Minnesota Uniform Companion Guide, or any payer.** | **Keep as a candidate**, behind a payer profile. Several mapping choices are unverified (§4.3). |
| `src/billing/clearinghouse.ts`: mock adapter (accepts everything, auto-"accepts" claims); Waystar adapter that fails closed | Working | **Modify**: the mock's automatic "accepted" status must become explicit synthetic 999/277CA fixtures labelled as mock; the Waystar env names are placeholders and will be renamed once the channel is known. |
| `claim_batches`, `claims`, `claim_lines` tables (migration `0040_claims`) with a single `claim_status` enum | Working | **Modify, don't replace**: add claim versions, transmission attempts, response events and separate status tracks (§5.1). One enum is the "single linear chain" you asked us not to use. |
| `/billing/batches/[id]/837` download, audited | Working | Keep. |
| `/api/cron/claims` with `CLAIMS_AUTO_SEND` | Off by default | **Remove auto-send for now** (your rule: no automatic submission/posting during development). Keep the route for response retrieval later. |
| "Take back" voids a whole batch | Working | Keep only for files that never left EVVora; once a file is delivered, a void must be a void **claim** (frequency code 8) linked to the original, not a local deletion. |

**Recommendation**: leave PR #26 unmerged while this plan is reviewed. If approved, Phase 1 builds on that branch rather than starting over; nothing in it needs to be thrown away, but money handling, the status model and the mock's auto-acceptance must change before it is merged.

### 1.5 Data inconsistency noticed
Seeded notes use `S5135 UC` (individualized home supports without training) but the Billing page labels them "Adult companion services" because it calls `labelForCode(code, [])` without modifiers. Fix in Phase 1 by passing modifiers; flag the seed for review.

---

## 2. Initial billing scope and payer/service requirements matrix

### 2.1 What we bill first (proposed, needs your confirmation)
Services in the seed and the DHS-3945 table in `src/lib/hcpcs.ts`: 245D HCBS waiver services billed per 15-minute unit — individualized home supports (H2014 UC U3, S5135 UC, S5125 UC), adult companion (S5135), homemaker (S5130), in-home respite (S5150), night supervision (S5135 UA), ICLS (H2015 U3). Programs: CADI, DD, BI, CAC fee-for-service.

### 2.2 Matrix
| Item | Requirement | Status | Source / note |
| --- | --- | --- | --- |
| Claim format for HCBS waiver services to MHCP FFS | 837P 005010X222A1 | **Unverified** | Believed standard for waiver services; confirm in the MHCP Provider Manual for each service. Some waiver services may bill differently (e.g. daily or monthly units, customized living). |
| Minnesota uniform companion guide | All group purchasers subject to Minn. Stat. §62J.536 accept the 837P per the MDH Minnesota Uniform Companion Guide (MUCG) v18.0 | **Verified (document exists)**; whether it governs MHCP FFS claims specifically is **Unknown** | MDH, [MUCG v18.0 for 005010X222A1](https://www.health.mn.gov/facilities/ehealth/auc/guides/docs/cg837p.pdf) |
| Atypical provider identification | MUCG: atypical providers use the TIN as primary identifier and `REF*G2` for the payer-assigned secondary identifier | **Verified (MUCG text)**; how MHCP wants the UMPI placed (which loop) is **Unknown** | Our generator puts the UMPI in 2010BB `REF*G2`; **possible conflict**, see §4.3 |
| Member identifier | PMI | **Verified** in-repo usage; claim placement (NM1*IL MI) **Unverified** against MHCP guide |
| Authorization reference | Service agreement number | **Unverified** whether MHCP requires it on the claim (`REF*G1`) or matches the SA by provider/recipient/code/date | MUCG does not mention REF*G1 |
| Units | 15-minute units, `unitMinutes` = 15 on agreements | **Verified** in-repo; DHS rounding rule (e.g. minimum minutes per unit) **Unknown** — no universal rounding rule is applied |
| Rate | From the service agreement's `unitRate` | **Policy** (current behaviour); DHS rate tables / framework rates **Unverified** |
| Diagnosis | At least one ICD-10 on the claim | **Unverified** whether MHCP requires a diagnosis for each waiver service; required by the 837P TR3 HI segment for professional claims (TR3 is licensed, §3) |
| Documentation | Caregiver signature before billing | **Policy** (current) |
| Client co-signature | Required before billing | **Policy**. Note: DHS's Fall 2026 EVV notice says signatures are not an EVV requirement. Making it a billing hold is a product choice. |
| Manual / corrected visits | Hold until evidence confirmed | **Policy** |
| EVV | Must the EVV visit be accepted by the HHAX aggregator before the claim is paid? DHS notice: **Q4 2026 prepayment validation** — "no HHAX record, no payment" | **Verified per DHS notice summarised in AGENTS.md (Oct 16, 2026)**; exact match rules **Unknown**. Readiness shows it as a warning by default, configurable per payer profile. |
| Payer: MHCP fee-for-service | Waystar routes to MHCP | **Unknown**: Waystar payer ID, enrollment, whether MHCP accepts Waystar as a submitter for this provider |
| Payer: managed care (e.g. Elderly Waiver under MSHO/MSC+) | Billed to the health plan, not DHS | **Unverified**; out of initial scope until confirmed |
| CFSS / PCA (T1019) | Different program, possibly different claim rules | Out of initial scope |
| Existing submissions elsewhere | If Sonder already bills any of these services through MN-ITS directly or another vendor, a Waystar submission creates a duplicate | **Unknown — question for you** |

---

## 3. X12 libraries and specification access

### 3.1 Libraries evaluated (npm registry, checked 2026-10-19)
| Package | Licence | Last release | Coverage | Validation | Assessment |
| --- | --- | --- | --- | --- | --- |
| `node-x12` 1.7.1 | MIT | 2022-04 (2.0 pre-release never shipped) | Generic X12 parse/generate/query | Envelope/structure only | Unmaintained; no healthcare semantics. Not recommended. |
| `x12-parser` 1.3.0 | MIT | 2024-09 | Streaming tokenizer, generic | None | Small and maintained; usable as a tokenizer only. |
| `x12` / `x12-js` | MIT | 2016 / 2018 | Generic parser | None | Abandoned. |
| `node-x12-edi` 1.0.15 | MIT | 2026-06 | Generic parse/generate | Minimal | Single maintainer; no TR3 rules. |
| `@cosyte/x12` 0.1.1 | MIT, no deps | 2026-10 (created 2026-07) | Readers/builders for 270/271, 276/277, 277CA, 278, 820, 834, 835, 837P/I/D, 999, TA1, and the 006020 attachment guides | Self-described partial; publishes a KNOWN-LIMITATIONS list | Closest functional fit, but **0.x, three months old, single maintainer**. Would need a code review and pinning before use; not a compliance oracle. |
| `@ediflow/*` (hipaa-x12-005010) | MIT | 2026-05 | Standard definitions for 14 HIPAA sets | Schema-level | New; definitions derived from where? Licensing of TR3 content unclear. |
| `rdpcrystal-edi-library` | Commercial (`License.pdf`) | 2022 | Parse/validate with 5010 rule files | TR3-style rules | Paid; ages; would need procurement. |
| `x12_837_generator` | ISC | 2024 | 837P/837I generator | None | Hobby project. |

**Recommendation (Policy, needs approval)**: keep our own small 837P generator (it is pure, typed and tested) behind the payer profile, and add **no dependency yet**. For inbound 999/277CA/835 parsing, decide after the Waystar companion guide arrives: either write narrow parsers for exactly the loops we consume, or adopt `@cosyte/x12` pinned at a reviewed version. In both cases, conformance comes from Waystar's front-end edits and trading-partner testing, not from the library.

### 3.2 Standards and access
| Document | Needed for | Access |
| --- | --- | --- |
| ASC X12 005010 TR3s: 837P X222A1, 999 X231A1, 277CA X214, 835 X221A1, 276/277 X212 | Authoritative segment/loop rules | **Licensed from X12** (paid). We do not have it. Without it, implementation-guide validation is not possible and our generator is "best effort from public material". |
| Minnesota Uniform Companion Guides (837P, 835, others) | Minnesota-specific rules | Public, MDH ([837P](https://www.health.mn.gov/facilities/ehealth/auc/guides/docs/cg837p.pdf), [835](https://www.health.mn.gov/facilities/ehealth/auc/guides/docs/cg835.pdf)) |
| MHCP Provider Manual (billing, waiver services, 5010 page) | Which services, units, SA matching, atypical IDs | Public, DHS ([5010 resources](https://mn.gov/dhs/partners-and-providers/policies-procedures/minnesota-health-care-programs/provider/billing/5010.jsp)) |
| Waystar companion guide, enrollment and connectivity docs | Channel, file naming, envelopes, receiver ID, response files | **Waystar customer access only** |
| CARC/RARC and claim status code lists | Interpreting 835 and 277 | Published by X12 code committees (viewable); confirm licensing for embedding |
| Claims attachments final rule (X12N 275 006020X314, 277 RFAI 006020X313, HL7 C-CDA Vol 1–2, HL7 Attachments IG March 2022, e-signature standard) | Phase 8 | **Verified** effective May 26, 2026, compliance May 26, 2028 for covered entities ([CMS fact sheet](https://www.cms.gov/files/document/nsg-attachments-final-rule-fact-sheet.pdf), [Federal Register 2026-05676](https://www.govinfo.gov/content/pkg/FR-2026-03-24/pdf/2026-05676.pdf)). Exact C-CDA versions and the e-signature standard must be read from the rule text. X12 006020 TR3s are licensed. |

---

## 4. Conflicts and open technical questions in the existing code

### 4.1 Money
`claims.ts` multiplies `units * Number(unitRate)` in floating point. **Change** to integer cents (`unitRateCents` derived from the numeric string, `amountCents = units * rateCents`), formatted only at the edge.

### 4.2 Status model
Single `claim_status` enum (sent → accepted → paid). **Change** to separate tracks (§5.1). Existing rows map 1:1 into the new tracks via a migration.

### 4.3 837P mapping choices that are unverified
- Billing provider without NPI: name only in 2010AA plus `REF*G2` UMPI in 2010BB. MUCG says atypical providers use TIN as primary and G2 for the secondary ID; which loop MHCP expects is unknown.
- Client as subscriber (`SBR*P*18…*MC`), PMI as `NM1*IL…MI`.
- `REF*G1` with the service agreement number on every claim.
- One claim per client × agreement per batch; no claim-frequency handling yet (1 original, 7 replacement, 8 void).
- Rendering provider on every line (2420A), UMPI via `REF*G2`.
- Service date as clock-in Central date; overnight visits crossing midnight not split.
All of these move into a versioned **MHCP FFS payer profile** and stay marked unverified until checked against the MHCP and Waystar guides.

### 4.4 Notes are not locked
The product deliberately removed note locking (Sept 2026). Your requirement needs lock-before-bill and addenda. See question Q1.

---

## 5. Proposed design

### 5.1 Data model (additive; builds on PR #26 tables)
- **Payer master and profiles**: `payers` (org-scoped; name, kind, routing IDs per submission route) and `payer_profiles` (payer, version, effective dates, JSON mapping/validation rules, `verified` flag with source citations). The 837P builder takes a profile; no payer rule lives in code outside a profile.
- **Coverage**: extend `client_funding_sources` → link to `payers`, add relationship-to-subscriber, subscriber demographics when not self, member ID (defaulting to PMI only when the profile says so).
- **Billing provider**: one `billing_providers` record per org (consolidating `organizations` + `evv_provider_profiles` billing fields): legal name, TIN, NPI, UMPI/MHCP ID, taxonomy, billing and pay-to address, service facility; dated.
- **Authorization rate history**: `service_agreement_rates` (rate cents, effective dates) so a later rate change never alters a submitted claim.
- **Unit ledger**: `authorization_units` rows (`reserved` | `billed` | `released`) per agreement and visit; reservation happens at **biller approval**, becomes billed at **delivery**, released on void, rejection or take-back. A unique constraint on (visit, active) prevents double consumption; approvals run in a serialisable transaction with a row lock on the agreement.
- **Claims**: keep `claims` as the stable claim identity; add `claim_versions` (immutable snapshot JSON of every input: demographics, provider, coverage, diagnoses with pointers, lines with cents, source visit ids and note version hashes; frequency code; link to replaced version), and keep `claim_lines` per version.
- **Transmission**: `claim_batches` (as now) + `transmission_attempts` (attempt id, adapter, idempotency key, state: queued / sending / delivered / delivery_uncertain / failed, timestamps, remote reference).
- **Responses**: `inbound_files` (raw bytes in restricted storage, hash for dedupe, source, retrieved-at, checkpoint) and `response_events` (type 999 / 277CA / 835 / 277RFAI, level clearinghouse vs payer, matched claim version or `unmatched`, codes).
- **Financial ledger**: append-only `ledger_entries` (claim/line/provider-level; payment, adjustment with CARC/RARC group, patient responsibility, reversal, recoupment, unapplied) with an idempotency key from the 835 (TRN + CLP + line identity); `deposits` for EFT/check reconciliation, separate from ERA posting.
- **Work items**: `billing_work_items` (claim or response, kind, owner, due, status, link to correction screen).
- **Enrollment**: `enrollments` (payer × provider × route × transaction × kind: participation / EDI claims / ERA / EFT; status incl. `not_required` and `unknown`; effective dates).
- **Note versions**: `note_versions` (hash + snapshot when locked) and `note_addenda`, depending on Q1.
- All new tables carry `organization_id`; every write via `audited`.

### 5.2 Module boundaries
```
src/billing/
  money.ts            integer-cent arithmetic
  readiness/          rule engine: rules with ids, severity (block|warn), source (verified|policy)
  profiles/           payer profiles (mhcp-ffs@v1 …), each with mapping + edits
  x12/                837P builder (existing), envelopes/control numbers, inbound parsers
  transport/          adapter interface; local-folder mock; SFTP/API stubs that fail closed
  lifecycle/          claim versions, approval, unit reservation, void/replace
  responses/          matching, response events, exceptions queue
  ledger/             posting, reversals, reconciliation
src/app/(app)/billing/  UI only; calls the above through server actions
src/app/api/cron/billing-*  transmission and retrieval workers (no auto-submit in development)
```
EVV stays in `src/evv/`; billing reads EVV facts through `billingReadiness()` and never writes EVV state.

### 5.3 Lifecycle (separate tracks; summary derived)
- Preparation: draft → validation issues ↔ ready → approved.
- Transmission (per attempt): queued → sending → delivered | delivery_uncertain | failed. Uncertain is reconciled (by checking for a 999/acknowledgment or the remote listing) before any retry; never blind-retried.
- Acknowledgment: per source and level — clearinghouse 999 (syntax), clearinghouse/payer 277CA (claim accepted/rejected for processing). Neither is adjudication.
- Documentation requests: open → preparing → submitted → resolved.
- Financial: sum of ledger entries; outstanding = charges − payments − adjustments.
- Summary for the UI: Needs attention > Rejected > Denied > Awaiting response > Partially paid > Paid > Closed, computed from the tracks.

### 5.4 Wireframes (text)
```
Billing  [Ready to bill | Needs attention (n) | Submitted | Payments]      Pay period ‹ Sep 6–19 ›
──────────────────────────────────────────────────────────────────────────────
Ready to bill
 [ ] Harold L.   MHCP FFS   09/07–09/18   S5135 UC   9 lines  152 u   $904.40   Ready
 [ ] Jordan A.   MHCP FFS   09/08–09/17   S5130 TG   4 lines   24 u   $118.80   1 warning ▸
 ─ Approve selected (2) ─   Invalid claims stay listed with their errors; never silently skipped
Needs attention
 Claim  Issue (field-level)                         Owner   Next action            ▸ Fix link
 #1043  Diagnosis missing (HI)                      Mustafa Add on client Profile → /clients/…?tab=profile&section=medical
 #1037  Rejected 277CA A7: invalid member ID        Biller  Correct PMI, resubmit as replacement
Submitted
 Batch 000000014 · mock ⚠ · delivered 10/19 9:02 · 999 accepted · 277CA 3/4 accepted
Payments
 ERA 10/24  $1,104.20  posted 3 claims · unapplied $0 · deposit not yet matched
Claim drawer: header (client, payer, dates, units, amount, version v2, summary status, owner)
 tabs: Lines · Sources (visits, authorization, note versions) · Attempts · Events · Ledger
```
Mock activity carries a visible "Mock — not sent to Waystar" badge everywhere it appears.

### 5.5 Phase order
| Phase | Delivers | Depends on | Acceptance (summary) |
| --- | --- | --- | --- |
| 1 Foundation | money in cents, payer + profile, coverage link, billing provider, claim versions with immutable snapshots, unit ledger, note locking/addenda (per Q1) | Q1–Q4 answers | Editing a rate, demographic or note after approval does not change a stored claim version; two concurrent approvals of the same visit → exactly one succeeds |
| 2 Readiness | rule engine with traceable block/warn rules; EVV as input; enrollment readiness | 1 | Each failing rule names its id, source and fix link; tests for expired/exhausted authorization, unsigned note, overlap, EVV exception |
| 3 UI + first mock workflow | four workspaces, claim drawer, approval, local-folder mock adapter, synthetic 999/277CA/835 fixtures, ledger posting | 1–2 | Authorized visit → signed note → ready → approve → mock deliver → synthetic acks → synthetic ERA posted → reconciled; all screens labelled mock |
| 4 Lifecycle and enrollment | separate tracks, replacement (7) and void (8) claims, enrollment matrix | 3 | Replacement links to original; void releases units; missing ERA enrollment does not block submission |
| 5 X12 hardening | control numbers, profile-driven mapping, structural + profile validation, PWK only if confirmed | Waystar guide, MHCP guide | Validation levels stated; fixtures reviewed against guides |
| 6 Transport | durable jobs, idempotency, uncertain delivery, retrieval checkpoints, SFTP/API adapters | Waystar channel docs | "Remote received, local timeout" test does not duplicate an original |
| 7 Inbound and reconciliation | 999/277CA/835 parsing, matching, exceptions queue, idempotent posting, deposits | 6, TR3 access or guide | Re-processing an ERA posts nothing twice; ambiguous matches go to exceptions |
| 8 Attachments | versioned note PDFs, attachment tracking; 275/C-CDA planned for 2028 | payer workflow | No automatic transmission of notes with every claim |
| 9 Reporting / eligibility | reconciliation and aging views; 270/271 optional | 7 | Metrics defined; corrected claims and reversals not double-counted |

### 5.6 First end-to-end slice (synthetic)
One synthetic client on CADI, one authorization (S5135 UC, 400 units, $5.95), three signed notes → readiness passes → biller approves (units reserved) → local-folder mock writes the 837P to `./data/mock-clearinghouse/outbound/` → a fixture 999 and 277CA are dropped into `inbound/` and processed → a fixture 835 pays two lines in full and denies one with a CARC → ledger shows paid, denied and balance; deposit reconciled by hand. Everything labelled mock.

### 5.7 Tests required (from your list)
Full workflow; missing/expired authorization; exhausted units; duplicate services and simultaneous approval; unsigned note; post-submission addendum; partial batch rejection; duplicate and out-of-order responses; remote receipt then local timeout; corrected and voided claims; repeated ERA; partial payment, reversal, provider-level adjustment (PLB); ambiguous match; unbalanced remittance; unauthorized role; cross-agency access (two-tenant harness). Mock tests prove our workflow, not Waystar interoperability.

### 5.8 PHI handling
Raw 837/999/277/835 files stored in a restricted table (encrypted at the field level with `DATA_ENCRYPTION_KEY`), readable only through audited, ability-gated routes; never logged; parsers log counts and control numbers only. Retention: **Unknown — Q6**. Error messages surfaced to the UI reference claim ids, not names.

---

## 6. Questions for you
1. **Note locking.** Notes stopped locking in September so caregivers could fix them. May I bring back locking at a defined point (proposed: when a biller approves the claim), with later changes recorded as addenda that never overwrite the original?
2. **Who bills what today?** Are any of Sonder's services currently billed through MN-ITS directly, another vendor, or a county? (Duplicate-submission risk.)
3. **Initial payers and programs.** Is the first scope MHCP fee-for-service for CADI/DD/BI/CAC only? Are any clients on Elderly Waiver through a health plan (MSHO/MSC+), which bills the plan rather than DHS?
4. **Roles.** Should preparing, approving and posting be separate abilities (e.g. a biller prepares, an admin approves)?
5. **Client co-signature as a billing hold.** Keep it as a hard block, a warning, or off? (It is our policy, not an EVV rule.)
6. **Retention.** How long should raw claim and remittance files be kept? (Minnesota and Medicaid record-retention periods should be confirmed; proposed placeholder: no deletion until you decide.)
7. **PR #26.** Keep it open and unmerged until Phase 1 is approved, then continue on it? (Recommended.)
8. Does Sonder have, or plan to buy, access to the X12 TR3s (X12 Glass licence)?

## 6a. Answers received (2026-10-19, Tycoon)
1. **Note locking: yes.** Notes lock when a biller approves the claim; later changes are addenda that never overwrite the original. (Supersedes the Sept 2026 "nothing locks" decision for billed notes.)
2. **Nothing is billed today** through any other route, so there is no current duplicate-submission risk. Re-check before go-live.
3. **Some clients are on Elderly Waiver, billed through DHS directly, not a health plan.** EW coverage therefore resolves to the MHCP fee-for-service payer, like the other waivers.
4. **One "billing" permission covers prepare, approve and post** for now; it can be split later in Settings → Roles.
5. **Missing client co-signature blocks billing** (Policy, blocking rule).
6. **Retention: 7 years** for raw claim and payment files (Policy). No automatic deletion is built until a deletion process is approved.
7. **PR #26 stays unmerged** until Phase 1 is approved; Phase 1 continues on that branch.

## 7. Questions for Waystar
1. Supported submission channels for our volume (SFTP, API, portal upload); recommended one for a software vendor submitting on behalf of one provider.
2. Transaction versions supported inbound and outbound (837P 005010X222A1; 999 X231A1; 277CA X214; 835 X221A1; 276/277 X212; 275/277 RFAI 006020 plans).
3. Submitter ID, receiver ID and ISA/GS qualifiers to use; whether EVVora is a separate submitter from Sonder.
4. Payer ID and routing for Minnesota DHS (MHCP) fee-for-service, and for Minnesota MCOs (UCare, Medica, HealthPartners, Blue Plus) if needed later.
5. Enrollment requirements per payer: EDI claims, ERA, EFT; which require payer sign-off; turnaround.
6. Acknowledgment sources: does Waystar return its own 999 and/or 277CA, pass through payer 277CAs, or both? File naming and delivery location for each.
7. Duplicate detection rules (what makes two claims duplicates; how replacements bypass it).
8. Test/certification process, test environment, and test payer.
9. Response retrieval: polling, push, retention on Waystar's side, whether we may delete retrieved files, and any acknowledgment-of-retrieval protocol.
10. Operational windows: cut-off times, expected time to 999 and to 277CA, maintenance windows, support contacts and escalation.
11. Attachment workflow: PWK support, how unsolicited/solicited attachments are delivered, 275 readiness.
12. Security: SFTP host key fingerprints, key types, IP allow-listing; API auth scheme; BAA.
13. Companion guide and any Waystar-specific edits applied before forwarding.

## 8. Questions requiring payer or Minnesota DHS documentation
1. Which 245D waiver services bill on 837P, and any that bill otherwise (daily, monthly, or institutional formats).
2. How MHCP identifies an atypical billing provider on the 837P (UMPI placement: 2010AA vs 2010BB `REF*G2`), and rendering provider requirements for waiver services.
3. Whether the service agreement number must appear on the claim (and where), or claims are matched to the SA by MMIS.
4. Unit rounding and minimum-minute rules per service; shared-care (UN) billing rules.
5. Diagnosis requirements for waiver claims.
6. Q4 2026 EVV prepayment validation: what fields the claim must share with the HHAX record for the match (dates, units, rendering ID), and the denial codes used.
7. Timely filing limits, replacement/void rules (frequency codes, original reference number source).
8. Whether MHCP returns 277CA and 835 to the clearinghouse, and ERA/EFT enrollment through MN-ITS.

## 9. Standards and licensing dependencies
- X12 005010 TR3s (837P, 999, 277CA, 835, 276/277): licensed from X12. Required for implementation-guide validation.
- X12 006020 TR3s for 275 (X314) and 277 RFAI (X313): licensed; needed before Phase 8 generation.
- HL7 C-CDA Vol 1–2 and HL7 Attachments IG (March 2022): HL7 licence terms apply; versions to be read from the final rule.
- CARC/RARC, claim status category/status codes: published code lists; confirm terms for embedding.
- MUCG and MHCP manuals: public.
- Waystar companion guide: customer agreement.

## 10. Production-readiness blockers
1. No Waystar account, companion guide, submitter/receiver IDs, channel or credentials.
2. No confirmed MHCP payer ID at Waystar; enrollment status unknown.
3. 837P mapping unverified against TR3, MUCG and MHCP rules (§4.3).
4. No inbound parsing, matching or ledger.
5. ~~Money uses floating point in PR #26~~ Fixed in Phase 1 (integer cents).
6. ~~Notes are editable after billing~~ Fixed in Phase 1 (lock at approval, database-enforced, addenda).
7. Retention policy for raw transaction files undefined.
8. BAA with Waystar; security review of storage and transport; SFTP host-key verification.
9. Trading-partner testing and Waystar certification.
10. Operational setup: who works the Needs attention queue, response-window alerts, bank deposit reconciliation.

Controls in this plan support HIPAA obligations; they do not by themselves make the platform HIPAA compliant.

---

## 11. Phase 0 sources
- MDH, Minnesota Uniform Companion Guide v18.0, 837P: https://www.health.mn.gov/facilities/ehealth/auc/guides/docs/cg837p.pdf
- MDH, MUCG 835: https://www.health.mn.gov/facilities/ehealth/auc/guides/docs/cg835.pdf
- DHS, MHCP 5010 resources: https://mn.gov/dhs/partners-and-providers/policies-procedures/minnesota-health-care-programs/provider/billing/5010.jsp
- CMS, claims attachments final rule fact sheet: https://www.cms.gov/files/document/nsg-attachments-final-rule-fact-sheet.pdf
- Federal Register 2026-05676: https://www.govinfo.gov/content/pkg/FR-2026-03-24/pdf/2026-05676.pdf
- npm registry metadata for the libraries in §3.1 (queried 2026-10-19).

---

## 12. Phase 1 status (2026-10-19): billing foundation and immutable records

Built on PR #26, migration `0041_billing_foundation` (additive; 0040 untouched).

| Requirement | Where | Notes |
|---|---|---|
| Exact money arithmetic | `src/billing/money.ts` | Integer cents; numeric strings parsed digit by digit; floats refused unless already whole cents. The 837P, claims, lines and versions all use it. |
| Payers and routing IDs | `payers`, `src/billing/profiles/` | Payer rows are per org; mapping/validation rules are **versioned code profiles** (`mhcp-ffs@2026-10-19.1`), not a JSON table, so rule changes are reviewed in code. `verified: false`, open questions listed in the profile. `clearinghouse_payer_id` stays null until Waystar supplies it. |
| Coverage, member ID, relationship | `client_funding_sources.payer_id`, `relationship_to_subscriber` | Primary coverage in force on the date of service is required. Waiver coverage without a link (EW included) resolves to the MHCP FFS payer. Member ID comes from the PMI per the profile. Dependent (non-self) subscribers are blocked, not modelled: MHCP members are their own subscriber. |
| Billing provider, TIN, NPI/UMPI, taxonomy, pay-to | `billing_providers` | One per org, seeded from `organizations`. Taxonomy and pay-to columns exist; the 837P does not emit them yet (unverified whether MHCP wants PRV/2010AB). Service facility (2310C) not modelled yet. |
| Authorizations (code, modifiers, dates, units, rate) | `service_agreements` + `authorization_units` | Units reserved at approval, billed at delivery, released on take-back, failed send, rejection or denial. Partial unique index stops a visit holding two live reservations. Rate history table **not built**: the rate in force is frozen in each claim version instead, so later changes never alter a submitted claim. |
| Visits, diagnoses and pointers, lines, units, charges, POS, dates | existing `visits`, `client_diagnoses`, `claim_lines` | Pointers recorded in the version snapshot (principal = 1). SV1 still points every line at diagnosis 1. |
| Claims, versions, batches | `claims`, `claim_versions`, `claim_batches`, `claim_lines.claim_version_id` | Every version is an insert-only snapshot of all inputs plus a sha256; `claims.current_version_id` points at the latest. |
| Notes locked before billing; addenda | `visits.locked_at/by`, `note_versions`, `note_addenda`, trigger `visits_guard_locked` | Lock happens at biller approval (your answer Q1). The trigger refuses any change to a locked note except the lock columns, and any delete. Actions check first and return a sentence. |
| Snapshot of source documentation | `note_versions` + claim snapshot `notes[]` | Each claim version cites the note version id and hash it was built from. |
| Corrected / replacement and void claims | `prepareCorrection`, `claim_versions.frequency_code/replaces_version_id`, 837P CLM05-3 + REF*F8 | Recorded, not sent. Requires the payer's claim number. Sending them is Phase 4. |
| Transmission attempts, response events, attachments, work items, financial entries | — | **Not built in Phase 1.** They belong to Phases 3–8 and are modelled when their workflow is built, so the tables match the behaviour they support. The batch row keeps a failed send's message for now. |
| Agency isolation | all billing queries take `orgId` | Tested: another org cannot see, take back, poll or correct a claim. The clinical tables remain one organisation per database. |
| No automatic submission or posting | cron, mock | Auto-send removed; the mock returns no responses unless a test stages them; the page labels the mock. |

Tests (`src/evv/__tests__/claims.test.ts`, 15 cases; whole suite 73/73): money; payer resolution incl. EW; coverage and diagnosis holds; signature and manual-evidence holds; approval snapshot, lock and units; immutability after rate, name and note changes (trigger); addenda; mock silence and staged responses; replacement version and REF*F8; take-back and cross-agency refusal; failed send undone; authorization dates, status and cumulative units; simultaneous approvals; Waystar fail-closed.

These validate our workflow against our own reading of the 837P. They do not establish Waystar or MHCP interoperability.

