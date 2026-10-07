"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActionAuth } from "@/lib/auth";
import { isCustomerType } from "@/lib/customerType";
import { run, UserError, type ActionResult } from "@/lib/errors";

// Sets (empty clears) the type of a customer: EPC, developer, investor... Never overwritten by the importer.
export async function setCustomerType(customerId: string, value: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    const type = value.trim();
    if (type && !isCustomerType(type)) throw new UserError("That customer type doesn't exist.");
    const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!exists) throw new UserError("That customer no longer exists.");
    await prisma.customer.update({ where: { id: customerId }, data: { customerType: type || null } });
    revalidatePath("/customers", "layout");
    return {};
  });
}
