# UI/UX update — September 2026

## What changed
- Default appearance: cool slate surfaces, restrained teal actions, sans-serif headings, readable secondary labels, and less rounded buttons. Previously saved appearance choices are retained; select Tide in the account menu to see the new default.
- Navigation: Workspace, Care, Operations, and Administration groups; consistent Review queue naming; active Notes navigation also recognizes /notes aliases. Mobile navigation adds active states and a More menu for the remaining role-appropriate modules.
- Dashboard: actionable review categories, five priority items, recent note previews, schedule access, and existing daily shift board. Returned and unsigned metrics open their matching queues. Period units no longer appear as a fraction of authorization totals covering different dates. Setup steps appear below daily work for admins with incomplete setup.
- Review queue: returned notes are now included (previously counted but omitted from rendered groups). Search, issue-type and priority filters, result counts, eight-row group previews, expansion, and clear empty states. Existing audited bulk operations are retained; selections clear when filters change. “Select all matching” includes matching rows hidden by the group preview. A failed save retains selection and reports an error.
- Client profiles: at-a-glance details, clickable phone numbers, emergency contact and active care team on the overview, document shortcuts, clearer Activity and Care team & contacts labels, and safer authorization utilization rendering. Calculated planning dates say “date passed” instead of implying that completion was verified as overdue.
- Accessibility: skip link, labeled account/search/filter controls, active page semantics, reduced-motion support, mobile touch targets, and wrapping profile layout.
- Fonts use the existing bundled font files, avoiding a Google Fonts request during builds.

## Existing behavior retained
Database schema, migrations, dependencies, permission checks, server actions, signing and return workflows, audit writes, billing calculations, medication records, document uploads, exports, and PDF templates are unchanged. No production database or deployment was accessed.

The review data source retains its existing scope: current-pay-period notes (up to 1,000), recent missed shifts, staff checks, and authorization checks. Counts represent issues, and a record may have more than one issue.

## Run
Use the existing README for commands and sample account details. On a clean machine:
1. Run npm ci.
2. Copy .env.example to .env.local and generate a DATA_ENCRYPTION_KEY using the command in that file.
3. For an isolated demo only, leave DATABASE_URL unset and run npm run db:seed.
4. Run npm run dev -- -p 3245.

For an existing deployment, retain its existing environment variables and encryption key. No new schema migration is needed. Do not seed an existing production database.

## Verification
- Existing migrations applied successfully to an isolated local PGlite database.
- Production compilation, TypeScript checking, and route generation passed using Next's webpack build.
- Targeted lint checks passed with zero errors; the client page retains one pre-existing unused audit-variable warning.
- A byte comparison confirmed no changes to schema/migrations, auth/password implementation, or server-action files.
- Production server started successfully. HTTP interaction checks were blocked by this environment's localhost connectivity; browser interactions, authenticated saves, and visual layouts were not exercised.

The environment blocks the tsx CLI's IPC pipe. Migration validation used node --import tsx scripts/migrate.ts, followed by node node_modules/next/dist/bin/next build --webpack. The project's ordinary npm commands are unchanged.
