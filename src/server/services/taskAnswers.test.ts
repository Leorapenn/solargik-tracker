import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { matchTasksToEmail } from "@/lib/taskMatch";
import { approveSuggestion, approveWithTask, createSuggestions } from "./suggestions";
import { createTask, listTasks, setTaskStatus } from "./tasks";
import { listOpenTasksForCards, openTasksByOwner } from "./taskMatch";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const LINK = `https://outlook.office365.com/owa/?ItemID=${RUN}-first`;
const CHAIN = `AAQk-${RUN}`;

describe("an email that answers an open task", () => {
  let customerId: string;
  let projectId: string;
  let taskId: string;
  let otherTaskId: string;
  const suggestionIds: string[] = [];

  const view = async (id: string) => (await listTasks()).find((t) => t.id === id)!;
  const proposal = (n: number, extra: Record<string, unknown>) => ({
    id: `${RUN}-${n}`,
    summary: `Answer ${n}`,
    customer: `Test Customer ${RUN}`,
    source: { from: "yechielbz@solargik.com", subject: "Re: 367 Valfabbrica Initial layout", receivedAt: "2026-10-28T13:05:00Z", link: `https://outlook.office365.com/owa/?ItemID=${RUN}-${n}`, conversationId: CHAIN },
    ...extra,
  });
  const created = async (n: number) => {
    const row = await prisma.suggestion.findUnique({ where: { externalId: `${RUN}-${n}` } });
    if (row) suggestionIds.push(row.id);
    return row;
  };

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `367-Test ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
    // the email that created the first task: an approved proposal with the same link as the task
    const origin = await prisma.suggestion.create({
      data: { kind: "ACTION_ITEM", payload: { kind: "ACTION_ITEM", text: "x", who: null, by: null }, summary: `Origin ${RUN}`, status: "APPROVED", projectId, customerId, sourceLink: LINK, sourceSubject: "367 Valfabbrica Initial layout", conversationId: CHAIN, externalId: `${RUN}-origin` },
    });
    suggestionIds.push(origin.id);
    taskId = await createTask({ customerId, projectId, topic: `Greenergy asks for the MC panels ${RUN}`, sourceLink: LINK, lastContactAt: "2026-10-27" });
    otherTaskId = await createTask({ customerId, projectId, topic: `A different matter ${RUN}` });
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (suggestionIds.length) await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    if (customerId) await prisma.task.deleteMany({ where: { customerId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("knows which email chain a task started in, for the agent's list and for the Inbox cards", async () => {
    const { byProject, byCustomer } = await openTasksByOwner();
    const listed = (byProject.get(projectId) ?? []).find((t) => t.id === taskId)!;
    expect(listed).toMatchObject({ topic: `Greenergy asks for the MC panels ${RUN}`, status: "OPEN", conversationIds: [CHAIN], subjectText: "367 Valfabbrica Initial layout", lastContactAt: "2026-10-27" });
    expect(byCustomer.get(customerId)).toBeUndefined(); // both tasks have a project
    const cards = (await listOpenTasksForCards()).filter((t) => t.customerId === customerId);
    expect(cards.map((t) => t.id).sort()).toEqual([taskId, otherTaskId].sort());
    // a reply in that chain (even with a different subject) points at the task, and not at the other one
    const match = matchTasksToEmail({ conversationId: CHAIN, sourceSubject: "Whatever", projectId, customerId }, cards);
    expect(match).toEqual({ taskId, how: "conversation", candidateIds: [taskId] });
    // the same subject without a conversation id is found too
    expect(matchTasksToEmail({ sourceSubject: "RE: 367 valfabbrica initial layout", projectId, customerId }, cards).taskId).toBe(taskId);
  });

  it("refuses a task update for a task that does not exist or is already resolved, and keeps the task's project and customer", async () => {
    const result = await createSuggestions([
      proposal(1, { kind: "TASK_UPDATE", taskId: "does-not-exist-123", text: "x" }),
      proposal(2, { kind: "TASK_UPDATE", taskId, text: "Yechiel answered: 2 MCs, an AC feed per MC, no PDUs for SPT.", outcome: "RESOLVED", project: "somewhere else" }),
    ]);
    expect(result.created).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]).toMatchObject({ index: 0 });
    expect(result.rejected[0].error).toMatch(/no task with id/);
    const row = await created(2);
    expect(row).toMatchObject({ kind: "TASK_UPDATE", status: "PENDING", projectId, customerId });

    const done = await createTask({ customerId, topic: `Already done ${RUN}` });
    await setTaskStatus(done, "RESOLVED");
    const again = await createSuggestions([proposal(3, { kind: "TASK_UPDATE", taskId: done, text: "x" })]);
    expect(again.rejected[0].error).toMatch(/already resolved/);
    expect(await created(3)).toBeNull();
  });

  it("approving the update logs it on the day of the email, counts as the last correspondence and resolves the task", async () => {
    const row = (await created(2))!;
    const note = await approveSuggestion(row.id, {});
    expect(note).toMatch(/^Task resolved: /);
    const task = await view(taskId);
    expect(task.status).toBe("RESOLVED");
    expect(task.nextFollowUp).toBeNull();
    expect(task.lastContactAt).toBe("2026-10-28");
    expect(task.updates.map((u) => u.text)).toEqual(expect.arrayContaining(["Yechiel answered: 2 MCs, an AC feed per MC, no PDUs for SPT.", "Status changed to Resolved"]));
    expect(task.updates.find((u) => u.text.startsWith("Yechiel answered"))!.date).toBe("2026-10-28");
    const after = await prisma.suggestion.findUnique({ where: { id: row.id } });
    expect(after).toMatchObject({ status: "APPROVED", resultNote: note });
    // a second approval changes nothing and says so
    await expect(approveSuggestion(row.id, {})).rejects.toBeInstanceOf(UserError);
    expect((await view(taskId)).updates.filter((u) => u.text.startsWith("Yechiel answered"))).toHaveLength(1);
  });

  it("lets a person approve a plain note as the answer to a picked task, with the outcome they choose", async () => {
    await createSuggestions([proposal(4, { kind: "CORRESPONDENCE_NOTE", text: "Customer says they will send the signed layout by Friday." })]);
    const row = (await created(4))!;
    const note = await approveWithTask(row.id, { taskId: otherTaskId, outcome: "WAITING_CUSTOMER" });
    expect(note).toMatch(/^Task updated: /);
    const task = await view(otherTaskId);
    expect(task.status).toBe("WAITING_CUSTOMER");
    expect(task.lastContactAt).toBe("2026-10-28");
    expect(task.updates.map((u) => u.text)).toContain("Customer says they will send the signed layout by Friday.");
    expect(await prisma.suggestion.findUnique({ where: { id: row.id }, select: { status: true, projectId: true } })).toEqual({ status: "APPROVED", projectId });
  });

  it("refuses what it should: a resolved task, an unknown outcome, no task, and kinds that are not notes", async () => {
    await createSuggestions([proposal(5, { kind: "NOTE", text: "Another reply." }), proposal(6, { kind: "ACTION_ITEM", text: "Send the layout." })]);
    const note = (await created(5))!;
    const action = (await created(6))!;
    await expect(approveWithTask(note.id, { taskId: taskId, outcome: "LOG" })).rejects.toBeInstanceOf(UserError); // resolved above
    await expect(approveWithTask(note.id, { taskId: otherTaskId, outcome: "DONE" })).rejects.toBeInstanceOf(UserError);
    await expect(approveWithTask(note.id, { outcome: "LOG" })).rejects.toBeInstanceOf(UserError);
    await expect(approveWithTask(action.id, { taskId: otherTaskId, outcome: "LOG" })).rejects.toBeInstanceOf(UserError);
    // none of those approved anything
    expect((await prisma.suggestion.findMany({ where: { id: { in: [note.id, action.id] } }, select: { status: true } })).map((r) => r.status)).toEqual(["PENDING", "PENDING"]);
    expect((await view(otherTaskId)).status).toBe("WAITING_CUSTOMER");
  });
});
