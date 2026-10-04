"use server";

import { revalidatePath } from "next/cache";
import type { CustomerImportance } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";

const VALID: CustomerImportance[] = ["NORMAL", "SEMI_STRATEGIC", "STRATEGIC"];

export async function updateCustomerImportance(customerId: string, importance: CustomerImportance) {
  await requireActionAuth();
  if (!VALID.includes(importance)) throw new Error("Invalid importance.");
  await prisma.customer.update({ where: { id: customerId }, data: { importance } });
  revalidatePath("/customers");
}
