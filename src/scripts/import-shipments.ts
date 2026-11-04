// Brings the monday.com "International Shipping V02" board into the projects' Shipments, with each shipment's Files column as links.
// READ-ONLY against monday.com (the client refuses mutations). Safe to re-run: an item that was imported is found by its monday.com id
// and only gets its links refreshed and its EMPTY fields filled; nothing typed, proposed or edited by hand is overwritten.
//
// Usage (explicit project numbers only; it never runs over the whole board):
//   npm run shipments:import -- 356 357 360           dry run: prints what WOULD happen, writes nothing
//   npm run shipments:import -- 356 357 360 --apply   writes it
//   npm run shipments:import -- --all-tracked         every project that exists in 360 (still a dry run without --apply)

import { prisma } from "@/lib/prisma";
import { mondayQuery } from "@/monday/client";
import { MONDAY_SHIPPING_BOARD, MONDAY_SHIPPING_COLUMNS, trackedProjectNumber, type MondayShipmentItem } from "@/lib/shipmentFromMonday";
import { applyShipmentImport, planShipmentImport } from "@/server/services/shipmentImport";

try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

type RawItem = { id: string; name: string; group: { id: string; title: string }; column_values: { id: string; text: string | null }[] };
const COLUMN_IDS = Object.values(MONDAY_SHIPPING_COLUMNS);
const ITEM_FIELDS = `id name group { id title } column_values(ids: $columns) { id text }`;

async function fetchBoard(): Promise<MondayShipmentItem[]> {
  const raw: RawItem[] = [];
  const first = await mondayQuery<{ boards: { items_page: { cursor: string | null; items: RawItem[] } }[] }>(
    `query($board: ID!, $columns: [String!]) { boards(ids: [$board]) { items_page(limit: 200) { cursor items { ${ITEM_FIELDS} } } } }`,
    { board: MONDAY_SHIPPING_BOARD, columns: COLUMN_IDS },
  );
  const board = first.boards[0];
  if (!board) throw new Error("The shipping board was not found with this monday.com token.");
  raw.push(...board.items_page.items);
  let cursor = board.items_page.cursor;
  while (cursor) {
    const next = await mondayQuery<{ next_items_page: { cursor: string | null; items: RawItem[] } }>(
      `query($cursor: String!, $columns: [String!]) { next_items_page(limit: 200, cursor: $cursor) { cursor items { ${ITEM_FIELDS} } } }`,
      { cursor, columns: COLUMN_IDS },
    );
    raw.push(...next.next_items_page.items);
    cursor = next.next_items_page.cursor;
  }
  const keys = Object.entries(MONDAY_SHIPPING_COLUMNS) as [keyof typeof MONDAY_SHIPPING_COLUMNS, string][];
  return raw.map((r) => ({ id: r.id, name: r.name, group: r.group, values: Object.fromEntries(keys.map(([key, id]) => [key, r.column_values.find((c) => c.id === id)?.text ?? null])) }));
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const apply = args.includes("--apply");
  const allTracked = args.includes("--all-tracked");
  let numbers = args.filter((a) => /^\d{1,4}$/.test(a)).map(Number);
  if (allTracked) {
    numbers = (await prisma.project.findMany({ select: { name: true } })).map((p) => trackedProjectNumber(p.name)).filter((n): n is number => n !== null);
  }
  if (numbers.length === 0) {
    console.error("Name the project numbers to import (e.g. 356 357 360), or pass --all-tracked for every project that exists in 360.");
    process.exit(1);
  }
  numbers = [...new Set(numbers)].sort((a, b) => a - b);

  console.log("Reading monday.com (read-only): International Shipping V02...");
  const items = await fetchBoard();
  console.log(`${items.length} items on the board; ${numbers.length} project number(s) asked for.\n`);
  const plan = await planShipmentImport(items, numbers);

  const totals = { create: 0, link: 0, refresh: 0, skip: 0, files: 0 };
  const statusCount: Record<string, number> = {};
  const issues: string[] = [];
  for (const p of plan.projects) {
    const c = { create: 0, link: 0, refresh: 0, skip: 0, files: 0 };
    for (const a of p.actions) {
      c[a.kind]++;
      c.files += a.imp.files.length;
      if (a.kind === "create") statusCount[a.clean.status] = (statusCount[a.clean.status] ?? 0) + 1;
      for (const issue of a.imp.issues) issues.push(`${p.projectName} · ${a.item.name}: ${issue}`);
      if (a.kind === "skip") issues.push(`${p.projectName} · ${a.item.name}: SKIPPED, ${a.reason}`);
      if ((a.kind === "link" || a.kind === "refresh") && a.clean === null) issues.push(`${p.projectName} · ${a.item.name}: kept as it is (the merged result did not pass the checks); links refreshed`);
    }
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += c[k];
    if (p.actions.length > 0) console.log(`${p.projectName.padEnd(36).slice(0, 36)} ${String(p.actions.length).padStart(3)} shipments: ${c.create} new, ${c.link} linked, ${c.refresh} refreshed, ${c.skip} skipped; ${c.files} file link(s)`);
  }
  console.log(`\nTOTAL: ${totals.create} new, ${totals.link} linked to a shipment already there, ${totals.refresh} refreshed, ${totals.skip} skipped; ${totals.files} file links.`);
  console.log("New shipments by stage:", JSON.stringify(statusCount));
  if (plan.noProject.length) console.log(`No project in 360 for number(s): ${plan.noProject.join(", ")}`);
  if (plan.ambiguous.length) console.log(`Several projects share number(s) ${plan.ambiguous.join(", ")}: nothing imported for them.`);
  console.log(`Items of the whole board whose project number could not be told: ${plan.unmatchedItems} (not imported).`);
  // the status labels 360 does not have a stage for are always listed in full
  const statusIssues = issues.filter((i) => /imported as Booked|no status/.test(i));
  const otherIssues = issues.filter((i) => !statusIssues.includes(i));
  if (statusIssues.length) {
    console.log(`\n${statusIssues.length} shipment(s) whose monday.com status is not one of 360's stages (imported as Booked, the status is in the note):`);
    for (const line of statusIssues) console.log("  - " + line);
  }
  if (otherIssues.length) {
    console.log(`\n${otherIssues.length} other thing(s) to know:`);
    for (const line of otherIssues.slice(0, 40)) console.log("  - " + line);
    if (otherIssues.length > 40) console.log(`  ... and ${otherIssues.length - 40} more`);
  }

  if (!apply) {
    console.log("\nDRY RUN (nothing written): pass --apply to write it.");
    return;
  }
  const result = await applyShipmentImport(plan);
  console.log(`\nAPPLIED: ${result.created} created, ${result.linked} linked, ${result.refreshed} refreshed, ${result.skipped} skipped.`);
}

main()
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
