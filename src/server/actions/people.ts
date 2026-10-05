"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Department } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { run, UserError, type ActionResult } from "@/lib/errors";
import { DEPARTMENTS } from "@/lib/departments";

function cleanName(value: string): string {
  const name = (value ?? "").trim();
  if (!name) throw new UserError("Name is required.");
  if (name.length > 100) throw new UserError("Name is too long.");
  return name;
}

function cleanEmail(value: string | null | undefined): string | null {
  const email = (value ?? "").trim();
  if (!email) return null;
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email address doesn't look right.");
  return email;
}

function duplicateAware<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new UserError("A person with that name already exists.");
    }
    throw error;
  });
}

function refresh() {
  revalidatePath("/people");
  revalidatePath("/projects", "layout");
  revalidatePath("/phases");
}

export async function createPerson(name: string, email: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await duplicateAware(() => prisma.person.create({ data: { name: cleanName(name), email: cleanEmail(email) } }));
    refresh();
    return {};
  });
}

export async function updatePerson(
  id: string,
  input: { name: string; email: string; active: boolean },
): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await duplicateAware(() =>
      prisma.person.update({
        where: { id },
        data: { name: cleanName(input.name), email: cleanEmail(input.email), active: Boolean(input.active) },
      }),
    );
    refresh();
    return {};
  });
}

// The default owner for a department's items on newly created projects. null clears it.
export async function setDepartmentOwner(department: Department, personId: string | null): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    if (!DEPARTMENTS.includes(department)) throw new UserError("Unknown department.");
    if (personId === null || personId === "") {
      await prisma.departmentOwner.deleteMany({ where: { department } });
    } else {
      const person = await prisma.person.findUnique({ where: { id: personId }, select: { active: true } });
      if (!person?.active) throw new UserError("Choose an active person.");
      await prisma.departmentOwner.upsert({
        where: { department },
        update: { personId },
        create: { department, personId },
      });
    }
    refresh();
    return {};
  });
}

// Gives every item that has no owner yet its department's default owner. Existing owners are never changed.
export async function applyDefaultOwners(): Promise<ActionResult<{ assigned: number }>> {
  await requireActionAuth();
  return run(async () => {
    const defaults = await prisma.departmentOwner.findMany({ where: { person: { active: true } } });
    let assigned = 0;
    for (const { department, personId } of defaults) {
      const result = await prisma.subStage.updateMany({ where: { department, ownerId: null }, data: { ownerId: personId } });
      assigned += result.count;
    }
    refresh();
    return { assigned };
  });
}
