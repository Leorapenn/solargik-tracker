import { describe, expect, it } from "vitest";
import { isTaskOutcome, matchTasksToEmail, outcomeStatus, threadsByLink, type MatchableTask } from "./taskMatch";

const task = (over: Partial<MatchableTask> & { id: string }): MatchableTask => ({
  status: "OPEN",
  customerId: "c1",
  projectId: "p367",
  conversationIds: [],
  subjects: [],
  ...over,
});

describe("matchTasksToEmail", () => {
  it("matches the email chain a task started in, even when the subject changed", () => {
    const tasks = [task({ id: "t1", conversationIds: ["AAA"], subjects: ["367 valfabbrica initial layout"] }), task({ id: "t2", conversationIds: ["BBB"] })];
    expect(matchTasksToEmail({ conversationId: "AAA", sourceSubject: "Something else", projectId: "p367", customerId: "c1" }, tasks)).toEqual({ taskId: "t1", how: "conversation", candidateIds: ["t1"] });
  });

  it("on a long chain shared by many projects, offers only the tasks of the email's own project or customer", () => {
    const tasks = [
      task({ id: "p257", projectId: "p257", customerId: "revalue", conversationIds: ["MEET"] }),
      task({ id: "p318", projectId: "p318", customerId: "revalue", conversationIds: ["MEET"] }),
      task({ id: "general", projectId: null, customerId: "revalue", conversationIds: ["MEET"] }),
      task({ id: "p370", projectId: "p370", customerId: "iaccess", conversationIds: ["MEET"] }),
    ];
    // an email about 370 (iAccess): only 370's task, never the Revalue ones from the same meeting thread
    expect(matchTasksToEmail({ conversationId: "MEET", projectId: "p370", customerId: "iaccess" }, tasks)).toEqual({ taskId: "p370", how: "conversation", candidateIds: ["p370"] });
    // an email about 318: its task and the customer's general one, so the reviewer picks
    expect(matchTasksToEmail({ conversationId: "MEET", projectId: "p318", customerId: "revalue" }, tasks).candidateIds.sort()).toEqual(["general", "p318"]);
    // a customer but no project: that customer's tasks only
    expect(matchTasksToEmail({ conversationId: "MEET", projectId: null, customerId: "iaccess" }, tasks).candidateIds).toEqual(["p370"]);
    // a project with no task in the chain gets nothing
    expect(matchTasksToEmail({ conversationId: "MEET", projectId: "p999", customerId: "other" }, tasks)).toEqual({ taskId: null, how: null, candidateIds: [] });
    // nothing known about the email: the chain decides, as before
    expect(matchTasksToEmail({ conversationId: "MEET" }, tasks).candidateIds).toHaveLength(4);
  });

  it("falls back to the same subject (Re:/Fw: ignored) in the same project", () => {
    const tasks = [task({ id: "t1", subjects: ["367 valfabbrica initial layout"] })];
    const m = matchTasksToEmail({ conversationId: null, sourceSubject: "RE: 367 Valfabbrica Initial layout", projectId: "p367", customerId: "c1" }, tasks);
    expect(m).toEqual({ taskId: "t1", how: "subject", candidateIds: ["t1"] });
  });

  it("does not match the same subject in another project or customer", () => {
    const tasks = [task({ id: "t1", subjects: ["initial layout"] })];
    expect(matchTasksToEmail({ sourceSubject: "Initial layout", projectId: "p999", customerId: "c1" }, tasks).taskId).toBeNull();
    expect(matchTasksToEmail({ sourceSubject: "Initial layout", projectId: null, customerId: "c2" }, tasks).taskId).toBeNull();
    // a task with no project of the same customer is still a clue for a project proposal
    expect(matchTasksToEmail({ sourceSubject: "Initial layout", projectId: "p999", customerId: "c1" }, [task({ id: "t3", projectId: null, subjects: ["initial layout"] })]).taskId).toBe("t3");
  });

  it("never picks one of several: all are offered, none preselected", () => {
    const tasks = [task({ id: "t1", subjects: ["initial layout"] }), task({ id: "t2", subjects: ["initial layout"] })];
    expect(matchTasksToEmail({ sourceSubject: "Re: Initial layout", projectId: "p367", customerId: "c1" }, tasks)).toEqual({ taskId: null, how: "subject", candidateIds: ["t1", "t2"] });
    const byChain = [task({ id: "t1", conversationIds: ["A"] }), task({ id: "t2", conversationIds: ["A"] })];
    expect(matchTasksToEmail({ conversationId: "A" }, byChain)).toEqual({ taskId: null, how: "conversation", candidateIds: ["t1", "t2"] });
  });

  it("ignores resolved tasks and empty subjects", () => {
    expect(matchTasksToEmail({ conversationId: "A", sourceSubject: "x", projectId: "p367", customerId: "c1" }, [task({ id: "t1", status: "RESOLVED", conversationIds: ["A"], subjects: ["x"] })])).toEqual({ taskId: null, how: null, candidateIds: [] });
    expect(matchTasksToEmail({ sourceSubject: "Re:", projectId: "p367", customerId: "c1" }, [task({ id: "t1", subjects: [""] })]).taskId).toBeNull();
  });
});

describe("outcomes and thread lookup", () => {
  it("knows the four outcomes and the status each sets", () => {
    expect(["RESOLVED", "WAITING_CUSTOMER", "WAITING_US", "LOG"].every(isTaskOutcome)).toBe(true);
    expect(isTaskOutcome("DONE")).toBe(false);
    expect(outcomeStatus("RESOLVED")).toBe("RESOLVED");
    expect(outcomeStatus("LOG")).toBeNull();
  });

  it("collects chains and subjects per email link", () => {
    const map = threadsByLink([
      { sourceLink: "https://x/1", conversationId: "A", sourceSubject: "Re: Initial layout" },
      { sourceLink: "https://x/1", conversationId: "A", sourceSubject: "Initial layout" },
      { sourceLink: null, conversationId: "Z", sourceSubject: "ignored" },
    ]);
    expect(map.get("https://x/1")).toEqual({ conversationIds: ["A"], subjects: ["initial layout"], display: "Initial layout" });
    expect(map.size).toBe(1);
  });
});
