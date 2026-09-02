# 245D EHR

Electronic health record for Minnesota 245D-licensed providers of home and community-based services.

## Run it

```bash
export PATH="/opt/homebrew/bin:$PATH"
npm install
npm run db:seed      # creates ./data/pglite with sample data (first run only)
npm run dev -- -p 3245
```

Open http://localhost:3245 and log in with one of the seeded accounts. Password for all three: `changeme-245d`.

| Email | Role | Can |
|---|---|---|
| admin@example.com | Administrator | Everything, including staff and the audit log |
| supervisor@example.com | Supervisor | Clients, agreements, sites, manual visit entry, visit edits |
| dsp@example.com | Direct support | Clock in and out, see own visits |

`npm run db:reset` wipes the local database and reseeds it. Seeded client signing codes: Jordan Abelard `482113`, Riley Bergstrom `730924`.

### Encryption key

Staff Social Security numbers are encrypted at rest. `npm run db:seed` and the app both read `DATA_ENCRYPTION_KEY` from `.env.local` (a random dev key was generated for you). For production, generate a fresh key, keep it out of the repo, and back it up: losing it makes stored SSNs unreadable.

### AI extraction of service agreements

Uploading a service agreement PDF on the "New service agreement" screen sends it to Claude and prefills the form. This needs an Anthropic API key:

```bash
cp .env.example .env.local   # then paste your key into ANTHROPIC_API_KEY
```

Restart the dev server after editing `.env.local`. Without a key the upload still attaches the PDF; the fields just need typing by hand.

## Month 1 scope

- People served, staff, sites and programs, service agreements.
- Visit record shaped for the HHAeXchange aggregator and the 837P claim line. Identifiers are snapshotted onto the visit at clock-in.
- Mobile clock-in / clock-out as a PWA (`/clock`) with GPS at both ends, task checklist, and shift note.
- Manual entry and edits are first-class visit states: a reason is required, every edit is kept in `visit_edits`, and the visit is flagged `manual_entry` so the evidence is exported with it.
- Every write goes through `src/db/audited.ts`, which records actor, before, and after in the same transaction.
- Roles: admin, supervisor, DSP.
- **Client signing code.** Each person has a private six-digit code (stored hashed). At clock-out, staff read the shift note to the person, who enters the code on the staff phone to co-sign it. Visits closed without a signature carry a reason and are flagged `unsigned` for supervisor review. This is the timesheet-fraud control.
- **Service codes and modifiers** come from DHS-3945 (April 2026) in `src/lib/hcpcs.ts`. All units are 15 minutes.
- Client record also carries email, emergency contact, and the Consultation Services provider.
- **Caregiver side.** Caregivers get a phone-first home (assigned clients, pay-period hours and units, unsigned visits, training alerts), a `/me` page (profile, compliance, training record, password change), and can only clock in with clients assigned to them after a supervisor records orientation to that person (245D.09, subd. 4a).
- **Staff personnel file.** Address, date of birth, gender, SSN (encrypted; last four shown; admin can reveal with an audit entry), and hourly pay rate (admin only) are required on every staff record.
- **Client plans and files.** Supervisors upload the support plan, IAPP, treatment goals, and other files on the client page. Caregivers open them from their assigned clients' pages; files are served through an authenticated route and never from a public folder.
- **Staff compliance.** Each staff member has a credential record (background study, orientation, maltreatment reporting, annual training, first aid, CPR, license, insurance). `src/lib/credentials.ts` evaluates 245D.09 deadlines and surfaces overdue and due-soon items on the staff list, staff detail, and caregiver home. Admins create and manage logins from the staff detail page.

## Architecture

- Next.js 16 App Router, TypeScript, Tailwind v4.
- Drizzle ORM over Postgres. Locally the database is PGlite (embedded Postgres under `./data/pglite`). Moving to hosted Postgres such as Supabase means swapping the driver in `src/db/index.ts`; the schema and migrations are plain Postgres.
- Schema: `src/db/schema.ts`. Migrations: `npm run db:generate` after a schema change, applied automatically at startup.
- Server actions per feature folder under `src/app/(app)/*/actions.ts`, validated with Zod schemas in `src/lib/validation.ts`.
- 245D service catalog and planning-deadline rules: `src/lib/services.ts`, `src/lib/compliance.ts`.
- Unit computation with the 8-minute rule: `src/lib/units.ts`.

## Not yet built

- Aggregator export itself (the record is shaped for it; the transport is Month 2).
- Password reset, account management UI (users are created by the seed script for now).
- State holiday calendar for working-day deadlines.
- A service worker for offline clock-in.
