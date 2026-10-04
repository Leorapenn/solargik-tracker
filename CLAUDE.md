# CLAUDE.md

Hard rules for this repo. These apply to everything below, not just the code that existed when they were written.

## Database

- This project uses a hosted **Neon Postgres** database via `DATABASE_URL` in `.env`. There is no local database.
- Never create a `docker-compose.yml`, local Postgres container, or any local database setup. If a task seems to need one, stop and ask instead.
- `.env` holds real secrets and must never be committed. `.env.example` lists variable names only, no values.
- The data model lives in `prisma/schema.prisma`. Treat it as given — if something in it looks wrong, say so and ask rather than changing it silently.

## monday.com

- This repo reads from monday.com. It must **never write back to monday.com** — no mutations, no column updates, no item creation, under any circumstances. All monday.com access is read-only GraphQL queries using `MONDAY_API_TOKEN`.
- The importer (`src/scripts/import-monday.ts`) always takes an explicit list of customer names or project codes as arguments. It must never default to importing every customer/project on the board.
- The importer must be safely re-runnable: match existing rows on `mondayItemId` and update them, never create duplicates.
- Customers board: `7980663322`. Supply Projects board: `6272830165`. Control Table board: `5738893445`.
- The project-to-customer link is the board_relation column `board_relation2__1` on Supply Projects. The `dropdown__1` Customer column on that board is a separate, conflicting list — do not use it for linking.
- Contract value, capacity, and country are read directly from the Control Table board (`5738893445`), not from mirror columns on Supply Projects — those mirror columns are not readable through the monday API (they return as an unsupported type).
- Customer name resolution goes through `Customer.name` and `CustomerAlias` only. Anything that doesn't resolve creates an `ImportReviewItem` and must **not** create a new `Customer` row.

## Stage 1 (done)

Schema, seed, `createProject` service, monday.com importer, read-only `/import` review page. No UI beyond that was in scope.

## Stage 2 (current)

- Navigation follows the Solargik 360 mockup (`Solargik 360.pdf` in Leora's OneDrive Documents folder): tabs are **Customers → Projects → Phases**. `/` redirects to `/customers`.
  - `/customers`: customer roll-up (project count, phase spread, editable `Customer.importance`, flags derived from aliases and blocked phases). `/customers/[id]`: that customer's projects plus Commercial / Name variants cards.
  - `/projects` and `/projects/[id]` (breadcrumb Customers › customer › project): people edit **sub-stage** status only (`NOT_STARTED/IN_PROGRESS/BLOCKED/DONE`) via a server action. **Phase status is derived, never edited by hand**: `derivePhaseStatus` in `src/lib/phaseStatus.ts` (all done → DONE; any blocked → BLOCKED; any started/done → IN_PROGRESS; else NOT_STARTED) and is recomputed in the same locked transaction as every sub-stage change. Phases still don't gate each other. `npm run phases:sync [-- --dry-run]` re-derives every phase after a rule change.
  - **Project lifecycle** (`Project.lifecycle`: ACTIVE / PRE_NTP / ON_HOLD / SUSPENDED / CANCELLED) is derived by the importer from the Control Table `stage` and `status` columns via `deriveLifecycle` in `src/lib/lifecycle.ts` (first match wins: Status "Cancelled" → CANCELLED; Status "Stuck/On Hold" or STAGE "7 Hold" → ON_HOLD; STAGE "Suspended" → SUSPENDED; STAGE "0 Pre NTP & Pre AP" → PRE_NTP; else ACTIVE). The raw labels are stored in `mondayStage`/`mondayStatus`. It only refreshes when the importer is re-run. Shown as a badge on `/projects` (with filter chips and counts), the project page and the customer page; cancelled rows are dimmed and struck through.
  - `/phases`: read-only matrix of every project × the six phases, with a summary card per phase.
  - `/search?q=`: name search over customers (incl. aliases) and projects, from the top-bar box.
  - `/import` (review queue) is no longer a tab; it is reached from the "Missing customer link" tile / banner on `/customers`.
- Mockup items intentionally NOT built because the data doesn't exist: Payments tab, invoicing/"Ready to invoice", standing decisions, open commitments, last-sync time.
- Access is gated by one shared password (`APP_PASSWORD`, min 10 chars): `src/proxy.ts` redirects unauthenticated requests to `/login`, and every page and Server Action also re-checks the session (`src/lib/auth.ts`). The app is deployed publicly on Vercel, so never add a route, page or action without these checks. If `APP_PASSWORD` is missing the app fails closed.
- `/import` supports resolving a review item into an existing or new `Customer` (creating a `CustomerAlias` from the raw reference so future imports resolve automatically). Resolving deletes the `ImportReviewItem` — the fix takes effect on the next importer run, not retroactively.
- No styling framework — keep it plain/functional, consistent with Stage 1.
