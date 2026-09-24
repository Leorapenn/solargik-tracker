# Solargik Tracker — Stage 1

Next.js (App Router, TypeScript) + Prisma against a hosted Neon Postgres. See [CLAUDE.md](./CLAUDE.md) for the hard rules.

## First-time setup

1. Fill in `.env` with your Neon `DATABASE_URL` (the direct, non-pooled connection string) and `MONDAY_API_TOKEN`.
2. Install dependencies (already done if you're reading this right after setup): `npm install`
3. Create the database schema:
   ```bash
   npm run db:migrate
   ```
4. Seed the sub-stage templates:
   ```bash
   npm run db:seed
   ```
5. Confirm the Control Table column ids in `src/scripts/import-monday.ts` — they aren't guessed, and need to be filled in via:
   ```bash
   npm run monday:inspect-columns -- 5738893445
   ```
   Then set `MONDAY_CONTROL_TABLE_PROJECT_LINK_COLUMN_ID`, `MONDAY_CONTROL_TABLE_CONTRACT_VALUE_COLUMN_ID`, `MONDAY_CONTROL_TABLE_CAPACITY_COLUMN_ID`, and `MONDAY_CONTROL_TABLE_COUNTRY_COLUMN_ID` in `.env`.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server (redirects `/` to `/import`) |
| `npm test` | Run the `createProject` test suite (needs a real `DATABASE_URL`) |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed the 27 `SubStageTemplate` rows |
| `npm run import:monday -- "Customer Name"` | Import one or more customers/projects by name from monday.com (never imports everything) |
| `npm run monday:inspect-columns -- <boardId>` | Dump a board's column ids/types, for finding real column ids |

## Verifying the import

Run the importer twice in a row with the same arguments — the second run should report 0 imported / 0 updated (everything shown as skipped), since it matches existing rows on `mondayItemId`.
