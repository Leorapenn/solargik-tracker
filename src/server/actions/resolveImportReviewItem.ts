"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Resolving a review item only affects future importer runs — it does not
// retroactively create the project that was skipped when the item was
// flagged. Re-run the importer afterwards to pick it up.
async function addAliasIfNew(alias: string, customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
  if (customer.name === alias) return; // already resolves via Customer.name, no alias needed
  await prisma.customerAlias.upsert({
    where: { alias },
    update: { customerId },
    create: { alias, customerId },
  });
}

export async function resolveWithExistingCustomer(reviewItemId: string, customerId: string) {
  const item = await prisma.importReviewItem.findUniqueOrThrow({ where: { id: reviewItemId } });
  await addAliasIfNew(item.rawCustomerRef, customerId);
  await prisma.importReviewItem.delete({ where: { id: reviewItemId } });
  revalidatePath("/import");
}

export async function resolveWithNewCustomer(reviewItemId: string, customerName: string) {
  const trimmed = customerName.trim();
  if (!trimmed) throw new Error("Customer name is required.");

  const item = await prisma.importReviewItem.findUniqueOrThrow({ where: { id: reviewItemId } });
  const customer = await prisma.customer.create({ data: { name: trimmed } });
  await addAliasIfNew(item.rawCustomerRef, customer.id);
  await prisma.importReviewItem.delete({ where: { id: reviewItemId } });
  revalidatePath("/import");
}

export async function dismissReviewItem(reviewItemId: string) {
  await prisma.importReviewItem.delete({ where: { id: reviewItemId } });
  revalidatePath("/import");
}
