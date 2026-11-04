import { cleanContainerNumber, type ShipmentInput } from "@/lib/shipments";

// Turns an item of the monday.com "International Shipping V02" board (read-only) into a 360 shipment: its name, containers, dates,
// port, shipper, shipping method, status and the Files column as links. Pure rules; reading monday.com and saving are in
// src/scripts/import-shipments.ts and src/server/services/shipmentImport.ts. A label that is not understood is reported, never guessed.

export const MONDAY_SHIPPING_BOARD = "6652155567";
export const MONDAY_ITEM_URL = (id: string) => `https://solargikcrm.monday.com/boards/${MONDAY_SHIPPING_BOARD}/pulses/${id}`;

// the board's columns this reads
export const MONDAY_SHIPPING_COLUMNS = {
  files: "files__1",
  containers: "text9__1",
  timeline: "timeline__1", // A.T.D - E.T.A
  initialEta: "date__1",
  arrival: "arrival_date__1",
  status: "status__1",
  port: "port__1",
  shipper: "text94__1",
  method: "label__1",
  what: "long_text__1",
} as const;

export type MondayShipmentItem = { id: string; name: string; group: { id: string; title: string }; values: Partial<Record<keyof typeof MONDAY_SHIPPING_COLUMNS, string | null>> };

export type ShipmentFile = { name: string; url: string };

// monday.com's status -> the 360 stage. "Arrive to the site" is Delivered; arriving at a warehouse is its own stage. Anything else is
// reported as not understood.
const STATUS_MAP: Record<string, { status: string; customs?: string }> = {
  "on the way (sea)": { status: "IN_TRANSIT" },
  "on the way (air)": { status: "IN_TRANSIT" },
  "on the way (land)": { status: "IN_TRANSIT" },
  "arrived to destination port": { status: "AT_PORT" },
  "customs (italy)": { status: "CUSTOMS", customs: "IN_PROGRESS" },
  "arrive to the wh": { status: "AT_WAREHOUSE" },
  "arrived-warehouse": { status: "AT_WAREHOUSE" },
  "in wh-clients area": { status: "AT_WAREHOUSE" },
  "in inventory": { status: "AT_WAREHOUSE" },
  "delivery date confirmed": { status: "DELIVERY_PLANNED" },
  "out for delivery": { status: "DELIVERY_PLANNED" },
  "arrive to the site": { status: "DELIVERED" },
  done: { status: "DELIVERED" },
  "arrive waiting for pod": { status: "AWAITING_POD" },
  "pending coordination": { status: "PENDING_COORDINATION" },
  stuck: { status: "STUCK" },
  "so issued": { status: "BOOKED" },
  "production / packaging": { status: "BOOKED" },
  "ready for packing": { status: "BOOKED" },
  "awaiting document completion": { status: "BOOKED" },
  "awaiting payment": { status: "BOOKED" },
};

// The project number an item belongs to: the number its own name starts with ("356-PRJ / Shipment #1"), else the number of its group
// ("356 - PRJ (FreeIngegneria, ...)") unless the group covers a range ("115-127 - (Cogefeed)"). null when it can't be told.
export function itemProjectNumber(item: Pick<MondayShipmentItem, "name" | "group">): number | null {
  const lead = /^\s*(\d{2,4})(?!\d)/.exec(item.name)?.[1];
  if (lead) return Number(lead);
  const title = item.group.title.trim();
  if (/^\d{2,4}\s*[-–]\s*\d{2,4}(?!\d)/.test(title)) return null; // a range of projects
  const g = /^(\d{2,4})(?!\d)/.exec(title)?.[1];
  return g ? Number(g) : null;
}

// "356-Energis1" / "082-GEN 1.5 Upgrade" -> 356 / 82
export function trackedProjectNumber(projectName: string): number | null {
  const m = /^\s*(\d{2,4})(?!\d)/.exec(projectName)?.[1];
  return m ? Number(m) : null;
}

// The files of a monday.com Files column as links. The column's text lists the file addresses; only monday.com's own are kept.
export const MAX_FILES = 60;
export function parseFiles(text: string | null | undefined): ShipmentFile[] {
  const urls = (text ?? "").match(/https:\/\/[^\s,]+/g) ?? [];
  const out: ShipmentFile[] = [];
  for (const url of urls) {
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      continue;
    }
    if (!(host === "monday.com" || host.endsWith(".monday.com")) || out.some((f) => f.url === url)) continue;
    let name = url.split("/").pop() ?? "file";
    try {
      name = decodeURIComponent(name);
    } catch {
      /* keep the raw name */
    }
    out.push({ name: name.slice(0, 200) || "file", url });
  }
  return out.slice(0, MAX_FILES);
}

const ISO = /\d{4}-\d{2}-\d{2}/g;
export function parseTimeline(text: string | null | undefined): { start: string | null; end: string | null } {
  const days = (text ?? "").match(ISO) ?? [];
  return { start: days[0] ?? null, end: days[1] ?? days[0] ?? null };
}

export type ShipmentImport = {
  mondayItemId: string;
  mondayUrl: string;
  input: Partial<ShipmentInput>; // reference and the facts monday.com has
  customsStatus: string | null;
  shipper: string | null;
  shippingMethod: string | null;
  files: ShipmentFile[];
  issues: string[]; // what could not be taken over, for the report
};

// a courier parcel, a truck, a delivery note or a placeholder: not a container, and nothing to report
const COURIER_OR_NO_CONTAINER = /DHL|FEDEX|\bUPS\b|\bTNT\b|AMAZON|PLATE|DDT|AWB|TRU[CK]|^[\d\s./-]+$/i;

const one = (v: string | null | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export function shipmentFromMonday(item: MondayShipmentItem, todayIso: string): ShipmentImport {
  const v = item.values;
  const issues: string[] = [];
  const reference = one(item.name, 120) || `Shipment ${item.id}`;

  // The container column holds container numbers in any layout (separated by spaces, commas, lines or slashes), and sometimes a courier
  // tracking number (DHL, FedEx...) for air parcels. Container numbers are picked out; a courier number is not one and is ignored
  // quietly; anything else that is there but holds no container number is reported.
  const containers: string[] = [];
  const containerText = (v.containers ?? "").toUpperCase();
  for (const hit of containerText.match(/[A-Z]{4}[\s-]?\d{6}[\s-]?\d(?!\d)/g) ?? []) {
    const c = cleanContainerNumber(hit);
    if (c && !containers.includes(c)) containers.push(c);
  }
  if (containers.length === 0 && containerText.trim() && !COURIER_OR_NO_CONTAINER.test(containerText.trim())) {
    issues.push(`container column "${containerText.trim().slice(0, 40)}" holds no container number: left out`);
  }

  const { start, end } = parseTimeline(v.timeline);
  const arrival = (v.arrival ?? "").match(ISO)?.[0] ?? null;
  const initialEta = (v.initialEta ?? "").match(ISO)?.[0] ?? null;
  const label = one(v.status, 80);
  const mapped = STATUS_MAP[label.toLowerCase()];

  const input: Partial<ShipmentInput> = { reference };
  let status = mapped?.status ?? "BOOKED";
  const noteLines: string[] = [];
  if (!mapped) {
    const why = label ? `status "${label}" is not one of 360's stages` : "no status";
    issues.push(`${why}: imported as Booked`);
    noteLines.push(label ? `monday.com status: ${label}` : "monday.com has no status for this shipment");
  }

  // dates: the timeline is departure -> expected arrival; the arrival date is when it arrived, or when it is expected
  if (start) input.etd = start;
  if (end) input.eta = end;
  else if (initialEta) input.eta = initialEta;
  if (status === "DELIVERED") {
    const day = arrival && arrival <= todayIso ? arrival : end && end <= todayIso ? end : null;
    if (day) input.deliveredAt = day;
    else {
      issues.push(`"${label}" but no arrival date in the past: imported as Booked`);
      noteLines.push(`monday.com status: ${label}, without an arrival date`);
      status = "BOOKED";
    }
  } else if (status === "AT_WAREHOUSE" || status === "AT_PORT" || status === "CUSTOMS" || status === "AWAITING_POD") {
    if (arrival && arrival <= todayIso) input.arrivedAt = arrival;
  } else if (status === "DELIVERY_PLANNED") {
    if (arrival) input.deliveryDate = arrival;
  } else if (arrival && !end) input.eta = arrival;

  input.status = status;
  const goods = one(v.what, 200);
  if (goods) input.goods = goods;
  const port = one(v.port, 120);
  if (port && port !== "-" && port.toLowerCase() !== "n/a") input.portOfDischarge = port;
  if (containers.length) input.containers = containers.join(", ");
  if (noteLines.length) input.notes = noteLines.join("\n");

  const files = parseFiles(v.files);
  return {
    mondayItemId: item.id,
    mondayUrl: MONDAY_ITEM_URL(item.id),
    input,
    customsStatus: mapped?.customs ?? null,
    shipper: one(v.shipper, 120) || null,
    shippingMethod: one(v.method, 60) || null,
    files,
    issues,
  };
}
