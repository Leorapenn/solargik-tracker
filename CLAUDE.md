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

## Scope for this session (Stage 1)

- No UI beyond what's needed to verify the import worked (`/import`, read-only).
- Don't add authentication, editing, or additional pages beyond what's described in the task.
