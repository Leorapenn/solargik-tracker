"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CustomerImportance, ProjectLifecycle } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { LIFECYCLE_ORDER } from "@/lib/lifecycle";
import { CUSTOMER_LOCKABLE, PROJECT_LOCKABLE } from "@/lib/lockable";

const IMPORTANCES: CustomerImportance[] = ["NORMAL", "SEMI_STRATEGIC", "STRATEGIC"];

function text(value: string | null | undefined, label: string, max: number, required = false): string | null {
  const v = (value ?? "").trim();
  if (!v) {
    if (required) throw new UserError(`${label} is required.`);
    return null;
  }
  if (v.length > max) throw new UserError(`${label} is too long.`);
  return v;
}

function amount(value: string | null | undefined, label: string): number | null {
  const v = (value ?? "").trim().replace(/[$,\s]/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new UserError(`${label} must be a positive number.`);
  return n;
}

const same = (a: unknown, b: unknown) => (a === null || a === undefined ? null : Number(a)) === b;

function withLocks(current: string[], lock: string[], unlock: string[]): string[] {
  const set = new Set(current);
  for (const field of lock) set.add(field);
  for (const field of unlock) set.delete(field);
  return [...set];
}

export type ProjectEdit = {
  name: string;
  country: string;
  capacityMw: string;
  contractValue: string;
  lifecycle: ProjectLifecycle;
  unlock: string[];
};

export async function updateProject(projectId: string, input: ProjectEdit): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new UserError("That project no longer exists.");
    if (!LIFECYCLE_ORDER.includes(input.lifecycle)) throw new UserError("Invalid project status.");

    const name = text(input.name, "Name", 200, true)!;
    const country = text(input.country, "Country", 100);
    const capacityMw = amount(input.capacityMw, "Capacity");
    const contractValue = amount(input.contractValue, "Contract value");

    const data: Prisma.ProjectUpdateInput = {};
    const locked: string[] = [];
    // Each field that actually changed is saved and locked against the importer.
    if (name !== project.name) {
      data.name = name;
      locked.push("name");
    }
    if (country !== project.country) {
      data.country = country;
      locked.push("country");
    }
    if (!same(project.capacityMw, capacityMw)) {
      data.capacityMw = capacityMw;
      locked.push("capacityMw");
    }
    if (!same(project.contractValue, contractValue)) {
      data.contractValue = contractValue;
      locked.push("contractValue");
    }
    if (input.lifecycle !== project.lifecycle) {
      data.lifecycle = input.lifecycle;
      locked.push("lifecycle");
    }

    const unlock = (input.unlock ?? []).filter(
      (f) => (PROJECT_LOCKABLE as readonly string[]).includes(f) && !locked.includes(f),
    );
    const lockedFields = withLocks(project.lockedFields, locked, unlock);
    if (lockedFields.join() !== project.lockedFields.join()) data.lockedFields = lockedFields;

    if (Object.keys(data).length > 0) await prisma.project.update({ where: { id: projectId }, data });
    revalidatePath("/projects", "layout");
    revalidatePath("/customers", "layout");
    revalidatePath("/phases");
    return {};
  });
}

export type CustomerEdit = { name: string; importance: CustomerImportance; unlock: string[] };

export async function updateCustomer(customerId: string, input: CustomerEdit): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new UserError("That customer no longer exists.");
    if (!IMPORTANCES.includes(input.importance)) throw new UserError("Invalid importance.");

    const name = text(input.name, "Name", 200, true)!;
    const data: Prisma.CustomerUpdateInput = {};
    const locked: string[] = [];
    if (name !== customer.name) {
      data.name = name;
      locked.push("name");
    }
    if (input.importance !== customer.importance) {
      data.importance = input.importance;
      locked.push("importance");
    }

    const unlock = (input.unlock ?? []).filter(
      (f) => (CUSTOMER_LOCKABLE as readonly string[]).includes(f) && !locked.includes(f),
    );
    const lockedFields = withLocks(customer.lockedFields, locked, unlock);
    if (lockedFields.join() !== customer.lockedFields.join()) data.lockedFields = lockedFields;

    try {
      if (Object.keys(data).length > 0) await prisma.customer.update({ where: { id: customerId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new UserError("Another customer already has that name.");
      }
      throw error;
    }
    revalidatePath("/customers", "layout");
    revalidatePath("/projects", "layout");
    return {};
  });
}

export type ContactInput = {
  // The rows being edited: one person can appear on several projects (one row each) and all
  // of them are updated together. Leave empty to add a new contact.
  ids?: string[];
  name: string;
  email: string;
  role: string;
  englishLevel: string;
};

// Editing an imported contact locks it (the importer then leaves it alone); new contacts are MANUAL.
export async function saveContact(customerId: string, input: ContactInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const name = text(input.name, "Name", 120, true)!;
    const email = text(input.email, "Email", 200);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
    const data = { name, email, role: text(input.role, "Role", 80), englishLevel: text(input.englishLevel, "English level", 40) };

    if (input.ids && input.ids.length > 0) {
      const found = await prisma.contact.count({ where: { id: { in: input.ids }, customerId } });
      if (found !== input.ids.length) throw new UserError("That contact no longer exists.");
      await prisma.contact.updateMany({ where: { id: { in: input.ids }, customerId }, data: { ...data, locked: true } });
    } else {
      if (!(await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
        throw new UserError("That customer no longer exists.");
      }
      await prisma.contact.create({ data: { ...data, customerId, source: "MANUAL", locked: true } });
    }
    revalidatePath(`/customers/${customerId}`);
    return {};
  });
}

// Only contacts added by hand can be deleted; imported ones come back from monday.com on the next
// import, so clear the POC there (or edit it here) instead.
export async function deleteContact(customerId: string, contactIds: string[]): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (!Array.isArray(contactIds) || contactIds.length === 0) throw new UserError("Nothing to delete.");
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds }, customerId } });
    if (contacts.length !== contactIds.length) throw new UserError("That contact no longer exists.");
    if (contacts.some((c) => c.source === "IMPORTED")) {
      throw new UserError("This contact comes from monday.com. Remove it there, or edit it here instead.");
    }
    await prisma.contact.deleteMany({ where: { id: { in: contactIds }, customerId } });
    revalidatePath(`/customers/${customerId}`);
    return {};
  });
}
