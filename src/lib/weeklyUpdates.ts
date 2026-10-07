// The weekly updates view/export: which days to look at, and the CSV for the download.
// Weeks run Sunday to Saturday (the project meeting is on Sunday). Dates are "YYYY-MM-DD" strings.

export type DateRange = { from: string; to: string };

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 366;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number) => new Date(d.getTime() + days * DAY);
const isValid = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && iso(new Date(`${v}T00:00:00Z`)) === v;

// `today` is a calendar date at UTC midnight (see todayInAppTz).
export function weekStart(today: Date): Date {
  return shift(today, -today.getUTCDay()); // getUTCDay: 0 = Sunday
}

export const RANGE_PRESETS = ["last-week", "this-week", "last-7"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];
export const PRESET_LABELS: Record<RangePreset, string> = {
  "last-week": "Last week (Sun–Sat)",
  "this-week": "This week so far",
  "last-7": "Last 7 days",
};

export function presetRange(preset: RangePreset, today: Date): DateRange {
  const start = weekStart(today);
  if (preset === "this-week") return { from: iso(start), to: iso(today) };
  if (preset === "last-7") return { from: iso(shift(today, -6)), to: iso(today) };
  return { from: iso(shift(start, -7)), to: iso(shift(start, -1)) };
}

// ?from=&to= when both are valid dates (and not absurdly far apart), otherwise last week.
export function parseRange(params: { from?: string | string[]; to?: string | string[] }, today: Date): DateRange {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const from = one(params.from);
  const to = one(params.to);
  if (isValid(from) && isValid(to) && from <= to) {
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
    if (days < MAX_DAYS) return { from, to };
  }
  return presetRange("last-week", today);
}

// Which preset a range is, for highlighting its chip.
export function presetOf(range: DateRange, today: Date): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const r = presetRange(p, today);
    return r.from === range.from && r.to === range.to;
  }) ?? null;
}

// ---- CSV (opens in Excel) ----

export type ExportRow = {
  project: string;
  customer: string;
  level: "Phase" | "Item";
  phase: string;
  item: string;
  status: string;
  owner: string;
  update: string;
  date: string;
};

export const CSV_COLUMNS: { key: keyof ExportRow; header: string }[] = [
  { key: "project", header: "Project" },
  { key: "customer", header: "Customer" },
  { key: "level", header: "Level" },
  { key: "phase", header: "Phase" },
  { key: "item", header: "Item" },
  { key: "status", header: "Status" },
  { key: "owner", header: "Owner" },
  { key: "update", header: "Update" },
  { key: "date", header: "Update date" },
];

// Cells that start with = + - @ would be run as formulas by Excel, so they are prefixed with an apostrophe.
const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// UTF-8 with a BOM so Excel shows accents and € correctly; CRLF line ends.
export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_COLUMNS.map((c) => cell(c.header)).join(","), ...rows.map((r) => CSV_COLUMNS.map((c) => cell(r[c.key])).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
