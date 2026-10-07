// Product warranty, as set out in article 6 of the Revalue Framework Supply Agreement (the Exhibit F and Exhibit D
// projects apply the same terms): "Warranty Period from Delivery Date" -
//   structural units (piles, torque tube, support beams, bearings, motion unit): 10 years
//   drive unit (motor, gear, control board): 5 years
// Delivery is DDP, i.e. arrival at the delivery point, which is what the Supply delivery items record. Each
// equipment group therefore starts on the completed date of the delivery item it ships with. A project whose
// contract differs can override the two periods (Project.warrantyStructuralYears / warrantyDriveYears).

export const WARRANTY_DEFAULT_YEARS = { structural: 10, drive: 5 } as const;
export const EXPIRING_SOON_DAYS = 180;

type Group = "structural" | "drive";

export const WARRANTY_LINES: { key: string; label: string; group: Group; item: string }[] = [
  { key: "piles", label: "Piles", group: "structural", item: "Delivery – Piles" },
  { key: "structure", label: "Torque tube and support beams", group: "structural", item: "Delivery – Tracker Structure" },
  { key: "motion", label: "Bearings and motion unit", group: "structural", item: "Delivery – Drive Units & I&C" },
  { key: "drive", label: "Drive unit (motor, gear, control board)", group: "drive", item: "Delivery – Drive Units & I&C" },
];

export type WarrantyStatus = "NOT_DELIVERED" | "NEEDS_DATE" | "ACTIVE" | "EXPIRING" | "EXPIRED";

export type WarrantyItem = { name: string; status: string; completedAt: string | null };
export type WarrantyLine = {
  key: string;
  label: string;
  item: string;
  years: number;
  deliveredOn: string | null; // YYYY-MM-DD
  expiresOn: string | null;
  daysLeft: number | null; // negative once expired
  status: WarrantyStatus;
};

const DAY = 24 * 60 * 60 * 1000;
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

// The same calendar date `years` later; 29 Feb in a year without one becomes 28 Feb.
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = y + years;
  const lastDay = new Date(Date.UTC(target, m, 0)).getUTCDate();
  return `${target}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((day(toIso) - day(fromIso)) / DAY);
}

// "9 years 4 months left", "3 months left", "12 days left", "expired 2 months ago".
export function describeLeft(daysLeft: number, todayIso: string, expiresOn: string): string {
  if (daysLeft === 0) return "expires today";
  const [from, to] = daysLeft > 0 ? [todayIso, expiresOn] : [expiresOn, todayIso];
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  if (months < 0) months = 0;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [years ? `${years} year${years === 1 ? "" : "s"}` : "", rest ? `${rest} month${rest === 1 ? "" : "s"}` : ""].filter(Boolean);
  const span = parts.length ? parts.join(" ") : `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? "" : "s"}`;
  return daysLeft > 0 ? `${span} left` : `expired ${span} ago`;
}

export function warrantyLines(
  input: { items: WarrantyItem[]; structuralYears: number | null; driveYears: number | null },
  todayIso: string,
): WarrantyLine[] {
  return WARRANTY_LINES.map((line) => {
    const years = line.group === "structural" ? (input.structuralYears ?? WARRANTY_DEFAULT_YEARS.structural) : (input.driveYears ?? WARRANTY_DEFAULT_YEARS.drive);
    const item = input.items.find((i) => i.name === line.item);
    const base = { key: line.key, label: line.label, item: line.item, years, deliveredOn: null, expiresOn: null, daysLeft: null };
    if (!item || item.status !== "DONE") return { ...base, status: "NOT_DELIVERED" as const };
    if (!item.completedAt) return { ...base, status: "NEEDS_DATE" as const };
    const expiresOn = addYears(item.completedAt, years);
    const daysLeft = daysBetween(todayIso, expiresOn);
    const status: WarrantyStatus = daysLeft < 0 ? "EXPIRED" : daysLeft <= EXPIRING_SOON_DAYS ? "EXPIRING" : "ACTIVE";
    return { ...base, deliveredOn: item.completedAt, expiresOn, daysLeft, status };
  });
}

// Whole years only, 1 to 30; empty means "use the contract's default".
export function cleanWarrantyYears(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  const t = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : "";
  if (!t) return { ok: true, value: null };
  if (!/^\d{1,2}$/.test(t)) return { ok: false, error: "Use a whole number of years, for example 10." };
  const n = Number(t);
  if (n < 1 || n > 30) return { ok: false, error: "A warranty period is between 1 and 30 years." };
  return { ok: true, value: n };
}
