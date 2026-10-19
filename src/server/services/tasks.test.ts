import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { addTaskUpdate, createTask, deleteTask, listOpenTasksForCustomer, listReminders, listTasks, markContactedToday, setTaskStatus, updateTask } from "./tasks";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const today = () => toDateInputValue(todayInAppTz());
const daysFromToday = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("tasks", () => {
  let customerId: string;
  let otherCustomerId: string;
  let projectId: string;
  let otherProjectId: string;
  let personId: string;
  let inactiveId: string;

  const mine = async () => (await listTasks()).filter((t) => t.customerId === customerId);

  beforeAll(async () => {
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    otherCustomerId = (await prisma.customer.create({ data: { name: `Test Other ${RUN}` } })).id;
    projectId = (await prisma.project.create({ data: { name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId } })).id;
    otherProjectId = (await prisma.project.create({ data: { name: `Test Other Project ${RUN}`, mondayItemId: `monday-other-${RUN}`, customerId: otherCustomerId } })).id;
    personId = (await prisma.person.create({ data: { name: `Test Person ${RUN}` } })).id;
    inactiveId = (await prisma.person.create({ data: { name: `Test Inactive ${RUN}`, active: false } })).id;
  });

  afterAll(async () => {
    // every cleanup is scoped by an id that exists; an undefined id would otherwise match every row
    if (customerId) await prisma.task.deleteMany({ where: { customerId } });
    if (otherCustomerId) await prisma.task.deleteMany({ where: { customerId: otherCustomerId } });
    if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
    if (otherProjectId) await prisma.project.deleteMany({ where: { id: otherProjectId } });
    if (personId) await prisma.person.deleteMany({ where: { id: { in: [personId, inactiveId].filter(Boolean) } } });
    if (customerId) await prisma.customer.deleteMany({ where: { id: customerId } });
    if (otherCustomerId) await prisma.customer.deleteMany({ where: { id: otherCustomerId } });
    await prisma.$disconnect();
  });

  it("creates a task for a customer and one of its projects, with a first log entry", async () => {
    const id = await createTask({ customerId, projectId, topic: "  Disputing   the charges ", details: "They say the invoice is wrong", status: "WAITING_CUSTOMER", ownerId: personId, lastContactAt: daysFromToday(-3), lastContactNote: "They replied", nextFollowUp: daysFromToday(2) });
    const task = (await mine()).find((t) => t.id === id)!;
    expect(task).toMatchObject({ topic: "Disputing the charges", projectId, projectName: `Test Project ${RUN}`, status: "WAITING_CUSTOMER", ownerName: `Test Person ${RUN}`, lastContactNote: "They replied", nextFollowUp: daysFromToday(2) });
    expect(task.updates.map((u) => u.text)).toEqual(["Task created"]);
    expect(task.createdOn).toBe(today());
  });

  it("refuses a project of another customer, an inactive owner, a missing customer and bad input", async () => {
    await expect(createTask({ customerId, projectId: otherProjectId, topic: "x" })).rejects.toBeInstanceOf(UserError);
    await expect(createTask({ customerId, topic: "x", ownerId: inactiveId })).rejects.toBeInstanceOf(UserError);
    await expect(createTask({ customerId: "does-not-exist", topic: "x" })).rejects.toBeInstanceOf(UserError);
    await expect(createTask({ customerId, topic: "" })).rejects.toBeInstanceOf(UserError);
    await expect(createTask({ customerId, topic: "x", status: "WHATEVER" })).rejects.toBeInstanceOf(UserError);
  });

  it("logs entries, and a correspondence becomes the last correspondence (only if it is the newest)", async () => {
    const id = await createTask({ customerId, topic: "Log test", lastContactAt: daysFromToday(-5), nextFollowUp: daysFromToday(-1) });
    await addTaskUpdate(id, { text: "They proposed a call on Thursday", date: daysFromToday(-1), nextFollowUp: daysFromToday(3) });
    let task = (await mine()).find((t) => t.id === id)!;
    expect(task.lastContactAt).toBe(daysFromToday(-1));
    expect(task.lastContactNote).toBe("They proposed a call on Thursday");
    expect(task.nextFollowUp).toBe(daysFromToday(3));
    // the log is ordered by each entry's own date, so this entry (yesterday) sits below "Task created" (today)
    expect(task.updates.map((u) => u.text)).toEqual(["Task created", "They proposed a call on Thursday"]);

    // an older entry is logged but does not move the last correspondence back
    await addTaskUpdate(id, { text: "Earlier phone call", date: daysFromToday(-4) });
    task = (await mine()).find((t) => t.id === id)!;
    expect(task.lastContactAt).toBe(daysFromToday(-1));
    expect(task.updates.map((u) => u.text)).toContain("Earlier phone call");

    // an internal note that is not correspondence leaves it alone
    await addTaskUpdate(id, { text: "Discussed internally with Yoni", contact: false });
    task = (await mine()).find((t) => t.id === id)!;
    expect(task.lastContactAt).toBe(daysFromToday(-1));

    await expect(addTaskUpdate(id, { text: "   " })).rejects.toBeInstanceOf(UserError);
    await markContactedToday(id);
    task = (await mine()).find((t) => t.id === id)!;
    expect(task.lastContactAt).toBe(today());
  });

  it("changes status with a log line, resolves (clearing the reminder) and reopens", async () => {
    const id = await createTask({ customerId, topic: "Status test", nextFollowUp: daysFromToday(1) });
    await setTaskStatus(id, "CALL_SCHEDULED");
    let task = (await mine()).find((t) => t.id === id)!;
    expect(task.status).toBe("CALL_SCHEDULED");
    expect(task.updates[0].text).toBe("Status changed to Call scheduled");

    await setTaskStatus(id, "RESOLVED");
    task = (await mine()).find((t) => t.id === id)!;
    expect(task).toMatchObject({ status: "RESOLVED", resolvedAt: today(), nextFollowUp: null });

    await setTaskStatus(id, "OPEN");
    task = (await mine()).find((t) => t.id === id)!;
    expect(task).toMatchObject({ status: "OPEN", resolvedAt: null });
    await expect(setTaskStatus(id, "NOPE")).rejects.toBeInstanceOf(UserError);
  });

  it("edits a task", async () => {
    const id = await createTask({ customerId, topic: "Edit test" });
    await updateTask(id, { customerId, projectId, topic: "Edited topic", status: "WAITING_US", ownerId: personId, nextFollowUp: daysFromToday(5) });
    const task = (await mine()).find((t) => t.id === id)!;
    expect(task).toMatchObject({ topic: "Edited topic", projectId, status: "WAITING_US", nextFollowUp: daysFromToday(5) });
    expect(task.updates[0].text).toBe("Status changed to Waiting on us");
    await expect(updateTask("does-not-exist", { customerId, topic: "x" })).rejects.toBeInstanceOf(UserError);
  });

  it("lists reminders: overdue, due today and quiet tasks, but never resolved or scheduled-for-later ones", async () => {
    const overdue = await createTask({ customerId, topic: "R overdue", nextFollowUp: daysFromToday(-2) });
    const dueToday = await createTask({ customerId, topic: "R today", nextFollowUp: today() });
    const quiet = await createTask({ customerId, topic: "R quiet", lastContactAt: daysFromToday(-9) });
    const later = await createTask({ customerId, topic: "R later", lastContactAt: daysFromToday(-30), nextFollowUp: daysFromToday(4) });
    const fresh = await createTask({ customerId, topic: "R fresh", lastContactAt: daysFromToday(-1) });
    const resolved = await createTask({ customerId, topic: "R resolved", nextFollowUp: daysFromToday(-5) });
    await setTaskStatus(resolved, "RESOLVED");

    const reminders = (await listReminders()).filter((r) => r.customerId === customerId);
    const byId = new Map(reminders.map((r) => [r.id, r.attention.level]));
    expect(byId.get(overdue)).toBe("overdue");
    expect(byId.get(dueToday)).toBe("today");
    expect(byId.get(quiet)).toBe("quiet");
    expect(byId.has(later)).toBe(false);
    expect(byId.has(fresh)).toBe(false);
    expect(byId.has(resolved)).toBe(false);
    // most urgent first
    const order = reminders.map((r) => r.id).filter((id) => [overdue, dueToday, quiet].includes(id));
    expect(order).toEqual([overdue, dueToday, quiet]);

    const open = await listOpenTasksForCustomer(customerId);
    expect(open.some((t) => t.id === resolved)).toBe(false);
    expect(open.some((t) => t.id === later)).toBe(true);
  });

  it("deletes a task with its log", async () => {
    const id = await createTask({ customerId, topic: "Delete me" });
    await deleteTask(id);
    expect((await mine()).some((t) => t.id === id)).toBe(false);
    expect(await prisma.taskUpdate.count({ where: { taskId: id } })).toBe(0);
    await expect(deleteTask(id)).rejects.toBeInstanceOf(UserError);
  });

  it("keeps the task but drops the project link when the project is deleted", async () => {
    const tempProject = await prisma.project.create({ data: { name: `Test Temp ${RUN}`, mondayItemId: `monday-temp-${RUN}`, customerId } });
    const id = await createTask({ customerId, projectId: tempProject.id, topic: "Project goes away" });
    await prisma.project.deleteMany({ where: { id: tempProject.id } });
    const task = (await mine()).find((t) => t.id === id)!;
    expect(task.projectId).toBeNull();
    expect(task.topic).toBe("Project goes away");
  });
});
