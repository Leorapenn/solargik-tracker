import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { createSuggestions } from "./suggestions";
import { listCustomersForMatching, listItemNames, listProjectsForMatching } from "./intakeDirectory";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe("the agent's matching lists and proposal duplicates", () => {
  let customerId: string;
  let projectId: string;
  let projectName: string;
  let aliasId: string;

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    aliasId = (await prisma.customerAlias.create({ data: { alias: `Test Alias ${RUN}`, customerId } })).id;
    await prisma.contact.create({ data: { customerId, name: "Lea Test", email: `lea@${RUN}.example.com`, phone: "+39 06 1234 5678", role: "PM", source: "MANUAL" } });
    await prisma.contact.create({ data: { customerId, name: "Free Mail", email: "someone@gmail.com", source: "MANUAL" } });
    const project = await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-Test ${RUN}`, mondayItemId: `monday-${RUN}`, customerId });
    projectId = project.id;
    projectName = project.name;
    await prisma.project.update({
      where: { id: projectId },
      data: {
        contractValue: 987654.32,
        paymentBase: 123456.78,
        mondayStage: "3 Construction",
        mondayStatus: "Working on it",
        sharepointLink: `https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/${encodeURIComponent(projectName)}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { summary: { contains: RUN } } });
    if (customerId) await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customerAlias.delete({ where: { id: aliasId } });
    if (customerId) await prisma.contact.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("lists the item names by phase for status changes (template names only)", async () => {
    const names = await listItemNames();
    expect(Object.keys(names).length).toBeGreaterThanOrEqual(5);
    expect(Object.values(names).flat().length).toBeGreaterThan(20);
    expect(Object.values(names).flat().every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    expect(names.SUPPLY.some((n) => n.startsWith("Delivery"))).toBe(true);
    expect(JSON.stringify(names)).not.toContain(RUN); // nothing from any project
  });

  it("lists the customer with its name variants, business domain and contacts, and nothing else", async () => {
    const mine = (await listCustomersForMatching()).find((c) => c.id === customerId)!;
    expect(mine).toMatchObject({ name: `Test Customer ${RUN}`, aliases: [`Test Alias ${RUN}`], emailDomains: [`${RUN}.example.com`] });
    expect(mine.contacts.map((c) => c.name).sort()).toEqual(["Free Mail", "Lea Test"]);
    const text = JSON.stringify(mine);
    expect(text).not.toContain("1234 5678"); // no phone numbers
  });

  it("lists the project with number, name, other names, customer, stage and statuses, without amounts or links", async () => {
    const all = await listProjectsForMatching();
    const mine = all.find((p) => p.id === projectId)!;
    expect(mine).toMatchObject({
      name: projectName,
      number: projectName.split("-")[0],
      customer: { id: customerId, name: `Test Customer ${RUN}` },
      lifecycle: "ACTIVE",
      stage: "3 Construction",
      status: "Working on it",
    });
    expect(mine.aliases).toEqual(expect.arrayContaining([projectName.split("-")[0], `Test ${RUN}`]));
    expect(mine.phases).toHaveLength(6);
    expect(mine.phases.every((p) => p.status === "NOT_STARTED" && p.update === null)).toBe(true);
    expect(mine.pendingProposals).toEqual([]);

    const text = JSON.stringify(all);
    expect(text).not.toMatch(/987654|123456\.78|sharepoint\.com|https?:\/\//i);
  });

  it("shows the agent each phase's current update and the proposals still waiting, but not handled ones", async () => {
    await prisma.phase.update({ where: { projectId_name: { projectId, name: "DESIGN" } }, data: { statusUpdate: `Geotech report received ${RUN}`, statusUpdateAt: new Date("2026-10-06T00:00:00Z") } });
    await createSuggestions([
      { kind: "NOTE", text: "Still waiting", summary: `Waiting one ${RUN}`, project: projectName.split("-")[0], id: `${RUN}-w1` },
      { kind: "NOTE", text: "Rejected one", summary: `Rejected one ${RUN}`, project: projectName.split("-")[0], id: `${RUN}-w2` },
      { kind: "NOTE", text: "Unmatched one", summary: `Unmatched ${RUN}`, id: `${RUN}-w3` },
    ]);
    await prisma.suggestion.updateMany({ where: { externalId: `${RUN}-w2` }, data: { status: "REJECTED" } });

    const mine = (await listProjectsForMatching()).find((p) => p.id === projectId)!;
    expect(mine.phases.find((p) => p.phase === "DESIGN")?.update).toEqual({ text: `Geotech report received ${RUN}`, date: "2026-10-06" });
    expect(mine.pendingProposals).toEqual([{ kind: "NOTE", summary: `Waiting one ${RUN}` }]); // not the rejected one, nor the one with no project
  });

  it("queues a proposal sent without an id once, however often the same email is read again", async () => {
    const proposal = { kind: "NOTE", text: "Customer asked about delivery timing", summary: `Delivery question ${RUN}`, project: projectName.split("-")[0], source: { from: "dan@x.com", subject: `Delivery ${RUN}`, link: `https://outlook.office.com/mail/${RUN}` } };
    const first = await createSuggestions([proposal]);
    expect(first).toMatchObject({ created: 1, duplicates: 0 });
    expect(await createSuggestions([proposal])).toMatchObject({ created: 0, duplicates: 1 });
    // reworded summary, same email and same content: still the same proposal
    expect(await createSuggestions([{ ...proposal, summary: `Different wording ${RUN}` }])).toMatchObject({ created: 0, duplicates: 1 });
    // repeated inside one batch
    const other = { ...proposal, text: "A second, different point", summary: `Second ${RUN}` };
    expect(await createSuggestions([other, other])).toMatchObject({ created: 1, duplicates: 1 });

    const stored = await prisma.suggestion.findMany({ where: { summary: { contains: RUN }, externalId: { startsWith: "auto:" } } });
    expect(stored).toHaveLength(2);
    expect(stored.every((s) => s.status === "PENDING" && s.externalId?.startsWith("auto:"))).toBe(true);
    expect(stored.every((s) => s.projectId === projectId)).toBe(true);
  });

  it("keeps a sender's own id as the duplicate key, and a rejected proposal is not queued again", async () => {
    const withId = { kind: "NOTE", text: "Own id", summary: `Own id ${RUN}`, id: `${RUN}-own` };
    expect(await createSuggestions([withId])).toMatchObject({ created: 1 });
    expect(await createSuggestions([{ ...withId, text: "Own id, reworded" }])).toMatchObject({ created: 0, duplicates: 1 });
    const row = await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-own` } });
    await prisma.suggestion.update({ where: { id: row.id }, data: { status: "REJECTED", reviewedAt: new Date() } });
    expect(await createSuggestions([withId])).toMatchObject({ created: 0, duplicates: 1 });
  });

  it("only ever adds pending proposals: project data is unchanged", async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { phases: { select: { id: true, status: true, statusUpdate: true } } } });
    await createSuggestions([{ kind: "PHASE_UPDATE", phase: "DESIGN", text: `Design is done ${RUN}`, summary: `Phase ${RUN}`, project: projectName.split("-")[0], id: `${RUN}-phase` }]);
    const after = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, include: { phases: { select: { id: true, status: true, statusUpdate: true } } } });
    expect(after).toEqual(before);
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { externalId: `${RUN}-phase` } })).status).toBe("PENDING");
  });
});
