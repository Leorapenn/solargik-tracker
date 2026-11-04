import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { approveAsCorrespondence, createSuggestions, listSuggestions } from "./suggestions";
import { listProjectCorrespondence } from "./correspondence";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("saving a wrong status change as correspondence only", () => {
  let customerId: string;
  let projectId: string;
  const suggestionIds: string[] = [];

  const propose = async (n: number, extra: Record<string, unknown>) => {
    await createSuggestions([{ id: `${RUN}-${n}`, project: `Test Project ${RUN}`, summary: `356: mechanical BOM Rev03 approved ${n}`, source: { from: "eyal@example.com", subject: "BOM Rev03", link: `https://outlook.office365.com/owa/?ItemID=${RUN}-${n}` }, ...extra }]);
    const row = await prisma.suggestion.findUnique({ where: { externalId: `${RUN}-${n}` } });
    if (row) suggestionIds.push(row.id);
    return row!;
  };

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (suggestionIds.length) await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("keeps a status change as a correspondence note, changes nothing else, and only once", async () => {
    const row = await propose(1, { kind: "STATUS_CHANGE", item: "Mechanical BOM Release", status: "DONE" });
    // the pending card says nothing about the item's current status when the project has no such item
    expect((await listSuggestions("PENDING", 200)).find((s) => s.id === row.id)?.itemNow).toBeNull();

    expect(await approveAsCorrespondence(row.id)).toBe("Saved as correspondence only: nothing on the item changed.");
    const saved = await prisma.suggestion.findUnique({ where: { id: row.id } });
    expect(saved).toMatchObject({ kind: "CORRESPONDENCE_NOTE", status: "APPROVED", projectId, customerId });
    expect(saved?.payload).toEqual({ kind: "CORRESPONDENCE_NOTE", text: "356: mechanical BOM Rev03 approved 1" });
    const shown = await listProjectCorrespondence(projectId);
    expect(shown.map((c) => c.summary)).toContain("356: mechanical BOM Rev03 approved 1"); // the card shows the summary; the same text is not repeated

    await expect(approveAsCorrespondence(row.id)).rejects.toBeInstanceOf(UserError);
  });

  it("refuses kinds that are not a status change or an update", async () => {
    const note = await propose(2, { kind: "NOTE", text: "Just a note" });
    await expect(approveAsCorrespondence(note.id)).rejects.toBeInstanceOf(UserError);
  });
});
