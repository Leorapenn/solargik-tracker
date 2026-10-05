import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { checkNewFlag, withoutFlag } from "@/lib/flags";

export type FlagTarget = "customer" | "project";

async function current(kind: FlagTarget, id: string): Promise<string[]> {
  const row =
    kind === "customer"
      ? await prisma.customer.findUnique({ where: { id }, select: { flags: true } })
      : await prisma.project.findUnique({ where: { id }, select: { flags: true } });
  if (!row) throw new UserError(`That ${kind} no longer exists.`);
  return row.flags;
}

async function save(kind: FlagTarget, id: string, flags: string[]) {
  if (kind === "customer") await prisma.customer.update({ where: { id }, data: { flags } });
  else await prisma.project.update({ where: { id }, data: { flags } });
}

export async function addFlag(kind: FlagTarget, id: string, raw: string): Promise<string[]> {
  const flags = await current(kind, id);
  const check = checkNewFlag(raw, flags);
  if (!check.ok) throw new UserError(check.error);
  const next = [...flags, check.label];
  await save(kind, id, next);
  return next;
}

export async function removeFlag(kind: FlagTarget, id: string, label: string): Promise<string[]> {
  const next = withoutFlag(await current(kind, id), label);
  await save(kind, id, next);
  return next;
}

// Every label already in use, to suggest when typing a new one.
export async function knownFlags(): Promise<string[]> {
  const [customers, projects] = await Promise.all([
    prisma.customer.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
    prisma.project.findMany({ where: { NOT: { flags: { isEmpty: true } } }, select: { flags: true } }),
  ]);
  return [...new Set([...customers, ...projects].flatMap((r) => r.flags))].sort((a, b) => a.localeCompare(b));
}
