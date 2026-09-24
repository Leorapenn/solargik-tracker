import { prisma } from "@/lib/prisma";

export type CustomerResolution = { status: "resolved"; customerId: string } | { status: "unresolved" };

export async function resolveCustomerByMondayItemId(mondayItemId: string): Promise<CustomerResolution> {
  const customer = await prisma.customer.findUnique({ where: { mondayItemId } });
  return customer ? { status: "resolved", customerId: customer.id } : { status: "unresolved" };
}

export async function resolveCustomerByName(name: string): Promise<CustomerResolution> {
  const trimmed = name.trim();
  if (!trimmed) return { status: "unresolved" };

  const byName = await prisma.customer.findUnique({ where: { name: trimmed } });
  if (byName) return { status: "resolved", customerId: byName.id };

  const byAlias = await prisma.customerAlias.findUnique({ where: { alias: trimmed } });
  if (byAlias) return { status: "resolved", customerId: byAlias.customerId };

  return { status: "unresolved" };
}

/** Resolves via mondayItemId first, then falls back to name/alias lookup. */
export async function resolveCustomer(
  mondayItemId: string | undefined,
  displayName: string,
): Promise<CustomerResolution> {
  if (mondayItemId) {
    const byId = await resolveCustomerByMondayItemId(mondayItemId);
    if (byId.status === "resolved") return byId;
  }
  return resolveCustomerByName(displayName);
}
