"use server";

import { revalidatePath } from "next/cache";
import type { CustomerImportance } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";

const VALID: CustomerImportance[] = ["NORMAL", "SEMI_STRATEGIC", "STRATEGIC"];

// Changing importance by hand locks it so a later import from monday.com doesn't overwrite it.
export async function updateCustomerImportance(customerId: string, importance: CustomerImportance) {
  await requireActionAuth();
  if (!VALID.includes(importance)) throw new Error("Invalid importance.");
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, select: { lockedFields: true } });
  await prisma.customer.update({
    where: { id: customerId },
    data: {
      importance,
      lockedFields: customer.lockedFields.includes("importance") ? undefined : [...customer.lockedFields, "importance"],
    },
  });
  revalidatePath("/customers", "layout");
}
