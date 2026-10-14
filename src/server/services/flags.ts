import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { todayInAppTz } from "@/lib/dates";
import {
  DEFAULT_FLAG_COLOR,
  checkNewFlag,
  cleanFlagNote,
  isFlagColor,
  nextFlagNote,
  parseFlagColors,
  parseFlagNotes,
  withoutFlag,
  type FlagColor,
  type FlagNote,
} from "@/lib/flags";

export type FlagTarget = "customer" | "project";

// Customer and project flags both carry a green / yellow / red severity ({label: color} in flagColors) and an
// optional note saying why the flag is there ({label: {text, at}} in flagNotes).
type State = { flags: string[]; colors: Record<string, FlagColor>; notes: Record<string, FlagNote> };

async function current(kind: FlagTarget, id: string): Promise<State> {
  if (kind === "customer") {
    const row = await prisma.customer.findUnique({ where: { id }, select: { flags: true, flagColors: true, flagNotes: true } });
    if (!row) throw new UserError("That customer no longer exists.");
    return { flags: row.flags, colors: parseFlagColors(row.flagColors), notes: parseFlagNotes(row.flagNotes) };
  }
  const row = await prisma.project.findUnique({ where: { id }, select: { flags: true, flagColors: true, flagNotes: true } });
  if (!row) throw new UserError("That project no longer exists.");
  return { flags: row.flags, colors: parseFlagColors(row.flagColors), notes: parseFlagNotes(row.flagNotes) };
}

async function save(kind: FlagTarget, id: string, state: State) {
  // keep colors and notes only for flags that still exist
  const colors: Record<string, FlagColor> = {};
  const notes: Record<string, FlagNote> = {};
  for (const label of state.flags) {
    if (state.colors[label]) colors[label] = state.colors[label];
    if (state.notes[label]) notes[label] = state.notes[label];
  }
  const data = { flags: state.flags, flagColors: colors as Prisma.InputJsonObject, flagNotes: notes as unknown as Prisma.InputJsonObject };
  if (kind === "customer") await prisma.customer.update({ where: { id }, data });
  else await prisma.project.update({ where: { id }, data });
}

const today = () => todayInAppTz().toISOString().slice(0, 10);

export async function addFlag(kind: FlagTarget, id: string, raw: string, color: FlagColor = DEFAULT_FLAG_COLOR): Promise<string[]> {
  if (!isFlagColor(color)) throw new UserError("Choose green, yellow or red.");
  const state = await current(kind, id);
  const check = checkNewFlag(raw, state.flags);
  if (!check.ok) throw new UserError(check.error);
  const next = { flags: [...state.flags, check.label], colors: { ...state.colors, [check.label]: color }, notes: state.notes };
  await save(kind, id, next);
  return next.flags;
}

export async function removeFlag(kind: FlagTarget, id: string, label: string): Promise<string[]> {
  const state = await current(kind, id);
  const flags = withoutFlag(state.flags, label);
  await save(kind, id, { flags, colors: state.colors, notes: state.notes });
  return flags;
}

export async function setFlagColor(kind: FlagTarget, id: string, label: string, color: FlagColor): Promise<void> {
  if (!isFlagColor(color)) throw new UserError("Choose green, yellow or red.");
  const state = await current(kind, id);
  const exact = state.flags.find((f) => f.toLowerCase() === label.toLowerCase());
  if (!exact) throw new UserError("That flag no longer exists.");
  await save(kind, id, { flags: state.flags, colors: { ...state.colors, [exact]: color }, notes: state.notes });
}

// Sets, changes or clears the note of one flag. The date is stamped here, only when the text actually changes.
export async function setFlagNote(kind: FlagTarget, id: string, label: string, rawNote: string): Promise<void> {
  const cleaned = cleanFlagNote(rawNote);
  if (!cleaned.ok) throw new UserError(cleaned.error);
  const state = await current(kind, id);
  const exact = state.flags.find((f) => f.toLowerCase() === label.toLowerCase());
  if (!exact) throw new UserError("That flag no longer exists.");
  const notes = { ...state.notes };
  const next = nextFlagNote(notes[exact], cleaned.value, today());
  if (next) notes[exact] = next;
  else delete notes[exact];
  await save(kind, id, { flags: state.flags, colors: state.colors, notes });
}

// Every label already in use, to suggest when typing a new one.
export async function knownFlags(): Promise<string[]> {
  const [customers, projects] = await Promise.all([
    prisma.customer.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
    prisma.project.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
  ]);
  return [...new Set([...customers, ...projects].flatMap((r) => r.flags))].sort((a, b) => a.localeCompare(b));
}
