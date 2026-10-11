import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { UserError } from "@/lib/errors";
import { createProject } from "./createProject";
import { approveSuggestion, createSuggestions, listSuggestions, rejectSuggestion } from "./suggestions";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("suggestions", () => {
  let customerId: string;
  let projectId: string;
  let projectName: string;
  const ids: string[] = [];

  const send = async (raw: Record<string, unknown>) => {
    const r = await createSuggestions([{ summary: "s", source: { from: "x@y.com", subject: "subj" }, ...raw }]);
    const row = await prisma.suggestion.findFirst({ where: { externalId: raw.id as string } });
    if (row) ids.push(row.id);
    return { r, row };
  };

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-Test ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    projectName = project.name;
    await prisma.milestone.create({ data: { projectId, order: 0, label: "Milestone 1 (AP)", percent: 5 } });
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { id: { in: ids } } });
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("stores valid suggestions as pending, reports bad ones, and skips a repeated id", async () => {
    const code = projectName.split("-")[0];
    const first = await createSuggestions([
      { kind: "PHASE_UPDATE", phase: "DESIGN", text: "Waiting on geotech", summary: "Design", project: code, id: `${RUN}-a` },
      { kind: "NOPE", summary: "bad" },
    ]);
    expect(first).toMatchObject({ created: 1, duplicates: 0 });
    expect(first.rejected).toHaveLength(1);
    expect(first.rejected[0].index).toBe(1);

    const row = await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-a` } });
    ids.push(row.id);
    expect(row).toMatchObject({ status: "PENDING", projectId, kind: "PHASE_UPDATE" });

    const again = await createSuggestions([{ kind: "PHASE_UPDATE", phase: "DESIGN", text: "Waiting on geotech", summary: "Design", project: code, id: `${RUN}-a` }]);
    expect(again).toMatchObject({ created: 0, duplicates: 1 });
    await expect(createSuggestions(Array.from({ length: 21 }, () => ({})))).rejects.toBeInstanceOf(UserError);
  });

  it("changes nothing until approved, then applies a phase update with today's date", async () => {
    const row = await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-a` } });
    const phase = () => prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name: "DESIGN" } } });
    expect((await phase()).statusUpdate).toBeNull();

    await approveSuggestion(row.id, { text: "Geotech report received" }); // reworded by the reviewer
    expect(await phase()).toMatchObject({ statusUpdate: "Geotech report received" });
    expect((await phase()).statusUpdateAt).not.toBeNull();
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("APPROVED");
    await expect(approveSuggestion(row.id)).rejects.toBeInstanceOf(UserError); // already handled
    expect((await listSuggestions("PENDING")).some((s) => s.id === row.id)).toBe(false);
  });

  it("needs a project when none matched, and fails clearly for an unknown item", async () => {
    const { row } = await send({ kind: "ITEM_UPDATE", item: "Nonexistent Thing", text: "x", id: `${RUN}-b`, project: "no such project" });
    expect(row?.projectId).toBeNull();
    await expect(approveSuggestion(row!.id)).rejects.toThrow("Choose which project");
    await expect(approveSuggestion(row!.id, { projectId })).rejects.toThrow(/no item called/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("PENDING"); // a failed apply stays pending
    await rejectSuggestion(row!.id);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("REJECTED");
    await expect(rejectSuggestion(row!.id)).rejects.toBeInstanceOf(UserError);
  });

  it("applies a milestone update and a new contact", async () => {
    const m = await send({ kind: "MILESTONE_UPDATE", milestone: "Milestone 1", status: "INVOICE_SENT", invoiceSentDate: "2026-10-05", invoiceLink: "https://x.sharepoint.com/inv.pdf", id: `${RUN}-c`, project: projectName });
    await approveSuggestion(m.row!.id);
    expect(await prisma.milestone.findFirstOrThrow({ where: { projectId } })).toMatchObject({ status: "INVOICE_SENT", invoiceLink: "https://x.sharepoint.com/inv.pdf" });

    const c = await send({ kind: "CONTACT", name: "Dana Levi", email: "dana@example.com", phone: "+39 06 1234 5678", id: `${RUN}-d`, project: projectName });
    await approveSuggestion(c.row!.id);
    expect(await prisma.contact.findFirstOrThrow({ where: { customerId, email: "dana@example.com" } })).toMatchObject({ name: "Dana Levi", phone: "+39 06 1234 5678", source: "MANUAL", locked: true });
    const dup = await send({ kind: "CONTACT", name: "Dana Again", email: "DANA@example.com", id: `${RUN}-e`, project: projectName });
    await expect(approveSuggestion(dup.row!.id)).rejects.toThrow(/already exists/);
  });

  it("applies a status change like a manual one (dates, history, phase) only on approval, and stores confidence and message id", async () => {
    const item = await prisma.subStage.findFirstOrThrow({ where: { phase: { projectId, name: "DESIGN" } }, orderBy: { order: "asc" } });
    const { row } = await send({
      kind: "STATUS_CHANGE", item: item.name, phase: "DESIGN", status: "in progress", id: `${RUN}-s1`, project: projectName,
      confidence: "high", source: { from: "x@y.com", subject: "subj", messageId: "MSG-S1" },
    });
    expect(row).toMatchObject({ status: "PENDING", confidence: "HIGH", sourceMessageId: "MSG-S1", projectId });
    expect((await prisma.subStage.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("NOT_STARTED"); // nothing yet

    expect(await approveSuggestion(row!.id)).toBe(`"${item.name}" set to In progress.`);
    const after = await prisma.subStage.findUniqueOrThrow({ where: { id: item.id } });
    expect(after).toMatchObject({ status: "IN_PROGRESS" });
    expect(after.startedAt).not.toBeNull();
    expect(await prisma.statusEvent.findFirst({ where: { subStageId: item.id, source: "inbox", toStatus: "IN_PROGRESS" } })).not.toBeNull();
    expect((await prisma.phase.findUniqueOrThrow({ where: { projectId_name: { projectId, name: "DESIGN" } } })).status).toBe("IN_PROGRESS");

    // the same status again changes nothing and says so
    const again = await send({ kind: "STATUS_CHANGE", item: item.name, phase: "DESIGN", status: "IN_PROGRESS", id: `${RUN}-s2`, project: projectName });
    expect(await approveSuggestion(again.row!.id)).toBe(`"${item.name}" was already In progress.`);
    expect(await prisma.statusEvent.count({ where: { subStageId: item.id, source: "inbox" } })).toBe(1);
  });

  it("refuses a status that doesn't exist, and won't guess between several matching items", async () => {
    const r = await createSuggestions([{ kind: "STATUS_CHANGE", item: "Anything", status: "Delayed", summary: "s", id: `${RUN}-s3` }]);
    expect(r).toMatchObject({ created: 0 });
    expect(r.rejected[0].error).toMatch(/status/);

    const { row } = await send({ kind: "STATUS_CHANGE", item: "Delivery", phase: "SUPPLY", status: "DONE", id: `${RUN}-s4`, project: projectName });
    await expect(approveSuggestion(row!.id)).rejects.toThrow(/Several items match/);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: row!.id } })).status).toBe("PENDING");
    expect(await prisma.subStage.count({ where: { phase: { projectId }, name: { contains: "Delivery" }, status: "DONE" } })).toBe(0);
  });

  it("approving an action item or a correspondence note only marks it reviewed, with or without a project", async () => {
    const before = await prisma.phase.findMany({ where: { projectId }, select: { id: true, status: true, statusUpdate: true }, orderBy: { id: "asc" } });

    const action = await send({ kind: "ACTION_ITEM", text: "Revalue to send the signed layout", who: "Dan", by: "end of next week", id: `${RUN}-ai` });
    expect(action.row?.projectId).toBeNull(); // no project: it would be listed as Unmatched
    expect(await approveSuggestion(action.row!.id)).toBe("Noted. It has no project, so no project page shows it.");
    expect(await prisma.suggestion.findUniqueOrThrow({ where: { id: action.row!.id } })).toMatchObject({ status: "APPROVED", projectId: null });

    const note = await send({ kind: "CORRESPONDENCE_NOTE", text: "Customer confirmed the site access dates", id: `${RUN}-cn`, project: projectName });
    expect(await approveSuggestion(note.row!.id)).toBe("Saved on the project page under Correspondence and actions.");
    expect(await prisma.suggestion.findUniqueOrThrow({ where: { id: note.row!.id } })).toMatchObject({ status: "APPROVED", projectId });

    expect(await prisma.phase.findMany({ where: { projectId }, select: { id: true, status: true, statusUpdate: true }, orderBy: { id: "asc" } })).toEqual(before);
  });
});
