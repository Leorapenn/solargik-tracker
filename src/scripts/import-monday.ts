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
  getColumnValue,
  getLinkedItemIds,
  getLinkedItemName,
  type MondayItem,
} from "@/monday/client";
import { resolveCustomer } from "@/monday/resolveCustomer";
import { deriveLifecycle } from "@/lib/lifecycle";
import {
  deriveImportance,
  planContactSync,
  planCustomerUpdate,
  planProjectUpdate,
  type IncomingContact,
} from "@/lib/importMerge";

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

// Control Table "STAGE" and "Status" status columns, confirmed via monday:inspect-columns.
// They drive the project lifecycle (Pre-NTP / On hold / Suspended / Cancelled).
const CONTROL_TABLE_STAGE_COLUMN_ID = "stage";

// Customers board "Customer Importance (Customer Board)": labels Normal / Semi-Strategic / Strategic.
const CUSTOMER_IMPORTANCE_COLUMN_ID = "status_1_mkmxz5aj";

// Points of contact on the Supply Projects board, "POC 1" to "POC 4" (name, email, type, English level).
const CONTACT_SLOTS = [
  { slot: 1, name: "text2__1", email: "email__1", role: "dropdown_mkqxzr3r", english: "color_mkqzt5a8" },
  { slot: 2, name: "text_mkpbfhtq", email: "email_mkpbvdcc", role: "dropdown_mkqxck8z", english: "color_mkqzgqnt" },
  { slot: 3, name: "text_mkr2exhm", email: "email_mkr2k6cb", role: "dropdown_mkr23pp6", english: "color_mkr2jgfc" },
  { slot: 4, name: "text_mkz6rgxx", email: "email_mkz6j391", role: "dropdown_mkz62vxm", english: "color_mkz6msdb" },
] as const;
const CONTACT_COLUMN_IDS = CONTACT_SLOTS.flatMap((s) => [s.name, s.email, s.role, s.english]);

// Email columns hold {"email": "...", "text": "..."}; fall back to the display text.
function emailOf(item: MondayItem, columnId: string): string | null {
  const column = getColumnValue(item, columnId);
  if (column?.value) {
    try {
      const parsed = JSON.parse(column.value) as { email?: string };
      if (parsed.email?.trim()) return parsed.email.trim();
    } catch {
      // fall through to the text
    }
  }
  return column?.text?.trim() || null;
}

function contactsOf(item: MondayItem): IncomingContact[] {
  const contacts: IncomingContact[] = [];
  for (const s of CONTACT_SLOTS) {
    const name = getColumnText(item, s.name)?.trim() || null;
    const email = emailOf(item, s.email);
    if (!name && !email) continue;
    contacts.push({
      slot: s.slot,
      name: name ?? email!,
      email,
      role: getColumnText(item, s.role)?.trim() || null,
      englishLevel: getColumnText(item, s.english)?.trim() || null,
    });
  }
  return contacts;
}

// Supply Projects columns that link to Control Table rows (both point at board 5738893445).
// Some projects (e.g. 274) are linked only from this side, not from the Control Table's own link column.
const SUPPLY_TO_CONTROL_TABLE_LINK_COLUMN_IDS = ["connect_boards6__1", "board_relation_mkws6ea9"];
const CONTROL_TABLE_STATUS_COLUMN_ID = "status";

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

type Summary = {
  imported: number;
  updated: number;
  skipped: number;
  review: number;
  contactsAdded: number;
  contactsUpdated: number;
  contactsRemoved: number;
};

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

  const summary: Summary = {
    imported: 0,
    updated: 0,
    skipped: 0,
    review: 0,
    contactsAdded: 0,
    contactsUpdated: 0,
    contactsRemoved: 0,
  };

  console.log(`Fetching customers board (${BOARD_IDS.customers})...`);
  const customerItems = await fetchAllBoardItems(BOARD_IDS.customers, [CUSTOMER_IMPORTANCE_COLUMN_ID]);
  const matchedCustomerItems = customerItems.filter((item) => matchesArg(item.name, args));

  console.log(`Matched ${matchedCustomerItems.length} customer(s) on the Customers board for: ${args.join(", ")}`);

  for (const item of matchedCustomerItems) {
    const importance = deriveImportance(getColumnText(item, CUSTOMER_IMPORTANCE_COLUMN_ID));
    const current = await prisma.customer.findUnique({ where: { mondayItemId: item.id } });
    if (!current) {
      await prisma.customer.create({
        data: { name: item.name, mondayItemId: item.id, importance: importance ?? "NORMAL" },
      });
      continue;
    }
    const plan = planCustomerUpdate(current, { name: item.name, importance });
    if (Object.keys(plan).length > 0) {
      await prisma.customer.update({ where: { id: current.id }, data: plan });
      console.log(`  [customer] ${current.name}: ${Object.keys(plan).join(", ")} updated from monday.com`);
    }
  }

  console.log(`Fetching Supply Projects board (${BOARD_IDS.supplyProjects})...`);
  const projectItems = await fetchAllBoardItems(BOARD_IDS.supplyProjects, [
    PROJECT_CUSTOMER_LINK_COLUMN_ID,
    ...SUPPLY_TO_CONTROL_TABLE_LINK_COLUMN_IDS,
    ...CONTACT_COLUMN_IDS,
  ]);

  const matchedCustomerMondayIds = new Set(matchedCustomerItems.map((c) => c.id));
  const projectsToImport = projectItems.filter((item) => {
    if (matchesArg(item.name, args)) return true;
    const linkedIds = getLinkedItemIds(item, PROJECT_CUSTOMER_LINK_COLUMN_ID);
    return linkedIds.some((id) => matchedCustomerMondayIds.has(id));
  });

  console.log(`Matched ${projectsToImport.length} project(s) on the Supply Projects board.\n`);

  const controlTableByProjectId = new Map<string, MondayItem>();
  const controlTableById = new Map<string, MondayItem>();
  if (controlTableConfigured && projectsToImport.length > 0) {
    console.log(`Fetching Control Table board (${BOARD_IDS.controlTable})...`);
    const controlTableItems = await fetchAllBoardItems(BOARD_IDS.controlTable, [
      CONTROL_TABLE_COLUMN_IDS.projectLink,
      CONTROL_TABLE_COLUMN_IDS.contractValue,
      CONTROL_TABLE_COLUMN_IDS.capacity,
      CONTROL_TABLE_COLUMN_IDS.country,
      CONTROL_TABLE_STAGE_COLUMN_ID,
      CONTROL_TABLE_STATUS_COLUMN_ID,
    ]);
    for (const row of controlTableItems) {
      controlTableById.set(row.id, row);
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

    // The Control Table link can be set from either side in monday.com. Prefer the
    // Control Table's own link, and fall back to the Supply Projects side.
    const controlRowFromControlSide = controlTableByProjectId.get(projectItem.id);
    const controlRowFromSupplySide = SUPPLY_TO_CONTROL_TABLE_LINK_COLUMN_IDS.flatMap((columnId) =>
      getLinkedItemIds(projectItem, columnId),
    )
      .map((id) => controlTableById.get(id))
      .find((row): row is MondayItem => row !== undefined);
    if (controlRowFromControlSide && controlRowFromSupplySide && controlRowFromControlSide.id !== controlRowFromSupplySide.id) {
      console.warn(
        `  [warn] ${projectItem.name}: Control Table rows disagree ("${controlRowFromControlSide.name}" vs "${controlRowFromSupplySide.name}") — using the first.`,
      );
    }
    const controlRow = controlRowFromControlSide ?? controlRowFromSupplySide;
    const contractValue = controlRow
      ? parseNumeric(getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.contractValue))
      : null;
    // Control Table's capacity column ("Contractual kWp [DC]") is in kWp; convert to MW to match the schema field.
    const capacityKwp = controlRow
      ? parseNumeric(getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.capacity))
      : null;
    // Round to avoid storing binary floating-point noise (kW precision is plenty for MW figures).
    const capacityMw = capacityKwp !== null ? Math.round((capacityKwp / 1000) * 1000) / 1000 : null;
    const country = controlRow ? getColumnText(controlRow, CONTROL_TABLE_COLUMN_IDS.country) : null;
    const mondayStage = controlRow ? getColumnText(controlRow, CONTROL_TABLE_STAGE_COLUMN_ID) : null;
    const mondayStatus = controlRow ? getColumnText(controlRow, CONTROL_TABLE_STATUS_COLUMN_ID) : null;
    const lifecycle = deriveLifecycle(mondayStage, mondayStatus);

    const existing = await prisma.project.findUnique({ where: { mondayItemId: projectItem.id } });
    const incomingContacts = contactsOf(projectItem);

    // Fields edited by hand on the site (existing.lockedFields) are never overwritten by an import.
    let projectId: string;
    if (!existing) {
      const created = await createProject({
        name: projectItem.name,
        mondayItemId: projectItem.id,
        customerId: resolution.customerId,
        contractValue,
        capacityMw,
        country,
        lifecycle,
        mondayStage,
        mondayStatus,
      });
      projectId = created.id;
      summary.imported += 1;
      console.log(`  [imported] ${projectItem.name}`);
    } else {
      projectId = existing.id;
      const plan = planProjectUpdate(existing, {
        name: projectItem.name,
        customerId: resolution.customerId,
        contractValue,
        capacityMw,
        country,
        lifecycle,
        mondayStage,
        mondayStatus,
      });
      if (Object.keys(plan).length === 0) {
        summary.skipped += 1;
        console.log(`  [skipped] ${projectItem.name} — no changes`);
      } else {
        await prisma.project.update({ where: { id: existing.id }, data: plan });
        summary.updated += 1;
        console.log(`  [updated] ${projectItem.name} (${Object.keys(plan).join(", ")})`);
      }
    }

    // Contacts (POC 1-4): add, update and remove imported ones; hand-edited contacts are left alone.
    const importedContacts = await prisma.contact.findMany({
      where: { projectId, source: "IMPORTED", slot: { not: null } },
    });
    const contactPlan = planContactSync(
      importedContacts.map((c) => ({
        id: c.id,
        slot: c.slot as number,
        name: c.name,
        email: c.email,
        role: c.role,
        englishLevel: c.englishLevel,
        customerId: c.customerId,
        locked: c.locked,
      })),
      incomingContacts,
      resolution.customerId,
    );
    for (const c of contactPlan.create) {
      await prisma.contact.create({
        data: { ...c, projectId, customerId: resolution.customerId, source: "IMPORTED" },
      });
    }
    for (const u of contactPlan.update) await prisma.contact.update({ where: { id: u.id }, data: u.data });
    if (contactPlan.remove.length > 0) await prisma.contact.deleteMany({ where: { id: { in: contactPlan.remove } } });
    summary.contactsAdded += contactPlan.create.length;
    summary.contactsUpdated += contactPlan.update.length;
    summary.contactsRemoved += contactPlan.remove.length;
  }

  console.log("\nSummary:");
  console.log(`  Imported: ${summary.imported}`);
  console.log(`  Updated:  ${summary.updated}`);
  console.log(`  Skipped:  ${summary.skipped}`);
  console.log(`  Review:   ${summary.review}`);
  console.log(
    `  Contacts: +${summary.contactsAdded} ~${summary.contactsUpdated} -${summary.contactsRemoved}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
