import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { getImportRun, getLastImport, recordImportRun } from "./importRuns";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Runs are recorded in 2021 and the suggestions are back-dated into those windows, so these tests can't claim (or
// be confused by) suggestions that real data or other test files create today.
const at = (iso: string) => new Date(iso);

describe("import runs", () => {
  let customerId: string;
  let projectId: string;
  const runIds: string[] = [];
  const suggestionIds: string[] = [];

  const record = async (raw: unknown) => {
    const r = await recordImportRun(raw);
    runIds.push(r.id);
    return r;
  };
  const suggest = async (createdAt: Date, withProject: boolean) => {
    const s = await prisma.suggestion.create({
      data: { kind: "NOTE", payload: { kind: "NOTE", text: "x" }, summary: `s ${RUN}`, createdAt, projectId: withProject ? projectId : null },
    });
    suggestionIds.push(s.id);
    return s;
  };

  beforeAll(async () => {
    await seedSubStageTemplates(prisma);
    customerId = (await prisma.customer.create({ data: { name: `Test Customer ${RUN}` } })).id;
    projectId = (await createProject({ name: `9${Math.floor(Math.random() * 900 + 100)}-Test ${RUN}`, mondayItemId: `monday-${RUN}`, customerId })).id;
  });

  afterAll(async () => {
    await prisma.suggestion.deleteMany({ where: { id: { in: suggestionIds } } });
    await prisma.importRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.project.deleteMany({ where: { customerId } });
    await prisma.customer.delete({ where: { id: customerId } });
    await prisma.$disconnect();
  });

  it("counts proposals and unmatched itself, from the suggestions that arrived during the run", async () => {
    await suggest(at("2021-03-01T06:00:00Z"), true);
    await suggest(at("2021-03-01T06:10:00Z"), false);
    await suggest(at("2021-03-01T06:20:00Z"), false);
    // the agent looked at 40 emails; most were irrelevant and produced no suggestion, so they count nowhere else
    const run = await record({ emailsChecked: 40, ranAt: "2021-03-01T07:00:00Z" });
    expect(run).toMatchObject({ emailsChecked: 40, proposalsCreated: 3, unmatched: 2 });
  });

  it("ignores any counts the agent sends", async () => {
    await suggest(at("2021-03-02T06:00:00Z"), false);
    const run = await record({ emailsChecked: 5, proposalsCreated: 99, unmatched: 0, ranAt: "2021-03-02T07:00:00Z" });
    expect(run).toMatchObject({ proposalsCreated: 1, unmatched: 1 });
  });

  it("each run claims only what arrived after the previous one, and a later run never takes it back", async () => {
    await suggest(at("2021-03-03T06:00:00Z"), true);
    const run = await record({ emailsChecked: 3, ranAt: "2021-03-03T07:00:00Z" });
    expect(run).toMatchObject({ proposalsCreated: 1, unmatched: 0 });
    const first = await prisma.importRun.findFirstOrThrow({ where: { ranAt: at("2021-03-01T07:00:00Z"), id: { in: runIds } } });
    expect(await prisma.suggestion.count({ where: { importRunId: first.id } })).toBe(3);
  });

  it("a run with no new suggestions reports zeros", async () => {
    expect(await record({ emailsChecked: 12, ranAt: "2021-03-04T07:00:00Z" })).toMatchObject({ proposalsCreated: 0, unmatched: 0 });
  });

  it("unmatched always equals the proposals of that run that still have no project", async () => {
    const orphan = await suggest(at("2021-03-05T06:00:00Z"), false);
    await suggest(at("2021-03-05T06:05:00Z"), false);
    const run = await record({ emailsChecked: 9, ranAt: "2021-03-05T07:00:00Z" });
    expect(run).toMatchObject({ proposalsCreated: 2, unmatched: 2 });

    // a person picks a project in the review queue: the count follows
    await prisma.suggestion.update({ where: { id: orphan.id }, data: { projectId } });
    expect(await getImportRun(run.id)).toMatchObject({ proposalsCreated: 2, unmatched: 1, emailsChecked: 9 });
  });

  it("get_last_import returns the newest run, and an older report arriving late does not move it back", async () => {
    const newest = await record({ emailsChecked: 1 });
    await record({ emailsChecked: 9, ranAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() });
    const last = await getLastImport();
    expect(last?.id).toBe(newest.id);
    expect(last?.emailsChecked).toBe(1);
  });

  it("refuses bad reports and stores nothing for them", async () => {
    const before = await prisma.importRun.count();
    await expect(recordImportRun({ emailsChecked: -1 })).rejects.toBeInstanceOf(UserError);
    await expect(recordImportRun({ emailsChecked: 1, ranAt: "2999-01-01T00:00:00Z" })).rejects.toBeInstanceOf(UserError);
    expect(await prisma.importRun.count()).toBe(before);
  });
});
