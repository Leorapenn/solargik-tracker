import { describe, expect, it } from "vitest";
import {
  MAX_DETAILS,
  MAX_TOPIC,
  STALE_DAYS,
  TASK_STATUSES,
  agoText,
  cleanTask,
  cleanTaskUpdate,
  compareForSort,
  compareTasks,
  daysBetween,
  matchesFilter,
  parseTaskFilter,
  parseTaskSort,
  TASK_PRIORITIES,
  TASK_SORTS,
  isTaskPriority,
  taskAttention,
  taskPriorityChoice,
  taskPriorityRank,
  taskPrefillFromSuggestion,
  matchOwner,
  taskFromActionItem,
  type TaskTimes,
} from "./tasks";

const TODAY = "2026-10-19";
const t = (over: Partial<TaskTimes> = {}): TaskTimes => ({ status: "OPEN", nextFollowUp: null, lastContactAt: "2026-10-18", createdOn: "2026-10-10", ...over });

describe("days and 'ago' text", () => {
  it("counts calendar days and says them plainly", () => {
    expect(daysBetween("2026-10-12", TODAY)).toBe(7);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(agoText("2026-10-19", TODAY)).toBe("today");
    expect(agoText("2026-10-18", TODAY)).toBe("yesterday");
    expect(agoText("2026-10-14", TODAY)).toBe("5 days ago");
    expect(agoText("2026-10-20", TODAY)).toBe("tomorrow");
    expect(agoText("2026-10-25", TODAY)).toBe("in 6 days");
  });
});

describe("taskAttention (the reminders)", () => {
  it("is overdue once the follow-up date has passed, due today on the day", () => {
    expect(taskAttention(t({ nextFollowUp: "2026-10-16" }), TODAY)).toEqual({ level: "overdue", days: 3, text: "Follow-up was due 3 days ago" });
    expect(taskAttention(t({ nextFollowUp: "2026-10-18" }), TODAY)).toEqual({ level: "overdue", days: 1, text: "Follow-up was due yesterday" });
    expect(taskAttention(t({ nextFollowUp: TODAY }), TODAY)).toEqual({ level: "today", days: 0, text: "Follow-up due today" });
  });
  it("needs nothing while a follow-up is scheduled for later, however long ago the last contact was", () => {
    expect(taskAttention(t({ nextFollowUp: "2026-10-22", lastContactAt: "2026-09-01" }), TODAY)).toBeNull();
  });
  it("flags a task as quiet after 7 days without contact when no follow-up date is set", () => {
    expect(STALE_DAYS).toBe(7);
    expect(taskAttention(t({ lastContactAt: "2026-10-12" }), TODAY)).toEqual({ level: "quiet", days: 7, text: "No contact for 7 days" });
    expect(taskAttention(t({ lastContactAt: "2026-10-13" }), TODAY)).toBeNull(); // 6 days
    // never contacted: counted from the day it was created
    expect(taskAttention(t({ lastContactAt: null, createdOn: "2026-10-01" }), TODAY)).toMatchObject({ level: "quiet", days: 18 });
    expect(taskAttention(t({ lastContactAt: null, createdOn: "2026-10-18" }), TODAY)).toBeNull();
  });
  it("never flags a resolved task", () => {
    expect(taskAttention(t({ status: "RESOLVED", nextFollowUp: "2026-01-01" }), TODAY)).toBeNull();
  });
});

describe("compareTasks (most urgent first)", () => {
  it("orders overdue, due today, quiet, then the rest, and resolved last", () => {
    const list = [
      { id: "resolved", ...t({ status: "RESOLVED", nextFollowUp: "2026-01-01" }) },
      { id: "calm-later", ...t({ nextFollowUp: "2026-10-30" }) },
      { id: "quiet-10", ...t({ lastContactAt: "2026-10-09" }) },
      { id: "today", ...t({ nextFollowUp: TODAY }) },
      { id: "overdue-1", ...t({ nextFollowUp: "2026-10-18" }) },
      { id: "overdue-5", ...t({ nextFollowUp: "2026-10-14" }) },
      { id: "quiet-8", ...t({ lastContactAt: "2026-10-11" }) },
      { id: "calm-soon", ...t({ nextFollowUp: "2026-10-21" }) },
    ];
    const sorted = [...list].sort((a, b) => compareTasks(a, b, TODAY)).map((x) => x.id);
    expect(sorted).toEqual(["overdue-5", "overdue-1", "today", "quiet-10", "quiet-8", "calm-soon", "calm-later", "resolved"]);
  });
});

describe("filters", () => {
  it("open = not resolved; needs attention = overdue, due today or quiet", () => {
    expect(parseTaskFilter("nope")).toBe("open");
    expect(parseTaskFilter("resolved")).toBe("resolved");
    expect(matchesFilter(t({ status: "RESOLVED" }), "open", TODAY)).toBe(false);
    expect(matchesFilter(t({ status: "RESOLVED" }), "resolved", TODAY)).toBe(true);
    expect(matchesFilter(t(), "open", TODAY)).toBe(true);
    expect(matchesFilter(t(), "attention", TODAY)).toBe(false);
    expect(matchesFilter(t({ nextFollowUp: TODAY }), "attention", TODAY)).toBe(true);
    expect(matchesFilter(t({ status: "RESOLVED" }), "all", TODAY)).toBe(true);
  });
});

describe("cleanTask", () => {
  const base = { customerId: "c1", topic: "  Disputing   the charges ", status: "WAITING_CUSTOMER" };
  it("trims, collapses spaces and keeps what was typed", () => {
    const r = cleanTask({ ...base, projectId: "p1", details: "Line 1\r\nLine 2 ", ownerId: "o1", lastContactAt: "2026-10-12", lastContactNote: " They replied ", nextFollowUp: "2026-10-22" });
    expect(r).toEqual({
      ok: true,
      value: { customerId: "c1", projectId: "p1", topic: "Disputing the charges", details: "Line 1\nLine 2", status: "WAITING_CUSTOMER", priority: "MEDIUM", ownerId: "o1", lastContactAt: "2026-10-12", lastContactNote: "They replied", nextFollowUp: "2026-10-22", sourceLink: null },
    });
  });
  it("treats empty optional fields as none and defaults the status to Open", () => {
    expect(cleanTask({ customerId: "c1", topic: "x", projectId: "", ownerId: "", details: "", lastContactAt: "", nextFollowUp: "" })).toMatchObject({
      ok: true,
      value: { projectId: null, ownerId: null, details: null, lastContactAt: null, nextFollowUp: null, status: "OPEN" },
    });
  });
  it("refuses a missing customer or topic, a bad status, bad dates and over-long text", () => {
    expect(cleanTask({ topic: "x" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "   " }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x".repeat(MAX_TOPIC + 1) }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", details: "y".repeat(MAX_DETAILS + 1) }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", status: "DONE" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", nextFollowUp: "2026-02-31" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", lastContactAt: "yesterday" }).ok).toBe(false);
  });
  it("has the five statuses", () => {
    expect(TASK_STATUSES.map((s) => s.value)).toEqual(["OPEN", "WAITING_CUSTOMER", "WAITING_US", "CALL_SCHEDULED", "RESOLVED"]);
  });
});

describe("the link to the email a task was created from", () => {
  it("accepts a web link, treats empty as none, and refuses anything else", () => {
    expect(cleanTask({ customerId: "c1", topic: "x", sourceLink: " https://outlook.office365.com/owa/?ItemID=abc " })).toMatchObject({ ok: true, value: { sourceLink: "https://outlook.office365.com/owa/?ItemID=abc" } });
    expect(cleanTask({ customerId: "c1", topic: "x", sourceLink: "" })).toMatchObject({ ok: true, value: { sourceLink: null } });
    expect(cleanTask({ customerId: "c1", topic: "x" })).toMatchObject({ ok: true, value: { sourceLink: null } });
    expect(cleanTask({ customerId: "c1", topic: "x", sourceLink: "javascript:alert(1)" }).ok).toBe(false);
    expect(cleanTask({ customerId: "c1", topic: "x", sourceLink: "not a link" }).ok).toBe(false);
  });
});

describe("taskPrefillFromSuggestion (the Create task button on an Inbox proposal)", () => {
  const s = {
    summary: 'Create change order "Redesign for slopes", EUR 6250, from the change order document',
    kindText: "Change order",
    sourceFrom: "Hadassa Gabay",
    sourceSubject: "RE: 333 Vascigliano",
    sourceReceivedAt: "2026-10-12T08:30:00.000Z",
    sourceLink: "https://outlook.office365.com/owa/?ItemID=abc",
  };
  it("fills the customer, project, topic, the day of the email and the link, but never the email text", () => {
    const p = taskPrefillFromSuggestion(s, "cust1", "proj1");
    expect(p).toMatchObject({
      customerId: "cust1",
      projectId: "proj1",
      topic: s.summary,
      lastContactAt: "2026-10-12",
      lastContactNote: "Email from Hadassa Gabay “RE: 333 Vascigliano”",
      sourceLink: s.sourceLink,
    });
    expect(p.details).toBe("Created from an Inbox proposal (Change order). Email from Hadassa Gabay “RE: 333 Vascigliano”.");
    // what it fills in must be a valid task as it stands
    expect(cleanTask({ ...p, status: "OPEN" }).ok).toBe(true);
  });
  it("copes with a proposal that has no source details, no date and a very long summary", () => {
    const p = taskPrefillFromSuggestion({ summary: "x".repeat(300), kindText: "Note", sourceFrom: null, sourceSubject: null, sourceReceivedAt: null, sourceLink: null }, "c", "");
    expect(p.topic!.length).toBeLessThanOrEqual(MAX_TOPIC);
    expect(p.topic!.endsWith("…")).toBe(true);
    expect(p).toMatchObject({ projectId: "", lastContactAt: "", lastContactNote: "", sourceLink: "", details: "Created from an Inbox proposal (Note)." });
    expect(cleanTask({ ...p, status: "OPEN" }).ok).toBe(true);
  });
});

describe("cleanTaskUpdate", () => {
  it("needs text and defaults the date to today", () => {
    expect(cleanTaskUpdate({ text: "  Call set for Thursday " }, TODAY)).toEqual({ ok: true, value: { date: TODAY, text: "Call set for Thursday" } });
    expect(cleanTaskUpdate({ text: "x", date: "2026-10-15" }, TODAY)).toEqual({ ok: true, value: { date: "2026-10-15", text: "x" } });
    expect(cleanTaskUpdate({ text: "  " }, TODAY).ok).toBe(false);
    expect(cleanTaskUpdate({ text: "x", date: "15/10/2026" }, TODAY).ok).toBe(false);
    expect(cleanTaskUpdate({ text: "x".repeat(1001) }, TODAY).ok).toBe(false);
  });
});

describe("matchOwner", () => {
  const people = [{ id: "p1", name: "Leora Penn" }, { id: "p2", name: "Amit Puterkovsky" }, { id: "p3", name: "Dan Cohen" }];
  it("matches the one person whose full name is in 'who'", () => {
    expect(matchOwner("Leora Penn", people)).toBe("p1");
    expect(matchOwner("leora penn (Solargik)", people)).toBe("p1");
  });
  it("matches nobody for a first name, several people, empty or unknown", () => {
    expect(matchOwner("Leora", people)).toBeNull();
    expect(matchOwner("Leora Penn / Amit Puterkovsky", people)).toBeNull();
    expect(matchOwner("", people)).toBeNull();
    expect(matchOwner(null, people)).toBeNull();
    expect(matchOwner("the customer", people)).toBeNull();
  });
});

describe("taskFromActionItem (an approved action item becomes a task)", () => {
  const a = {
    summary: "iAccess Blumberg: Solargik to schedule the kickoff asap",
    kindText: "Task",
    sourceFrom: "tamirp@solargik.com",
    sourceSubject: "FW: Initial layout for BLUMBERG",
    sourceReceivedAt: "2026-10-20T07:56:27.000Z",
    sourceLink: "https://outlook.office365.com/owa/?ItemID=abc",
    text: "Solargik to schedule the kickoff meeting for the new iAccess Blumberg project as soon as possible.",
    who: "Leora Penn",
    by: "as soon as possible",
  };
  const people = [{ id: "p1", name: "Leora Penn" }];
  it("fills the topic, owner, email day, link and keeps a non-date 'by' in the details", () => {
    const p = taskFromActionItem(a, "c1", "pr1", people);
    expect(p).toMatchObject({ customerId: "c1", projectId: "pr1", topic: a.summary, status: "OPEN", ownerId: "p1", nextFollowUp: "", lastContactAt: "2026-10-20", sourceLink: a.sourceLink });
    expect(p.details).toContain(a.text);
    expect(p.details).toContain("For: Leora Penn");
    expect(p.details).toContain("Due: as soon as possible");
    expect(cleanTask({ ...p, status: "OPEN" }).ok).toBe(true);
  });
  it("turns a real date into the follow-up date, and does not guess one from words", () => {
    expect(taskFromActionItem({ ...a, by: "2026-10-27" }, "c1", "", people)).toMatchObject({ nextFollowUp: "2026-10-27", projectId: "" });
    expect(taskFromActionItem({ ...a, by: "2026-02-31" }, "c1", "", people).nextFollowUp).toBe("");
    expect(taskFromActionItem({ ...a, by: "end of next week" }, "c1", "", people).nextFollowUp).toBe("");
    expect(taskFromActionItem({ ...a, who: "the customer", by: null }, "c1", "", people)).toMatchObject({ ownerId: "", nextFollowUp: "" });
  });
});

describe("sorting the tasks (?sort=)", () => {
  const list = [
    { id: "resolved", ...t({ status: "RESOLVED", nextFollowUp: "2026-10-01" }) },
    { id: "none-old", ...t({ nextFollowUp: null, createdOn: "2026-09-01", lastContactAt: "2026-10-18" }) },
    { id: "later", ...t({ nextFollowUp: "2026-11-05", createdOn: "2026-10-12" }) },
    { id: "overdue", ...t({ nextFollowUp: "2026-10-10", createdOn: "2026-10-02" }) },
    { id: "soon", ...t({ nextFollowUp: "2026-10-21", createdOn: "2026-10-18" }) },
    { id: "today", ...t({ nextFollowUp: TODAY, createdOn: "2026-10-15" }) },
    { id: "none-new", ...t({ nextFollowUp: null, createdOn: "2026-10-17", lastContactAt: "2026-10-18" }) },
  ];
  const order = (s: "urgent" | "upcoming" | "newest") => [...list].sort((a, b) => compareForSort(s, a, b, TODAY)).map((x) => x.id);
  it("has Most urgent (the default), Upcoming and Newest first, and falls back to the default for anything else", () => {
    expect(TASK_SORTS.map((s) => s.key)).toEqual(["urgent", "upcoming", "newest", "customer", "project", "priority"]);
    expect(parseTaskSort("upcoming")).toBe("upcoming");
    expect(parseTaskSort("nope")).toBe("urgent");
    expect(parseTaskSort(undefined)).toBe("urgent");
  });
  it("Upcoming: soonest follow-up first (an overdue one leads), no follow-up date last, resolved after all", () => {
    expect(order("upcoming")).toEqual(["overdue", "today", "soon", "later", "none-old", "none-new", "resolved"]);
  });
  it("Newest first: the latest created first, resolved last", () => {
    expect(order("newest")).toEqual(["soon", "none-new", "today", "later", "overdue", "none-old", "resolved"]);
  });
  it("Most urgent is the usual order", () => {
    expect(order("urgent")).toEqual([...list].sort((a, b) => compareTasks(a, b, TODAY)).map((x) => x.id));
  });
});

describe("task priority", () => {
  it("has High, Medium and Low; a task is Medium unless set; nothing else is accepted", () => {
    expect(TASK_PRIORITIES.map((p) => p.value)).toEqual(["HIGH", "MEDIUM", "LOW"]);
    expect(cleanTask({ customerId: "c1", topic: "x" })).toMatchObject({ ok: true, value: { priority: "MEDIUM" } });
    expect(cleanTask({ customerId: "c1", topic: "x", priority: "" })).toMatchObject({ ok: true, value: { priority: "MEDIUM" } });
    expect(cleanTask({ customerId: "c1", topic: "x", priority: "HIGH" })).toMatchObject({ ok: true, value: { priority: "HIGH" } });
    expect(cleanTask({ customerId: "c1", topic: "x", priority: "URGENT" }).ok).toBe(false);
    expect(isTaskPriority("LOW")).toBe(true);
    expect(isTaskPriority("low")).toBe(false);
    expect(taskPriorityChoice("HIGH").label).toBe("High");
    expect(taskPriorityChoice(undefined).label).toBe("Medium");
    expect([taskPriorityRank("HIGH"), taskPriorityRank("MEDIUM"), taskPriorityRank("LOW"), taskPriorityRank("odd")]).toEqual([0, 1, 2, 1]);
  });

  const p = (id: string, priority: string, over: Partial<TaskTimes> = {}) => ({ id, priority, ...t(over) });
  const list = [
    p("resolved-high", "HIGH", { status: "RESOLVED" }),
    p("low-overdue", "LOW", { nextFollowUp: "2026-10-01" }),
    p("med-quiet", "MEDIUM"),
    p("high-later", "HIGH", { nextFollowUp: "2026-11-20" }),
    p("high-overdue", "HIGH", { nextFollowUp: "2026-10-05" }),
    p("med-today", "MEDIUM", { nextFollowUp: TODAY }),
  ];
  it("sorts High first, then Medium, then Low; the most urgent first inside a priority; resolved last", () => {
    const order = [...list].sort((a, b) => compareForSort("priority", a, b, TODAY)).map((x) => x.id);
    expect(order).toEqual(["high-overdue", "high-later", "med-today", "med-quiet", "low-overdue", "resolved-high"]);
  });
  it("is one of the sort choices and parses from the address", () => {
    expect(parseTaskSort("priority")).toBe("priority");
  });
});

describe("sorting the tasks by customer or project", () => {
  const w = (id: string, customerName: string, projectName: string | null, over: Partial<TaskTimes> = {}) => ({ id, customerName, projectName, ...t(over) });
  const list = [
    { ...w("resolved", "Aaa", "100-First", { status: "RESOLVED" }) },
    w("rev-259", "Revalue", "259-Rignano Flaminio 1"),
    w("rev-none", "Revalue", null),
    w("far-361", "Farmdo", "361-Gulistan"),
    w("rev-87", "Revalue", "87-Early"),
    w("dp-236a", "DPower", "236-Valenza", { nextFollowUp: "2026-10-30" }),
    w("dp-236b", "DPower", "236-Valenza", { nextFollowUp: TODAY }),
    w("dp-354", "DPower", "354-Lattaruli"),
  ];
  const order = (s: "customer" | "project") => [...list].sort((a, b) => compareForSort(s, a, b, TODAY)).map((x) => x.id);
  it("Customer A–Z: by the customer's name, most urgent first inside a customer, resolved last", () => {
    expect(order("customer")).toEqual(["dp-236b", "dp-236a", "dp-354", "far-361", "rev-259", "rev-none", "rev-87", "resolved"].map((id) => id));
  });
  it("Project: by project number (87 before 259, not as text), a customer's general tasks after its projects' numbers, resolved last", () => {
    const o = order("project");
    expect(o.slice(0, 3)).toEqual(["rev-87", "dp-236b", "dp-236a"]);
    expect(o.slice(3)).toEqual(["rev-259", "dp-354", "far-361", "rev-none", "resolved"].map((id) => id));
  });
});