import type { CustomerImportance, ProjectLifecycle } from "@prisma/client";

// Decides what an import may change, so that fields edited by hand on the site (lockedFields) and
// contacts edited by hand (locked) are never overwritten.

const numbersEqual = (existing: unknown, next: number | null): boolean => {
  const current = existing === null || existing === undefined ? null : Number(existing);
  if (current === null || next === null) return current === next;
  return Math.abs(current - next) < 1e-6;
};

export type ProjectIncoming = {
  name: string;
  customerId: string;
  contractValue: number | null;
  capacityMw: number | null;
  country: string | null;
  lifecycle: ProjectLifecycle;
  mondayStage: string | null;
  mondayStatus: string | null;
};

export type ProjectExisting = {
  name: string;
  customerId: string;
  contractValue: unknown;
  capacityMw: unknown;
  country: string | null;
  lifecycle: ProjectLifecycle;
  mondayStage: string | null;
  mondayStatus: string | null;
  lockedFields: string[];
};

// Returns only the fields that should change. Empty object = nothing to do.
export function planProjectUpdate(existing: ProjectExisting, incoming: ProjectIncoming): Partial<ProjectIncoming> {
  const locked = (field: string) => existing.lockedFields.includes(field);
  const plan: Partial<ProjectIncoming> = {};

  if (!locked("name") && existing.name !== incoming.name) plan.name = incoming.name;
  if (!locked("contractValue") && !numbersEqual(existing.contractValue, incoming.contractValue)) {
    plan.contractValue = incoming.contractValue;
  }
  if (!locked("capacityMw") && !numbersEqual(existing.capacityMw, incoming.capacityMw)) {
    plan.capacityMw = incoming.capacityMw;
  }
  if (!locked("country") && (existing.country ?? null) !== incoming.country) plan.country = incoming.country;
  if (!locked("lifecycle") && existing.lifecycle !== incoming.lifecycle) plan.lifecycle = incoming.lifecycle;

  // Facts about where the project is in monday.com: always kept current.
  if (existing.customerId !== incoming.customerId) plan.customerId = incoming.customerId;
  if ((existing.mondayStage ?? null) !== incoming.mondayStage) plan.mondayStage = incoming.mondayStage;
  if ((existing.mondayStatus ?? null) !== incoming.mondayStatus) plan.mondayStatus = incoming.mondayStatus;

  return plan;
}

export function planCustomerUpdate(
  existing: { name: string; importance: CustomerImportance; lockedFields: string[] },
  incoming: { name: string; importance: CustomerImportance | null },
): { name?: string; importance?: CustomerImportance } {
  const locked = (field: string) => existing.lockedFields.includes(field);
  const plan: { name?: string; importance?: CustomerImportance } = {};
  if (!locked("name") && existing.name !== incoming.name) plan.name = incoming.name;
  if (!locked("importance") && incoming.importance && existing.importance !== incoming.importance) {
    plan.importance = incoming.importance;
  }
  return plan;
}

// monday's "Customer Importance" labels are exactly Normal / Semi-Strategic / Strategic.
export function deriveImportance(label: string | null | undefined): CustomerImportance | null {
  switch ((label ?? "").trim().toLowerCase()) {
    case "strategic":
      return "STRATEGIC";
    case "semi-strategic":
      return "SEMI_STRATEGIC";
    case "normal":
      return "NORMAL";
    default:
      return null;
  }
}

export type ContactFields = { name: string; email: string | null; role: string | null; englishLevel: string | null };
export type IncomingContact = ContactFields & { slot: number };
export type ExistingContact = ContactFields & { id: string; slot: number; customerId: string; locked: boolean };

export type ContactPlan = {
  create: IncomingContact[];
  update: { id: string; data: ContactFields & { customerId: string } }[];
  remove: string[];
};

// Syncs one project's imported contacts (slots POC 1-4). Locked (hand-edited) contacts are never
// touched, and a slot that is now empty in monday.com removes only unlocked imported contacts.
export function planContactSync(existing: ExistingContact[], incoming: IncomingContact[], customerId: string): ContactPlan {
  const plan: ContactPlan = { create: [], update: [], remove: [] };
  const bySlot = new Map(existing.map((c) => [c.slot, c]));
  const incomingSlots = new Set(incoming.map((c) => c.slot));

  for (const contact of incoming) {
    const current = bySlot.get(contact.slot);
    if (!current) {
      plan.create.push(contact);
      continue;
    }
    if (current.locked) continue;
    const changed =
      current.name !== contact.name ||
      current.email !== contact.email ||
      current.role !== contact.role ||
      current.englishLevel !== contact.englishLevel ||
      current.customerId !== customerId;
    if (changed) {
      plan.update.push({
        id: current.id,
        data: { name: contact.name, email: contact.email, role: contact.role, englishLevel: contact.englishLevel, customerId },
      });
    }
  }

  for (const current of existing) {
    if (!incomingSlots.has(current.slot) && !current.locked) plan.remove.push(current.id);
  }
  return plan;
}
