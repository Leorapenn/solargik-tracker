// monday.com -> Postgres importer. Read-only against monday.com: it never
// writes back (see src/monday/client.ts, which refuses to send mutations).
//
// Usage:
//   npm run import:monday -- "Acme Corp" "Other Customer"
//   npm run import:monday -- PRJ-001 PRJ-002
//
// Always takes an explicit list of customer names or project codes/names —
// it never imports the whole board. Safe to re-run: matches on mondayItemId
// and updates in place rather than creating duplicates.

import { prisma } from "@/lib/prisma";
import { createProject } from "@/server/services/createProject";
import {
  fetchAllBoardItems,
  getColumnText,
  getLinkedItemIds,
  getLinkedItemName,
  type MondayItem,
} from "@/monday/client";
import { resolveCustomer } from "@/monday/resolveCustomer";

// This CLI entry point runs standalone via tsx, so unlike Next.js it doesn't
// load .env automatically — do it explicitly.
try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

const BOARD_IDS = {
  customers: "7980663322",
  supplyProjects: "6272830165",
  controlTable: "5738893445",
} as const;

// Confirmed against the real board (see CLAUDE.md).
const PROJECT_CUSTOMER_LINK_COLUMN_ID = "board_relation2__1";

// NOT confirmed — these must be filled in by running:
//   npm run monday:inspect-columns -- 5738893445
// and reading off the real column ids for the link back to Supply Projects,
// contract value, capacity, and country. Left as env vars so this file
// doesn't need editing (and doesn't need real values) to be reviewed.
const CONTROL_TABLE_COLUMN_IDS = {
  projectLink: process.env.MONDAY_CONTROL_TABLE_PROJECT_LINK_COLUMN_ID ?? "",
  contractValue: process.env.MONDAY_CONTROL_TABLE_CONTRACT_VALUE_COLUMN_ID ?? "",
  capacity: process.env.MONDAY_CONTROL_TABLE_CAPACITY_COLUMN_ID ?? "",
  country: process.env.MONDAY_CONTROL_TABLE_COUNTRY_COLUMN_ID ?? "",
};

// Prisma Decimal fields come back as Decimal | null. Comparing via Number()
// with a NaN fallback breaks when both sides are null (NaN !== NaN is true),
// and exact equality breaks on float noise from the kWp/1000 conversion —
// so null is compared as null, and numbers are compared with a tolerance.
function numericValuesEqual(existing: unknown, next: number | null): boolean {
  const existingNum = existing === null || existing === undefined ? null : Number(existing);
  if (existingNum === null || next === null) return existingNum === next;
  return Math.abs(existingNum - next) < 1e-6;
}

function parseNumeric(text: string | null): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function matchesArg(name: string, args: string[]): boolean {
  const normalized = name.trim().toLowerCase();
  return args.some((arg) => arg.trim().toLowerCase() === normalized);
}

type Summary = { imported: number; updated: number; skipped: number; review: number };

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  if (args.length === 0) {
    console.error("Usage: npm run import:monday -- <customer name or project code> [more...]");
    console.error("Refusing to run with no arguments — this importer never imports everything.");
    process.exit(1);
  }

  const controlTableConfigured = Object.values(CONTROL_TABLE_COLUMN_IDS).every(Boolean);
  if (!controlTableConfigured) {
    console.warn(
      "Warning: Control Table column ids are not fully configured (MONDAY_CONTROL_TABLE_* env vars). " +
        "Contract value / capacity / country will be imported as null. Run " +
        "`npm run monday:inspect-columns -- 5738893445` to find the real column ids.",
    );
  }

  const summary: Summary = { imported: 0, updated: 0, skipped: 0, review: 0 };

  console.log(`Fetching customers board (${BOARD_IDS.customers})...`);
  const customerItems = await fetchAllBoardItems(BOARD_IDS.customers);
  const matchedCustomerItems = customerItems.filter((item) => matchesArg(item.name, args));

  console.log(`Matched ${matchedCustomerItems.length} customer(s) on the Customers board for: ${args.join(", ")}`);

  for (const item of matchedCustomerItems) {
    await prisma.customer.upsert({
      where: { mondayItemId: item.id },
      update: { name: item.name },
      create: { name: item.name, mondayItemId: item.id },
    });
  }

  console.log(`Fetching Supply Projects board (${BOARD_IDS.supplyProjects})...`);
  const projectItems = await fetchAllBoardItems(BOARD_IDS.supplyProjects, [PROJECT_CUSTOMER_LINK_COLUMN_ID]);

  const matchedCustomerMondayIds = new Set(matchedCustomerItems.map((c) => c.id));
  const projectsToImport = projectItems.filter((item) => {
    if (matchesArg(item.name, args)) return true;
    const linkedIds = getLinkedItemIds(item, PROJECT_CUSTOMER_LINK_COLUMN_ID);
    return linkedIds.some((id) => matchedCustomerMondayIds.has(id));
  });

  console.log(`Matched ${projectsToImport.length} project(s) on the Supply Projects board.\n`);

  const controlTableByProjectId = new Map<string, MondayItem>();
  if (controlTableConfigured && projectsToImport.length > 0) {
    console.log(`Fetching Control Table board (${BOARD_IDS.controlTable})...`);
    const controlTableItems = await fetchAllBoardItems(BOARD_IDS.controlTable, [
      CONTROL_TABLE_COLUMN_IDS.projectLink,
      CONTROL_TABLE_COLUMN_IDS.contractValue,
      CONTROL_TABLE_COLUMN_IDS.capacity,
      CONTROL_TABLE_COLUMN_IDS.country,
    ]);
    for (const row of controlTableItems) {
      const linkedProjectIds = getLinkedItemIds(row, CONTROL_TABLE_COLUMN_IDS.projectLink);
      for (const projectId of linkedProjectIds) {
        controlTableByProjectId.set(projectId, row);
      }
    }
  }

  for (const projectItem of projectsToImport) {
    const linkedCustomerIds = getLinkedItemIds(projectItem, PROJECT_CUSTOMER_LINK_COLUMN_ID);
    const linkedCustomerMondayId = linkedCustomerIds[0];
    const linkedCustomerDisplayName = getLinkedItemName(projectItem, PROJECT_CUSTOMER_LINK_COLUMN_ID) ?? "";

    const resolution = await resolveCustomer(linkedCustomerMondayId, linkedCustomerDisplayName);

    if (resolution.status === "unresolved") {
      await prisma.importReviewItem.upsert({
        where: { boardId_mondayItemId: { boardId: BOARD_IDS.supplyProjects, mondayItemId: projectItem.id } },
        update: {
          itemName: projectItem.name,
          rawCustomerRef: linkedCustomerDisplayName || "(no customer linked)",
          reason: "Customer could not be resolved via Customer.name or CustomerAlias",
        },
        create: {
          boardId: BOARD_IDS.supplyProjects,
          mondayItemId: projectItem.id,
          itemName: projectItem.name,
          rawCustomerRef: linkedCustomerDisplayName || "(no customer linked)",
          reason: "Customer could not be resolved via Customer.name or CustomerAlias",
        },
      });
      summary.review += 1;
      console.log(`  [review] ${projectItem.name} — unresolved customer "${linkedCustomerDisplayName}"`);
      continue;
    }

    const controlRow = controlTableByProjectId.get(projectItem.id);
    const contractValue = controlRow
      ? parseNumeric(getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.contractValue))
      : null;
    // Control Table's capacity column ("Contractual kWp [DC]") is in kWp; convert to MW to match the schema field.
    const capacityKwp = controlRow
      ? parseNumeric(getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.capacity))
      : null;
    const capacityMw = capacityKwp !== null ? capacityKwp / 1000 : null;
    const country = controlRow ? getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.country) : null;

    const existing = await prisma.project.findUnique({ where: { mondayItemId: projectItem.id } });

    if (!existing) {
      await createProject({
        name: projectItem.name,
        mondayItemId: projectItem.id,
        customerId: resolution.customerId,
        contractValue,
        capacityMw,
        country,
      });
      summary.imported += 1;
      console.log(`  [imported] ${projectItem.name}`);
      continue;
    }

    const changed =
      existing.name !== projectItem.name ||
      existing.customerId !== resolution.customerId ||
      !numericValuesEqual(existing.contractValue, contractValue) ||
      !numericValuesEqual(existing.capacityMw, capacityMw) ||
      (existing.country ?? null) !== country;

    if (!changed) {
      summary.skipped += 1;
      console.log(`  [skipped] ${projectItem.name} — no changes`);
      continue;
    }

    await prisma.project.update({
      where: { id: existing.id },
      data: {
        name: projectItem.name,
        customerId: resolution.customerId,
        contractValue,
        capacityMw,
        country,
      },
    });
    summary.updated += 1;
    console.log(`  [updated] ${projectItem.name}`);
  }

  console.log("\nSummary:");
  console.log(`  Imported: ${summary.imported}`);
  console.log(`  Updated:  ${summary.updated}`);
  console.log(`  Skipped:  ${summary.skipped}`);
  console.log(`  Review:   ${summary.review}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
