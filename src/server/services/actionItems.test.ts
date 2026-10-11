import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { listActionItems, setActionDone } from "./actionItems";
import { listProjectCorrespondence } from "./correspondence";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("action items", () => {
  let customerId: string;
  let projectId: string;
  let projectName: string;
  const ids: string[] = [];

  const add = async (over: Record<string, unknown>) => {
    const s = await prisma.suggestion.create({
      data: { kind: "ACTION_ITEM", payload: { kind: "ACTION_ITEM", text: "Do it", who: "Dan", by: "Friday" }, summary: `s ${RUN}`, status: "APPROVED", reviewedAt: new Date(), projectId, customerId, ...over },
    });
    ids.push(s.id);
    return s;
  };
  const mine = async () => (await listActionItems()).filter((r) => r.summary.includes(RUN));

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-A ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    projectName = project.name;
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { id: { in: ids } } });
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("lists every approved action item with its project or customer, and leaves out everything else", async () => {
    await add({ summary: `on a project ${RUN}` });
    await add({ summary: `general ${RUN}`, projectId: null });
    await add({ summary: `nowhere ${RUN}`, projectId: null, customerId: null });
    await add({ summary: `pending ${RUN}`, status: "PENDING", reviewedAt: null });
    await add({ summary: `rejected ${RUN}`, status: "REJECTED" });
    await add({ kind: "CORRESPONDENCE_NOTE", payload: { kind: "CORRESPONDENCE_NOTE", text: "x" }, summary: `a note ${RUN}` });

    const rows = await mine();
    expect(rows.map((r) => r.summary).sort()).toEqual([`general ${RUN}`, `nowhere ${RUN}`, `on a project ${RUN}`]);
    const onProject = rows.find((r) => r.summary.startsWith("on a project"))!;
    expect(onProject).toMatchObject({ projectId, projectName, customerId, who: "Dan", by: "Friday", done: false });
    expect(rows.find((r) => r.summary.startsWith("general"))).toMatchObject({ projectId: null, customerName: `Test Customer ${RUN}` });
    expect(rows.find((r) => r.summary.startsWith("nowhere"))).toMatchObject({ projectId: null, customerId: null });
  });

  it("ticks an action item done and reopens it, and the project page list shows it", async () => {
    const [item] = await mine();
    await setActionDone(item.id, true);
    const done = (await mine()).find((r) => r.id === item.id)!;
    expect(done.done).toBe(true);
    expect(done.doneOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    if (item.projectId) expect((await listProjectCorrespondence(projectId)).find((r) => r.id === item.id)).toMatchObject({ done: true });

    await setActionDone(item.id, false);
    expect((await mine()).find((r) => r.id === item.id)).toMatchObject({ done: false, doneOn: null });
  });

  it("only an approved action item can be ticked", async () => {
    const pending = await add({ summary: `pending two ${RUN}`, status: "PENDING", reviewedAt: null });
    const note = await add({ kind: "CORRESPONDENCE_NOTE", payload: { kind: "CORRESPONDENCE_NOTE", text: "x" }, summary: `note two ${RUN}` });
    for (const id of [pending.id, note.id, "no-such-id"]) await expect(setActionDone(id, true)).rejects.toBeInstanceOf(UserError);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: pending.id } })).doneAt).toBeNull();
  });
});
