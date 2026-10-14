// Flags are short labels people add by hand to a customer or project ("Payment risk", "Needs attention").
export const MAX_FLAG_LENGTH = 40;
export const MAX_FLAGS = 12;

export type FlagCheck = { ok: true; label: string } | { ok: false; error: string };

// Trims and collapses spaces; rejects empty, over-long and duplicate (case-insensitive) labels.
export function checkNewFlag(raw: string, existing: string[]): FlagCheck {
  const label = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!label) return { ok: false, error: "Type a flag first." };
  if (label.length > MAX_FLAG_LENGTH) return { ok: false, error: `A flag can be at most ${MAX_FLAG_LENGTH} characters.` };
  if (existing.some((f) => f.toLowerCase() === label.toLowerCase())) return { ok: false, error: `"${label}" is already flagged.` };
  if (existing.length >= MAX_FLAGS) return { ok: false, error: `At most ${MAX_FLAGS} flags each. Remove one first.` };
  return { ok: true, label };
}

// Customer flags carry a traffic-light color. A flag with no color recorded counts as yellow.
export type FlagColor = "GREEN" | "YELLOW" | "RED";
export const FLAG_COLORS: FlagColor[] = ["GREEN", "YELLOW", "RED"];
export const DEFAULT_FLAG_COLOR: FlagColor = "YELLOW";

export const FLAG_COLOR_LABELS: Record<FlagColor, string> = { GREEN: "Green", YELLOW: "Yellow", RED: "Red" };
export const FLAG_COLOR_STYLES: Record<FlagColor, { bg: string; text: string; border: string; dot: string }> = {
  GREEN: { bg: "#E3F6EA", text: "#0B5D34", border: "#8FD3A9", dot: "#1FA25A" },
  YELLOW: { bg: "#FEF6E7", text: "#7A4E00", border: "#F0C069", dot: "#E0A100" },
  RED: { bg: "#FCE9E7", text: "#8C1D18", border: "#EE9A93", dot: "#D93025" },
};

export const isFlagColor = (value: unknown): value is FlagColor => FLAG_COLORS.includes(value as FlagColor);

// Reads the stored {label: color} map defensively (it is JSON in the database).
export function parseFlagColors(value: unknown): Record<string, FlagColor> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FlagColor> = {};
  for (const [label, color] of Object.entries(value as Record<string, unknown>)) if (isFlagColor(color)) out[label] = color;
  return out;
}

export const colorOf = (colors: Record<string, FlagColor>, label: string): FlagColor => colors[label] ?? DEFAULT_FLAG_COLOR;

// The next color when a flag's dot is clicked: green, yellow, red, green...
export const nextFlagColor = (color: FlagColor): FlagColor => FLAG_COLORS[(FLAG_COLORS.indexOf(color) + 1) % FLAG_COLORS.length];

// For sorting customers: any red beats any yellow beats green; more flags break ties.
export function flagSeverity(labels: string[], colors: Record<string, FlagColor>): number {
  const worst = labels.reduce((max, label) => Math.max(max, FLAG_COLORS.indexOf(colorOf(colors, label)) + 1), 0);
  return worst * 1000 + labels.length;
}

export const withoutFlag = (flags: string[], label: string) => flags.filter((f) => f.toLowerCase() !== label.toLowerCase());

// An optional explanation of why a flag is there. Only the latest text is kept, with the calendar day it was
// last changed (YYYY-MM-DD, set by the server).
export const MAX_FLAG_NOTE = 500;
export type FlagNote = { text: string; at: string };

export function cleanFlagNote(raw: string | null | undefined): { ok: true; value: string | null } | { ok: false; error: string } {
  const value = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (value.length > MAX_FLAG_NOTE) return { ok: false, error: `Keep the note under ${MAX_FLAG_NOTE} characters.` };
  return { ok: true, value: value === "" ? null : value };
}

// Reads the stored {label: {text, at}} map defensively (it is JSON in the database).
export function parseFlagNotes(value: unknown): Record<string, FlagNote> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, FlagNote> = {};
  for (const [label, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { text, at } = entry as { text?: unknown; at?: unknown };
    if (typeof text === "string" && text.trim() !== "") out[label] = { text, at: typeof at === "string" ? at : "" };
  }
  return out;
}

// What a note does when saved: empty text removes it, identical text keeps its date, anything else gets today's date.
export function nextFlagNote(previous: FlagNote | undefined, text: string | null, today: string): FlagNote | null {
  if (text === null) return null;
  if (previous && previous.text === text) return previous;
  return { text, at: today };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatNoteDate(at: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at);
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
}

// The hover text of a flag chip: its severity, then the note (and when it was last changed) if there is one.
export function flagTitle(severity: string | null, note: FlagNote | undefined): string {
  const head = severity ? `${severity} flag` : "Flag";
  if (!note) return head;
  const when = formatNoteDate(note.at);
  return `${head}: ${note.text}${when ? ` (updated ${when})` : ""}`;
}
