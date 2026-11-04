import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { getUpdatesInRange, toExportRows } from "./weeklyUpdates";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("getUpdatesInRange", () => {
  let customerId: string;
  let projectId: string;
  let phaseId: string;
  let itemIds: string[];

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    const project = await createProject({ name: `Test Project ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    const design = project.phases.find((p) => p.name === "DESIGN")!;
    phaseId = design.id;
    itemIds = design.subStages.map((s) => s.id);
  });

  const suggestionIds: string[] = [];

  afterAll(async () => {
    // a proposal keeps its row when its project goes (the link is cleared), so each is removed by its own id
    if (suggestionIds.length) await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    if (customerId) await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  const mine = async (from: string, to: string) => (await getUpdatesInRange({ from, to })).find((p) => p.id === projectId);

  it("lists phase and item updates dated inside the range, newest first, and nothing outside it", async () => {
    await prisma.phase.update({ where: { id: phaseId }, data: { statusUpdate: "Phase is waiting on geotech", statusUpdateAt: day("2026-10-01") } });
    await prisma.subStage.update({ where: { id: itemIds[0] }, data: { statusUpdate: "Layout sent", statusUpdateAt: day("2026-10-03") } });
    await prisma.subStage.update({ where: { id: itemIds[1] }, data: { statusUpdate: "Old news", statusUpdateAt: day("2026-09-01") } });

    const found = await mine("2026-09-27", "2026-10-03"); // both edges included
    expect(found?.entries.map((e) => [e.level, e.text, e.date])).toEqual([
      ["Item", "Layout sent", "2026-10-03"],
      ["Phase", "Phase is waiting on geotech", "2026-10-01"],
    ]);
    expect(found?.summary.manual).toBe(false);

    expect(await mine("2026-10-04", "2026-10-10")).toBeUndefined();
    expect((await mine("2026-09-01", "2026-09-01"))?.entries).toHaveLength(1);
  });

  it("includes approved email proposals by the day of the email, with the project's stage, and nothing pending, rejected or outside", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { mondayStatus: "Logistics" } });
    const make = async (n: number, extra: Record<string, unknown>) => {
      const row = await prisma.suggestion.create({
        data: { kind: "CORRESPONDENCE_NOTE", payload: { kind: "CORRESPONDENCE_NOTE", text: `Longer text ${n}` }, summary: `Email headline ${n}`, sourceSubject: `Subject ${n}`, sourceLink: `https://outlook.office.com/mail/${n}`, status: "APPROVED", projectId, sourceReceivedAt: day("2026-10-02"), reviewedAt: day("2026-10-09"), ...extra },
      });
      suggestionIds.push(row.id);
    };
    await make(1, {});
    await make(2, { sourceReceivedAt: day("2026-10-03"), kind: "STATUS_CHANGE", payload: { kind: "STATUS_CHANGE", item: "x", status: "DONE" } });
    await make(3, { status: "PENDING" });
    await make(4, { status: "REJECTED" });
    await make(5, { sourceReceivedAt: day("2026-10-20") }); // another week
    await make(6, { kind: "CONTACT", payload: { kind: "CONTACT", name: "Dana" } }); // not news for the meeting

    const found = await mine("2026-09-27", "2026-10-03");
    expect(found?.stage).toBe("Logistics");
    expect(found?.emails.map((e) => [e.label, e.summary, e.date])).toEqual([
      ["Status", "Email headline 2", "2026-10-03"],
      ["Email", "Email headline 1", "2026-10-02"],
    ]);
    expect(found?.emails[1]).toMatchObject({ subject: "Subject 1", link: "https://outlook.office.com/mail/1" });
    // the same project is found by emails alone, in the week of the third one
    expect((await mine("2026-10-18", "2026-10-24"))?.emails.map((e) => e.summary)).toEqual(["Email headline 5"]);
    // an email with no day of its own is dated by the day it was approved
    await make(7, { sourceReceivedAt: null, reviewedAt: day("2026-11-10") });
    expect((await mine("2026-11-10", "2026-11-10"))?.emails.map((e) => e.summary)).toEqual(["Email headline 7"]);
    expect(toExportRows(found ? [found] : []).filter((r) => r.level === "Email").map((r) => [r.phase, r.item, r.update])).toEqual([
      ["Logistics", "Status", "Email headline 2"],
      ["Logistics", "Email", "Email headline 1"],
    ]);
  });

  it("turns them into export rows", async () => {
    const found = await getUpdatesInRange({ from: "2026-09-27", to: "2026-10-03" });
    const rows = toExportRows(found.filter((p) => p.id === projectId)).filter((r) => r.level !== "Email"); // the typed updates (emails have their own test above)
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ level: "Item", update: "Layout sent", status: "Not started", date: "2026-10-03" });
    expect(rows[1]).toMatchObject({ level: "Phase", item: "", update: "Phase is waiting on geotech" });
  });
});
