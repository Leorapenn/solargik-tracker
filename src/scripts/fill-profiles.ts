// Fills project profiles (Project details + Design details) from monday.com. READ-ONLY against monday.com (the client
// refuses mutations) and only ever fills profile fields that are EMPTY: a value somebody typed is never replaced.
//
// Usage (explicit project numbers only; it never runs over "everything" by default):
//   npm run profiles:fill -- 257 258 259          dry run: prints what WOULD be filled, writes nothing
//   npm run profiles:fill -- 257 258 259 --apply  writes the empty fields
//
// Not filled, because monday.com has no column for them: intercoms, shipping address, delivery address.

import { prisma } from "@/lib/prisma";
import { fetchAllBoardItems, getColumnText, getColumnValue, getLinkedItemIds, type MondayItem } from "@/monday/client";
import { getProfile, saveProfile } from "@/server/services/projectProfile";
import { CONTROL_COLUMNS, SUPPLY_COLUMNS, incomingFromMonday, planFill, unknownLabels, type ControlValues, type SupplyValues } from "@/lib/profileFromMonday";
import type { ProfileInput } from "@/lib/projectProfile";

try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

const SUPPLY_BOARD = "6272830165";
const CONTROL_BOARD = "5738893445";
const SUPPLY_TO_CONTROL_LINKS = ["connect_boards6__1", "board_relation_mkws6ea9"];
const CONTROL_TO_SUPPLY_LINK = "board_relation_mkwstnz6";

const FIELD_LABELS: Record<keyof ProfileInput, string> = {
  pileDrivingStart: "pile driving start",
  deliveryExpectations: "delivery expectations",
  supplyTerms: "supply terms",
  supplyObligations: "supply obligations",
  contractType: "contract type",
  customerType: "customer type",
  soilTest: "SPT/GPT",
  intercoms: "intercoms",
  soma: "SOMA",
  ntpDate: "NTP date",
  projectType: "type",
  shippingAddress: "shipping address",
  deliveryAddress: "delivery address",
  contractLink: "contract link",
  projectEngineerId: "project engineer",
  designNotes: "design notes",
  designQuestionnaireReceived: "DQ received",
  designInfoStatus: "design info",
  geotechStatus: "geotech",
  initialLayoutSent: "layout sent",
  genioCivileStatus: "Genio Civile",
  bomStatus: "BOM",
};
// the profile fields monday.com has no column for
const NO_SOURCE: (keyof ProfileInput)[] = ["intercoms", "shippingAddress", "deliveryAddress"];

const short = (v: string, n = 46) => (v.length > n ? `${v.slice(0, n - 1)}…` : v).replace(/\s+/g, " ");

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const apply = args.includes("--apply");
  const numbers = args.filter((a) => a !== "--apply");
  if (numbers.length === 0 || numbers.some((n) => !/^\d{1,5}$/.test(n))) {
    console.error("Usage: npm run profiles:fill -- <project number> [more...] [--apply]");
    console.error("Refusing to run without explicit project numbers.");
    process.exit(1);
  }

  const projects = [];
  for (const n of numbers) {
    const found = await prisma.project.findMany({ where: { name: { startsWith: `${n}-` } }, select: { id: true, name: true, mondayItemId: true } });
    if (found.length !== 1) console.warn(`! project ${n}: ${found.length === 0 ? "not found" : "more than one match"}, skipped`);
    else projects.push(found[0]);
  }
  const people = await prisma.person.findMany({ select: { id: true, name: true }, where: { active: true } });

  console.log(`Reading monday.com (read-only): Supply Projects and Control Table...`);
  const supplyItems = await fetchAllBoardItems(SUPPLY_BOARD, [...Object.values(SUPPLY_COLUMNS), ...SUPPLY_TO_CONTROL_LINKS]);
  const controlItems = await fetchAllBoardItems(CONTROL_BOARD, [...Object.values(CONTROL_COLUMNS), CONTROL_TO_SUPPLY_LINK]);
  const supplyById = new Map(supplyItems.map((i) => [i.id, i]));
  const controlById = new Map(controlItems.map((i) => [i.id, i]));
  const controlBySupplyId = new Map<string, MondayItem>();
  for (const row of controlItems) for (const sid of getLinkedItemIds(row, CONTROL_TO_SUPPLY_LINK)) controlBySupplyId.set(sid, row);

  const totals = { projects: 0, filled: 0, fields: 0, noSupplyItem: 0 };
  const perField = new Map<string, number>();
  for (const project of projects) {
    const supplyItem = project.mondayItemId ? supplyById.get(project.mondayItemId) : undefined;
    if (!supplyItem) {
      console.log(`${project.name}: no monday item, skipped`);
      totals.noSupplyItem++;
      continue;
    }
    let controlItem = controlBySupplyId.get(supplyItem.id);
    if (!controlItem) for (const col of SUPPLY_TO_CONTROL_LINKS) for (const cid of getLinkedItemIds(supplyItem, col)) controlItem ??= controlById.get(cid);

    const supply = Object.fromEntries(Object.entries(SUPPLY_COLUMNS).map(([key, id]) => [key, getColumnText(supplyItem, id)])) as SupplyValues;
    const control: ControlValues | null = controlItem
      ? {
          contractType: getColumnText(controlItem, CONTROL_COLUMNS.contractType),
          contractLinkRaw: getColumnValue(controlItem, CONTROL_COLUMNS.contractLink)?.value ?? null,
          soilTest: getColumnText(controlItem, CONTROL_COLUMNS.soilTest),
          soma: getColumnText(controlItem, CONTROL_COLUMNS.soma),
          projectType: getColumnText(controlItem, CONTROL_COLUMNS.projectType),
          customerType: getColumnText(controlItem, CONTROL_COLUMNS.customerType),
        }
      : null;

    const current = await getProfile(project.id);
    const incoming = incomingFromMonday(supply, control, people);
    const { fill, kept } = planFill(current, incoming);
    const keys = Object.keys(fill) as (keyof ProfileInput)[];
    totals.projects++;
    console.log(`\n${project.name}${control ? "" : "   (no Control Table row linked)"}`);
    if (keys.length === 0) console.log("   nothing to fill");
    for (const key of keys) {
      const shown = key === "projectEngineerId" ? (people.find((p) => p.id === fill[key])?.name ?? "?") : String(fill[key]);
      console.log(`   + ${FIELD_LABELS[key].padEnd(22)} ${short(shown)}`);
      perField.set(FIELD_LABELS[key], (perField.get(FIELD_LABELS[key]) ?? 0) + 1);
    }
    if (kept.length) console.log(`   = kept (already filled): ${kept.map((k) => FIELD_LABELS[k]).join(", ")}`);
    const problems = unknownLabels(supply, control);
    if (supply.projectEngineer?.trim() && !incoming.projectEngineerId) problems.push(`P Eng "${supply.projectEngineer}" is not (exactly one person) in People`);
    if (problems.length) console.log(`   ? not understood, left out: ${problems.join("; ")}`);

    if (apply && keys.length > 0) {
      await saveProfile(project.id, { ...current, ...fill });
      totals.filled++;
      totals.fields += keys.length;
    }
  }

  console.log(`\n${apply ? "APPLIED" : "DRY RUN (nothing written)"}: ${totals.projects} project(s) read, ${apply ? `${totals.filled} profile(s) updated, ${totals.fields} field(s) filled` : "pass --apply to write"}${totals.noSupplyItem ? `, ${totals.noSupplyItem} without a monday item` : ""}.`);
  console.log("Fields that would be filled, by number of projects:");
  for (const [label, n] of [...perField.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${label.padEnd(22)} ${n}`);
  console.log(`No monday.com column for: ${NO_SOURCE.map((k) => FIELD_LABELS[k]).join(", ")} (left empty).`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : error);
  await prisma.$disconnect();
  process.exit(1);
});
