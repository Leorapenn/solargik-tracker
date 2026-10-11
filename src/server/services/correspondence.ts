import { prisma } from "@/lib/prisma";
import { CORRESPONDENCE_KINDS, shapeAndSort, type CorrespondenceItem } from "@/lib/correspondence";

const MAX_ITEMS = 100;

const select = { id: true, kind: true, summary: true, payload: true, sourceFrom: true, sourceSubject: true, sourceLink: true, sourceReceivedAt: true, reviewedAt: true, createdAt: true } as const;

// The approved notes and action items of one project, newest first. Only approved ones: pending and rejected
// proposals stay in the Inbox.
export async function listProjectCorrespondence(projectId: string): Promise<CorrespondenceItem[]> {
  const rows = await prisma.suggestion.findMany({
    where: { projectId, status: "APPROVED", kind: { in: [...CORRESPONDENCE_KINDS] } },
    orderBy: { reviewedAt: "desc" },
    take: 300,
    select,
  });
  return shapeAndSort(rows).slice(0, MAX_ITEMS);
}

// The general ones of a customer: approved notes and action items filed on the customer itself, not on one of its
// projects (those show on the project pages).
export async function listCustomerCorrespondence(customerId: string): Promise<CorrespondenceItem[]> {
  const rows = await prisma.suggestion.findMany({
    where: { customerId, projectId: null, status: "APPROVED", kind: { in: [...CORRESPONDENCE_KINDS] } },
    orderBy: { reviewedAt: "desc" },
    take: 300,
    select,
  });
  return shapeAndSort(rows).slice(0, MAX_ITEMS);
}
