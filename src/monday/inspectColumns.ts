// Manual helper, not part of the import flow: dumps a board's column ids so
// you can fill in the CONTROL_TABLE_COLUMN_IDS placeholders in
// src/scripts/import-monday.ts. Run with:
//   npm run monday:inspect-columns -- <boardId>

import { mondayQuery } from "./client";

// This CLI entry point runs standalone via tsx, so unlike Next.js it doesn't
// load .env automatically — do it explicitly.
try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

type BoardColumnsResponse = {
  boards: { name: string; columns: { id: string; title: string; type: string }[] }[];
};

const QUERY = `
  query BoardColumns($boardId: ID!) {
    boards(ids: [$boardId]) {
      name
      columns {
        id
        title
        type
      }
    }
  }
`;

async function main() {
  const boardId = process.argv[2];
  if (!boardId) {
    console.error("Usage: npm run monday:inspect-columns -- <boardId>");
    process.exit(1);
  }

  const data = await mondayQuery<BoardColumnsResponse>(QUERY, { boardId });
  const board = data.boards[0];
  if (!board) {
    console.error(`Board ${boardId} not found or not accessible with this token.`);
    process.exit(1);
  }

  console.log(`Board: ${board.name} (${boardId})\n`);
  console.table(board.columns);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
