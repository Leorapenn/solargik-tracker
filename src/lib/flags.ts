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
