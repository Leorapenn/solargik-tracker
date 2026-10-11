import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { listProjectCorrespondence } from "./correspondence";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("project correspondence", () => {
  let customerId: string;
  let projectId: string;
  let otherProjectId: string;

  const add = (over: Record<string, unknown>) =>
    prisma.suggestion.create({
      data: { kind: "CORRESPONDENCE_NOTE", payload: { kind: "CORRESPONDENCE_NOTE", text: "x" }, summary: `s ${RUN}`, status: "APPROVED", reviewedAt: new Date(), projectId, ...over },
    });

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-A ${RUN}`, mondayItemId: `monday-a-${RUN}`, customerId })).id;
    otherProjectId = (await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-B ${RUN}`, mondayItemId: `monday-b-${RUN}`, customerId })).id;
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { summary: { contains: RUN } } });
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("lists only this project's approved notes and action items, newest email first", async () => {
    await add({ summary: `older note ${RUN}`, sourceReceivedAt: new Date("2026-10-01T09:00:00Z") });
    await add({ kind: "ACTION_ITEM", payload: { kind: "ACTION_ITEM", text: "Send the layout", who: "Dan", by: "Friday" }, summary: `newer action ${RUN}`, sourceReceivedAt: new Date("2026-10-08T09:00:00Z") });
    await add({ kind: "NOTE", payload: { kind: "NOTE", text: "plain note" }, summary: `plain ${RUN}`, sourceReceivedAt: new Date("2026-10-05T09:00:00Z") });
    // not shown: pending, rejected, another kind, another project, no project
    await add({ summary: `pending ${RUN}`, status: "PENDING", reviewedAt: null });
    await add({ summary: `rejected ${RUN}`, status: "REJECTED" });
    await add({ kind: "STATUS_CHANGE", payload: { kind: "STATUS_CHANGE", item: "x", phase: null, status: "DONE" }, summary: `status ${RUN}` });
    await add({ summary: `other project ${RUN}`, projectId: otherProjectId });
    await add({ summary: `no project ${RUN}`, projectId: null });

    const items = await listProjectCorrespondence(projectId);
    expect(items.map((i) => i.summary)).toEqual([`newer action ${RUN}`, `plain ${RUN}`, `older note ${RUN}`]);
    expect(items[0]).toMatchObject({ kindLabel: "Action", who: "Dan", by: "Friday", date: "2026-10-08" });
    expect(items[1].kindLabel).toBe("Note");
  });

  it("is empty for a project with nothing approved", async () => {
    const onlyOther = await listProjectCorrespondence(otherProjectId);
    expect(onlyOther.map((i) => i.summary)).toEqual([`other project ${RUN}`]);
    expect(await listProjectCorrespondence("no-such-project")).toEqual([]);
  });
});
