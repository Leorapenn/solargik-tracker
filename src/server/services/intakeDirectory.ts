import { prisma } from "@/lib/prisma";
import { shapeCustomer, shapeProject, type CustomerView, type ProjectView } from "@/lib/intakeDirectory";

// Read-only lists for the email agent's matching (see src/lib/intakeDirectory.ts for what is and isn't included).
// Only the columns named in `select` are ever loaded.

export async function listCustomersForMatching(): Promise<CustomerView[]> {
  const rows = await prisma.customer.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      aliases: { select: { alias: true } },
      contacts: { select: { id: true, name: true, email: true, role: true } },
    },
  });
  return rows.map(shapeCustomer);
}

export async function listProjectsForMatching(): Promise<ProjectView[]> {
  const rows = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      lifecycle: true,
      mondayStage: true,
      mondayStatus: true,
      sharepointLink: true, // used only to read the folder's name (an alias); never output
      customer: { select: { id: true, name: true } },
      phases: { select: { name: true, status: true, order: true } },
    },
  });
  return rows.map(shapeProject).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
