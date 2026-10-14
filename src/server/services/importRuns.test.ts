import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { UserError } from "@/lib/errors";
import { seedSubStageTemplates } from "../../../prisma/seedData";
import { createProject } from "./createProject";
import { getImportRun, getLastImport, recordImportRun } from "./importRuns";

const RUN = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// The suggestions below are back-dated to 2021 and each run is recorded with a `claimUntil` in that window, so these
// tests can't claim (or be confused by) suggestions that real data or other test files create today.
const at = (iso: string) => new Date(iso);
const NOTHING = at("2000-01-01T00:00:00Z"); // claims no suggestion at all

describe("import runs", () => {
  let customerId: string;
  let projectId: string;
  const runIds: string[] = [];
  const suggestionIds: string[] = [];

  const record = async (raw: unknown, claimUntil?: Date) => {
    const r = await recordImportRun(raw, claimUntil);
    runIds.push(r.id);
    return r;
  };
  const suggest = async (createdAt: Date, withProject: boolean, sourceFrom?: string) => {
    const s = await prisma.suggestion.create({
      data: { kind: "NOTE", payload: { kind: "NOTE", text: "x" }, summary: `s ${RUN}`, createdAt, projectId: withProject ? projectId : null, ...(sourceFrom ? { sourceFrom } : {}) },
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
    const run = await record({ emailsChecked: 40, ranAt: "2021-03-01T06:00:00Z" }, at("2021-03-01T07:00:00Z"));
    expect(run).toMatchObject({ emailsChecked: 40, proposalsCreated: 3, unmatched: 2 });
  });

  it("credits proposals by when the run is recorded, whatever ranAt says: ranAt is when it STARTED", async () => {
    // the run started at 06:00, but its proposals were created at 06:30, after the start
    await suggest(at("2021-03-06T06:30:00Z"), false);
    const run = await record({ emailsChecked: 8, ranAt: "2021-03-06T06:00:00Z" }, at("2021-03-06T07:00:00Z"));
    expect(run).toMatchObject({ proposalsCreated: 1, unmatched: 1 });
    expect(run.ranAt).toBe("2021-03-06T06:00:00.000Z");
  });

  it("ignores any counts the agent sends", async () => {
    await suggest(at("2021-03-02T06:00:00Z"), false);
    const run = await record({ emailsChecked: 5, proposalsCreated: 99, unmatched: 0, ranAt: "2021-03-02T06:00:00Z" }, at("2021-03-02T07:00:00Z"));
    expect(run).toMatchObject({ proposalsCreated: 1, unmatched: 1 });
  });

  it("each proposal belongs to one run: an earlier run keeps its own and a later run never takes them", async () => {
    await suggest(at("2021-03-03T06:00:00Z"), true);
    const run = await record({ emailsChecked: 3, ranAt: "2021-03-03T06:00:00Z" }, at("2021-03-03T07:00:00Z"));
    expect(run).toMatchObject({ proposalsCreated: 1, unmatched: 0 });
    const first = await prisma.importRun.findFirstOrThrow({ where: { ranAt: at("2021-03-01T06:00:00Z"), id: { in: runIds } } });
    expect(await prisma.suggestion.count({ where: { importRunId: first.id } })).toBe(3);
  });

  it("never credits a proposal put in by hand to a run, and still credits email ones with or without a sender", async () => {
    const byHand = await suggest(at("2021-03-07T06:00:00Z"), false, "Manual: change order records");
    const fromEmail = await suggest(at("2021-03-07T06:05:00Z"), false, "someone@example.com");
    const noSource = await suggest(at("2021-03-07T06:10:00Z"), true);
    // an address that merely starts with the word is not "manual"
    const lookalike = await suggest(at("2021-03-07T06:15:00Z"), true, "manual@example.com");
    const run = await record({ emailsChecked: 4, ranAt: "2021-03-07T06:00:00Z" }, at("2021-03-07T07:00:00Z"));
    expect(run).toMatchObject({ proposalsCreated: 3, unmatched: 1 });
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: byHand.id } })).importRunId).toBeNull();
    for (const s of [fromEmail, noSource, lookalike]) expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: s.id } })).importRunId).toBe(run.id);
    // and a later run does not pick the hand-made one up either
    const later = await record({ emailsChecked: 0, ranAt: "2021-03-07T08:00:00Z" }, at("2021-03-07T09:00:00Z"));
    expect(later).toMatchObject({ proposalsCreated: 0 });
    expect((await prisma.suggestion.findUniqueOrThrow({ where: { id: byHand.id } })).importRunId).toBeNull();
  });

  it("a run with no new suggestions reports zeros", async () => {
    expect(await record({ emailsChecked: 12, ranAt: "2021-03-04T07:00:00Z" }, at("2021-03-04T07:00:00Z"))).toMatchObject({ proposalsCreated: 0, unmatched: 0 });
  });

  it("unmatched always equals the proposals of that run that still have no project", async () => {
    const orphan = await suggest(at("2021-03-05T06:00:00Z"), false);
    await suggest(at("2021-03-05T06:05:00Z"), false);
    const run = await record({ emailsChecked: 9, ranAt: "2021-03-05T06:00:00Z" }, at("2021-03-05T07:00:00Z"));
    expect(run).toMatchObject({ proposalsCreated: 2, unmatched: 2 });

    // a person picks a project in the review queue: the count follows
    await prisma.suggestion.update({ where: { id: orphan.id }, data: { projectId } });
    expect(await getImportRun(run.id)).toMatchObject({ proposalsCreated: 2, unmatched: 1, emailsChecked: 9 });
  });

  it("get_last_import returns the newest start time, and an older report arriving late does not move it back", async () => {
    const newest = await record({ emailsChecked: 1 }, NOTHING);
    await record({ emailsChecked: 9, ranAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString() }, NOTHING);
    const last = await getLastImport();
    expect(last?.id).toBe(newest.id);
    expect(last?.emailsChecked).toBe(1);
  });

  it("refuses bad reports and stores nothing for them", async () => {
    const before = await prisma.importRun.count();
    await expect(recordImportRun({ emailsChecked: -1 }, NOTHING)).rejects.toBeInstanceOf(UserError);
    await expect(recordImportRun({ emailsChecked: 1, ranAt: "2999-01-01T00:00:00Z" }, NOTHING)).rejects.toBeInstanceOf(UserError);
    expect(await prisma.importRun.count()).toBe(before);
  });
});
