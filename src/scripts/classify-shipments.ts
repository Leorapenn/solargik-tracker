// Reads the packing lists and invoices of imported shipments (the files saved in the project's synced SharePoint folder by
// `npm run shipments:files`) and sets which Supply Delivery sub-stages each shipment's goods belong to (Shipment.categories). It decides with
// Solargik's part numbers and the words on the list (src/lib/shipmentCategory.ts): no AI. It only FILLS shipments whose sub-stages are
// still empty: what a person set on the Shipments card is never replaced.
//
// Usage (explicit project numbers only):
//   npm run shipments:classify -- 360             dry run: what each shipment would be classified as, writes nothing
//   npm run shipments:classify -- 360 --apply     writes the sub-stages of the shipments that have none yet

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { trackedProjectNumber } from "@/lib/shipmentFromMonday";
import { SHAREPOINT_EXECUTION_URL, isGoodsDocument, isSharepointLink } from "@/lib/shipmentFiles";
import { DELIVERY_ITEM_NAMES, classifyGoods, type DeliveryItem } from "@/lib/shipmentCategory";
import { filesOf } from "@/server/services/shipments";

try {
  process.loadEnvFile();
} catch {
  // .env is optional if the variables are already set in the environment.
}

const EXEC = process.env.EXECUTION_DIR ?? join(process.env.USERPROFILE ?? "", "OneDrive - Solargik", "Projects - EXECUTION");
const MAX_CHARS = 60000; // per file: enough for any packing list

// The local path of a file whose link points into the project's SharePoint folder.
function localPath(url: string): string | null {
  const base = `${SHAREPOINT_EXECUTION_URL.replace(/ /g, "%20")}/`;
  if (!url.startsWith(base)) return null;
  return join(EXEC, ...url.slice(base.length).split("/").map((p) => decodeURIComponent(p)));
}

// Some spreadsheets confuse the reader library; every xlsx is a zip, so the words are read straight out of its shared strings.
async function xlsxTextFallback(path: string): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(readFileSync(path));
  let out = "";
  for (const name of Object.keys(zip.files)) {
    if (name !== "xl/sharedStrings.xml" && !/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    const xml = await zip.files[name].async("string");
    out += `\n${[...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((m) => m[1]).join(" ")}`;
  }
  return out.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
}

async function xlsxText(path: string): Promise<string> {
  try {
    return await xlsxTextPrimary(path);
  } catch {
    return xlsxTextFallback(path);
  }
}

async function xlsxTextPrimary(path: string): Promise<string> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(path) as unknown as ArrayBuffer);
  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      const cells: string[] = [];
      row.eachCell((cell) => {
        const v = cell.value;
        cells.push(typeof v === "object" && v !== null ? String((v as { text?: unknown; result?: unknown }).text ?? (v as { result?: unknown }).result ?? "") : String(v ?? ""));
      });
      lines.push(cells.join(" "));
    });
  });
  return lines.join("\n");
}

async function pdfText(path: string): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true }).promise;
  let out = "";
  for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
    const page = await doc.getPage(p);
    out += (await page.getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const apply = args.includes("--apply");
  const numbers = [...new Set(args.filter((a) => /^\d{1,4}$/.test(a)).map(Number))].sort((a, b) => a - b);
  if (numbers.length === 0) {
    console.error("Name the project numbers (e.g. 360). It never runs over everything by default.");
    process.exit(1);
  }
  const projects = (await prisma.project.findMany({ select: { id: true, name: true } })).filter((p) => numbers.includes(trackedProjectNumber(p.name) ?? -1));
  const tally: Record<string, number> = {};
  let none = 0;
  let written = 0;
  let kept = 0;
  const problems: string[] = [];

  for (const project of projects) {
    const shipments = await prisma.shipment.findMany({ where: { projectId: project.id, mondayItemId: { not: null } }, orderBy: { reference: "asc" } });
    console.log(`\n${project.name}`);
    for (const shipment of shipments) {
      let text = "";
      let read = 0;
      for (const f of filesOf(shipment.files)) {
        if (!isSharepointLink(f.url) || !isGoodsDocument(f.name)) continue;
        const path = localPath(f.url);
        if (!path || !existsSync(path)) continue;
        try {
          text += `\n${/\.xlsx$/i.test(f.name) ? await xlsxText(path) : await pdfText(path)}`.slice(0, MAX_CHARS);
          read++;
        } catch (error) {
          problems.push(`${shipment.reference}: ${f.name} could not be read (${error instanceof Error ? error.message : error})`);
        }
      }
      const c = classifyGoods(text);
      const label = c.items.map((i: DeliveryItem) => DELIVERY_ITEM_NAMES[i].replace("Delivery – ", "")).join(" + ") || "(nothing recognised)";
      const has = shipment.categories.length > 0;
      console.log(`  ${shipment.reference.slice(0, 42).padEnd(42)} ${label.padEnd(36)} ${read} file(s) read${c.fastenersOnly ? " · hardware only" : ""}${has ? ` · already set (${shipment.categories.join(", ")}), kept` : ""}`);
      if (c.items.length === 0) none++;
      for (const i of c.items) tally[i] = (tally[i] ?? 0) + 1;
      if (has) {
        kept++;
      } else if (apply && c.items.length > 0) {
        await prisma.shipment.update({ where: { id: shipment.id }, data: { categories: c.items } });
        written++;
      }
    }
  }
  console.log(`\nSub-stages found: ${JSON.stringify(tally)}; ${none} shipment(s) with nothing recognised; ${kept} already set by hand (kept).`);
  for (const p of problems.slice(0, 20)) console.log("  - " + p);
  console.log(apply ? `\nAPPLIED: ${written} shipment(s) updated.` : "\nDRY RUN (nothing written): pass --apply to write them.");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
