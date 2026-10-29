import type { Choice } from "@/lib/projectProfile";

// Shipments: one record per shipment of a project's goods, from booking to delivery on the site. Pure rules and validation; the
// storage is in src/server/services/shipments.ts. Facts only (names, container numbers, dates, a short note): no documents.

export const SHIPMENT_STATUSES: Choice[] = [
  { value: "BOOKED", label: "Booked", bg: "#E4E6EC", text: "#4A4F5C" },
  { value: "IN_TRANSIT", label: "At sea", bg: "#DCE8FB", text: "#1D4F9F" },
  { value: "AT_PORT", label: "At the port", bg: "#E6DEF8", text: "#4B2E99" },
  { value: "CUSTOMS", label: "In customs", bg: "#FEF0D6", text: "#8A5300" },
  { value: "DELIVERY_PLANNED", label: "Delivery planned", bg: "#D6F0F3", text: "#0E6B77" },
  { value: "DELIVERED", label: "Delivered", bg: "#D8F5E3", text: "#047857" },
];
export const CUSTOMS_STATUSES: Choice[] = [
  { value: "NOT_STARTED", label: "Not started", bg: "#E4E6EC", text: "#4A4F5C" },
  { value: "IN_PROGRESS", label: "In progress", bg: "#FEF0D6", text: "#8A5300" },
  { value: "HELD", label: "Held", bg: "#FCE0DD", text: "#8C1D18" },
  { value: "CLEARED", label: "Cleared", bg: "#D8F5E3", text: "#047857" },
];
export const isShipmentStatus = (v: unknown): v is string => SHIPMENT_STATUSES.some((s) => s.value === v);
export const isCustomsStatus = (v: unknown): v is string => CUSTOMS_STATUSES.some((s) => s.value === v);
export const shipmentStatusChoice = (v: string): Choice => SHIPMENT_STATUSES.find((s) => s.value === v) ?? SHIPMENT_STATUSES[0];
export const customsStatusChoice = (v: string): Choice => CUSTOMS_STATUSES.find((s) => s.value === v) ?? CUSTOMS_STATUSES[0];

export const MAX_SHIPMENTS = 40;
export const MAX_CONTAINERS = 60;
export const MAX_NOTES = 1000;

// "TCNU 536825-9" / "tcnu5368259" -> "TCNU5368259": four letters and seven digits (the ISO 6346 shape: owner code, category, number,
// check digit). null for anything else.
export function cleanContainerNumber(raw: string): string | null {
  const t = raw.replace(/[\s-]+/g, "").toUpperCase();
  return /^[A-Z]{4}\d{7}$/.test(t) ? t : null;
}

// Containers typed as a list ("TCNU5368259, BHCU3190171" or one per line), or sent as an array. Duplicates dropped; a bad one is an error.
export function parseContainers(value: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  const parts = Array.isArray(value) ? value.map((v) => String(v ?? "")) : typeof value === "string" ? value.split(/[,;\n]+/) : [];
  const out: string[] = [];
  for (const part of parts.map((p) => p.trim()).filter(Boolean)) {
    const n = cleanContainerNumber(part);
    if (!n) return { ok: false, error: `"${part.slice(0, 30)}" isn't a container number (four letters and seven digits, like TCNU5368259).` };
    if (!out.includes(n)) out.push(n);
  }
  if (out.length > MAX_CONTAINERS) return { ok: false, error: `At most ${MAX_CONTAINERS} containers per shipment.` };
  return { ok: true, value: out };
}

export type ShipmentInput = {
  reference: string;
  goods: string;
  forwarder: string;
  vessel: string;
  containers: string; // a list, comma or line separated
  portOfLoading: string;
  portOfDischarge: string;
  status: string;
  customsStatus: string;
  etd: string; // YYYY-MM-DD, "" = none
  eta: string;
  arrivedAt: string;
  customsClearedAt: string;
  deliveryDate: string;
  deliveredAt: string;
  notes: string;
};

export type CleanShipment = {
  reference: string;
  goods: string | null;
  forwarder: string | null;
  vessel: string | null;
  containers: string[];
  portOfLoading: string | null;
  portOfDischarge: string | null;
  status: string;
  customsStatus: string;
  etd: string | null;
  eta: string | null;
  arrivedAt: string | null;
  customsClearedAt: string | null;
  deliveryDate: string | null;
  deliveredAt: string | null;
  notes: string | null;
};

export const DATE_KEYS = ["etd", "eta", "arrivedAt", "customsClearedAt", "deliveryDate", "deliveredAt"] as const;
export const DATE_LABELS: Record<(typeof DATE_KEYS)[number], string> = {
  etd: "Sails (ETD)",
  eta: "Expected at the port (ETA)",
  arrivedAt: "Arrived at the port",
  customsClearedAt: "Customs cleared",
  deliveryDate: "Delivery to the site (planned)",
  deliveredAt: "Delivered",
};

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const str = (v: unknown) => (typeof v === "string" ? v : "");
const oneLine = (v: unknown, max: number) => str(v).replace(/\s+/g, " ").trim().slice(0, max);
const validDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

// What the form (or an approved proposal) sends, checked and tidied. Delivery and arrival can't be in the future: they are facts.
export function cleanShipment(input: Partial<Record<keyof ShipmentInput, unknown>>, todayIso: string): Result<CleanShipment> {
  const reference = oneLine(input.reference, 120);
  if (!reference) return { ok: false, error: "Name the shipment (a PO or invoice number, or something like “Shipment #02”)." };
  const status = str(input.status) || "BOOKED";
  if (!isShipmentStatus(status)) return { ok: false, error: "That shipment status doesn't exist." };
  const customsStatus = str(input.customsStatus) || "NOT_STARTED";
  if (!isCustomsStatus(customsStatus)) return { ok: false, error: "That customs status doesn't exist." };
  const containers = parseContainers(input.containers);
  if (!containers.ok) return containers;
  const dates = {} as Record<(typeof DATE_KEYS)[number], string | null>;
  for (const key of DATE_KEYS) {
    const v = str(input[key]).trim();
    if (!v) {
      dates[key] = null;
      continue;
    }
    if (!validDate(v)) return { ok: false, error: `${DATE_LABELS[key]} isn't a valid date.` };
    if ((key === "arrivedAt" || key === "customsClearedAt" || key === "deliveredAt") && v > todayIso) return { ok: false, error: `${DATE_LABELS[key]} can't be in the future.` };
    dates[key] = v;
  }
  if (status === "DELIVERED" && !dates.deliveredAt) return { ok: false, error: "A delivered shipment needs the day it was delivered." };
  const notes = str(input.notes).replace(/\r\n?/g, "\n").trim();
  if (notes.length > MAX_NOTES) return { ok: false, error: `The note can be at most ${MAX_NOTES} characters.` };
  const orNull = (v: string) => v || null;
  return {
    ok: true,
    value: {
      reference,
      goods: orNull(oneLine(input.goods, 200)),
      forwarder: orNull(oneLine(input.forwarder, 120)),
      vessel: orNull(oneLine(input.vessel, 120)),
      containers: containers.value,
      portOfLoading: orNull(oneLine(input.portOfLoading, 120)),
      portOfDischarge: orNull(oneLine(input.portOfDischarge, 120)),
      status,
      customsStatus,
      ...dates,
      notes: orNull(notes),
    },
  };
}

// The one shipment an email means: the same reference (ignoring case and spaces), else exactly one that shares a container number.
// null when none matches; "many" when the choice is not clear (a person decides).
export function findShipment<T extends { reference: string; containers: string[] }>(existing: T[], reference: string, containers: string[]): T | null | "many" {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const byRef = existing.filter((s) => norm(s.reference) === norm(reference));
  if (byRef.length === 1) return byRef[0];
  if (byRef.length > 1) return "many";
  const byContainer = containers.length ? existing.filter((s) => s.containers.some((c) => containers.includes(c))) : [];
  if (byContainer.length === 1) return byContainer[0];
  return byContainer.length > 1 ? "many" : null;
}

// Order: the ones still on their way first (nearest arrival first), delivered ones last.
export function sortShipments<T extends { status: string; eta: string | null; deliveryDate: string | null; reference: string }>(list: T[]): T[] {
  const key = (s: T) => s.deliveryDate ?? s.eta ?? "9999-12-31";
  return [...list].sort((a, b) => Number(a.status === "DELIVERED") - Number(b.status === "DELIVERED") || key(a).localeCompare(key(b)) || a.reference.localeCompare(b.reference));
}
