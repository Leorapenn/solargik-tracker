import type { ShipmentFile } from "@/lib/shipmentFromMonday";

// Moving a shipment's documents from monday.com into the project's SharePoint folder: where each file goes, what it is called, the
// link to it, and how the list of links is kept when the monday.com import runs again. Pure rules; the script that downloads and saves
// is src/scripts/save-shipment-files.ts.

export const SHAREPOINT_EXECUTION_URL = "https://solargik.sharepoint.com/sites/Projects/Shared Documents/EXECUTION";
// inside each project folder
export const SHIPMENT_FOLDER = "Procurement + Logistics";
export const SHIPMENT_SUBFOLDER = "Shipments";

const MAX_PART = 100; // one file or folder name, so the whole path stays well under Windows' 260 characters

// A name that is safe on Windows and in SharePoint: no \ / : * ? " < > | or control characters, no trailing dots or spaces, not too long
// (the extension is kept).
export function safeName(raw: string, fallback = "file"): string {
  const cleaned = raw.replace(/[\u0000-\u001f\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").replace(/^\.+/, "");
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_PART) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 8 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_PART - ext.length).trim() + ext;
}

// Shortens a file name (keeping its extension) so that `dirLength + 1 + name` stays within `maxPath` characters (Windows stops at 260).
export function fitName(name: string, dirLength: number, maxPath = 250): string {
  const room = Math.max(12, maxPath - dirLength - 1);
  if (name.length <= room) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 8 ? name.slice(dot) : "";
  return name.slice(0, room - ext.length).trim().replace(/[. ]+$/, "") + ext;
}

// "name.pdf" taken -> "name (2).pdf", "name (3).pdf"...
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 && name.length - dot <= 8 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; n < 1000; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!taken(candidate)) return candidate;
  }
  throw new Error(`Too many files called ${name}.`);
}

// The link to a file in the project's SharePoint folder (every part of the path encoded, so it is a valid address).
export function sharepointLink(projectFolder: string, shipmentFolder: string, fileName: string): string {
  const parts = [projectFolder, SHIPMENT_FOLDER, SHIPMENT_SUBFOLDER, shipmentFolder, fileName].map((p) => encodeURIComponent(p));
  return `${SHAREPOINT_EXECUTION_URL.replace(/ /g, "%20")}/${parts.join("/")}`;
}

export const isSharepointLink = (url: string) => /^https:\/\/[^/]+\.sharepoint\.com\//i.test(url);

// Which of a shipment's files may say what the goods are: spreadsheets and PDFs that are not a bill of lading, a certificate, a proof of
// delivery, a customs paper or a freight / bank document (those say nothing about the goods, and their words could mislead).
const NOT_GOODS = /\b(hbl|mbl|obd|coo|eur1|pod|dgd|fbl|dn|verify)\b|bill of lad|marin|certificate|customs|freight|insurance|swift|exp dec|israeli|^image\b|photo/i;
export const isGoodsDocument = (name: string): boolean => /\.(xlsx|pdf)$/i.test(name) && !NOT_GOODS.test(name.replace(/[_.-]/g, " "));

// The monday.com asset id inside a file address ".../resources/3008913672/name.pdf", or null.
export const assetIdOf = (url: string): string | null => /\/resources\/(\d+)\//.exec(url)?.[1] ?? null;

// The key that says "this is the same file": a SharePoint link remembers the monday.com address it came from (mondayUrl).
const keyOf = (f: ShipmentFile) => f.mondayUrl ?? f.url;

// The list of links after the monday.com import runs again: what is already on the shipment stays (a link already moved to SharePoint is
// never turned back into a monday.com one), and only files monday.com has that the shipment does not know yet are added.
export function mergeFiles(existing: ShipmentFile[], incoming: ShipmentFile[]): ShipmentFile[] {
  const known = new Set(existing.map(keyOf));
  return [...existing, ...incoming.filter((f) => !known.has(keyOf(f)))];
}
