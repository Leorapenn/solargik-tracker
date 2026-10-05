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

export const withoutFlag = (flags: string[], label: string) => flags.filter((f) => f.toLowerCase() !== label.toLowerCase());
