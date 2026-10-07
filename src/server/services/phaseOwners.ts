import type { PhaseName } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { PHASE_ORDER } from "@/lib/phases";

export const MAX_PHASES_AT_ONCE = 500;

async function activePerson(personId: string) {
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { active: true } });
  if (!person?.active) throw new UserError("Choose an active person.");
}

// Sets (or, with null, clears) the owner of whole phases. Item owners are not touched.
export async function setPhaseOwners(phaseIds: string[], personId: string | null): Promise<number> {
  if (!Array.isArray(phaseIds) || phaseIds.length === 0) throw new UserError("Choose at least one phase.");
  if (phaseIds.length > MAX_PHASES_AT_ONCE) throw new UserError("Too many phases at once.");
  if (personId) await activePerson(personId);
  const result = await prisma.phase.updateMany({ where: { id: { in: phaseIds } }, data: { ownerId: personId || null } });
  if (result.count === 0) throw new UserError("Those phases no longer exist.");
  return result.count;
}

// The default owner of a phase on newly created projects. null clears it.
export async function setPhaseDefaultOwner(phase: PhaseName, personId: string | null): Promise<void> {
  if (!PHASE_ORDER.includes(phase)) throw new UserError("Unknown phase.");
  if (!personId) {
    await prisma.phaseDefaultOwner.deleteMany({ where: { phase } });
    return;
  }
  await activePerson(personId);
  await prisma.phaseDefaultOwner.upsert({ where: { phase }, update: { personId }, create: { phase, personId } });
}

// Gives every phase that has no owner yet its default owner. Existing owners are never changed. `onlyProjectIds`
// limits it to those projects (used by the tests, which must never touch real projects).
export async function applyDefaultPhaseOwners(onlyProjectIds?: string[]): Promise<number> {
  const defaults = await prisma.phaseDefaultOwner.findMany({ where: { person: { active: true } } });
  let assigned = 0;
  for (const { phase, personId } of defaults) {
    const result = await prisma.phase.updateMany({
      where: { name: phase, ownerId: null, ...(onlyProjectIds ? { projectId: { in: onlyProjectIds } } : {}) },
      data: { ownerId: personId },
    });
    assigned += result.count;
  }
  return assigned;
}
