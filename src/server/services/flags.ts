import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import {
  DEFAULT_FLAG_COLOR,
  checkNewFlag,
  isFlagColor,
  parseFlagColors,
  withoutFlag,
  type FlagColor,
} from "@/lib/flags";

export type FlagTarget = "customer" | "project";

// Customer flags also carry a green / yellow / red color (Customer.flagColors); project flags are plain labels.
type State = { flags: string[]; colors: Record<string, FlagColor> };

async function current(kind: FlagTarget, id: string): Promise<State> {
  if (kind === "customer") {
    const row = await prisma.customer.findUnique({ where: { id }, select: { flags: true, flagColors: true } });
    if (!row) throw new UserError("That customer no longer exists.");
    return { flags: row.flags, colors: parseFlagColors(row.flagColors) };
  }
  const row = await prisma.project.findUnique({ where: { id }, select: { flags: true } });
  if (!row) throw new UserError("That project no longer exists.");
  return { flags: row.flags, colors: {} };
}

async function save(kind: FlagTarget, id: string, state: State) {
  if (kind === "customer") {
    // keep colors only for flags that still exist
    const colors: Record<string, FlagColor> = {};
    for (const label of state.flags) if (state.colors[label]) colors[label] = state.colors[label];
    await prisma.customer.update({ where: { id }, data: { flags: state.flags, flagColors: colors as Prisma.InputJsonObject } });
  } else {
    await prisma.project.update({ where: { id }, data: { flags: state.flags } });
  }
}

export async function addFlag(kind: FlagTarget, id: string, raw: string, color: FlagColor = DEFAULT_FLAG_COLOR): Promise<string[]> {
  if (!isFlagColor(color)) throw new UserError("Choose green, yellow or red.");
  const state = await current(kind, id);
  const check = checkNewFlag(raw, state.flags);
  if (!check.ok) throw new UserError(check.error);
  const next = { flags: [...state.flags, check.label], colors: kind === "customer" ? { ...state.colors, [check.label]: color } : state.colors };
  await save(kind, id, next);
  return next.flags;
}

export async function removeFlag(kind: FlagTarget, id: string, label: string): Promise<string[]> {
  const state = await current(kind, id);
  const flags = withoutFlag(state.flags, label);
  await save(kind, id, { flags, colors: state.colors });
  return flags;
}

export async function setFlagColor(customerId: string, label: string, color: FlagColor): Promise<void> {
  if (!isFlagColor(color)) throw new UserError("Choose green, yellow or red.");
  const state = await current("customer", customerId);
  const exact = state.flags.find((f) => f.toLowerCase() === label.toLowerCase());
  if (!exact) throw new UserError("That flag no longer exists.");
  await save("customer", customerId, { flags: state.flags, colors: { ...state.colors, [exact]: color } });
}

// Every label already in use, to suggest when typing a new one.
export async function knownFlags(): Promise<string[]> {
  const [customers, projects] = await Promise.all([
    prisma.customer.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
    prisma.project.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
  ]);
  return [...new Set([...customers, ...projects].flatMap((r) => r.flags))].sort((a, b) => a.localeCompare(b));
}
