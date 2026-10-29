import { describe, expect, it } from "vitest";
import { parseDeadlineLocal } from "./deadline";
import { buildDigestEmail, buildDigests, weekEnd, type DigestTask } from "./taskDigest";

// Sunday 25 Oct 2026, 07:00 in Israel (05:00 UTC; Israel is on winter time from that day)
const NOW = new Date("2026-10-25T05:00:00Z");
const LEORA = "leora@solargik.com";
const at = (local: string) => parseDeadlineLocal(local);
const task = (over: Partial<DigestTask> & { id: string }): DigestTask => ({
  topic: `Topic ${over.id}`,
  customerName: "Revalue",
  projectName: "259-Rignano",
  status: "OPEN",
  priority: "MEDIUM",
  ownerName: "Amit",
  ownerEmail: "amit@solargik.com",
  ownerActive: true,
  deadline: null,
  nextFollowUp: null,
  ...over,
});
const titles = (d: { sections: { title: string; items: unknown[] }[] }) => d.sections.map((s) => `${s.title}:${s.items.length}`);

describe("the week", () => {
  it("runs to the coming Saturday", () => {
    expect(weekEnd("2026-10-25")).toBe("2026-10-31"); // Sunday
    expect(weekEnd("2026-10-28")).toBe("2026-10-31"); // Wednesday
    expect(weekEnd("2026-10-31")).toBe("2026-10-31"); // Saturday
  });
});

describe("the morning email (daily)", () => {
  const tasks = [
    task({ id: "overdue", deadline: at("2026-10-24T17:00") }),
    task({ id: "today", deadline: at("2026-10-25T17:00") }),
    task({ id: "tomorrow", deadline: at("2026-10-26T09:00") }),
    task({ id: "fu-today", nextFollowUp: "2026-10-25" }),
    task({ id: "fu-late", nextFollowUp: "2026-10-22" }),
    task({ id: "fu-later", nextFollowUp: "2026-10-28" }),
    task({ id: "done", status: "RESOLVED", deadline: at("2026-10-25T09:00") }),
  ];
  it("lists what is overdue, due today and the follow-ups due, for the owner, and leaves the rest out", () => {
    const { digests } = buildDigests(tasks, "daily", NOW, LEORA);
    expect(digests).toHaveLength(1);
    expect(digests[0].to).toBe("amit@solargik.com");
    expect(titles(digests[0])).toEqual(["Overdue deadlines:1", "Deadlines due today:1", "Follow-ups due:2"]);
    const ids = (key: string) => digests[0].sections.find((s) => s.key === key)!.items.map((i) => i.task.id);
    expect(ids("overdue")).toEqual(["overdue"]);
    expect(ids("deadlines")).toEqual(["today"]);
    expect(ids("followups")).toEqual(["fu-late", "fu-today"]); // oldest first
    expect(digests[0].sections[0].items[0].detail).toBe("Overdue by 15 hours"); // 24 Oct 17:00 was still summer time (UTC+3)
    expect(digests[0].sections[1].items[0].detail).toBe("10 hours left");
    expect(digests[0].sections[2].items.map((i) => i.detail)).toEqual(["3 days overdue", "due today"]);
  });
  it("sends nothing to an owner with nothing to act on", () => {
    expect(buildDigests([task({ id: "x", deadline: at("2026-11-20T10:00") })], "daily", NOW, LEORA).digests).toEqual([]);
  });
});

describe("the weekly email", () => {
  it("adds the deadlines and follow-ups up to Saturday, and still shows what is overdue", () => {
    const tasks = [
      task({ id: "overdue", deadline: at("2026-10-20T10:00") }),
      task({ id: "mon", deadline: at("2026-10-26T10:00") }),
      task({ id: "sat", deadline: at("2026-10-31T10:00") }),
      task({ id: "next-sun", deadline: at("2026-11-01T10:00") }),
      task({ id: "fu-wed", nextFollowUp: "2026-10-28" }),
      task({ id: "fu-next-week", nextFollowUp: "2026-11-03" }),
    ];
    const [d] = buildDigests(tasks, "weekly", NOW, LEORA).digests;
    expect(titles(d)).toEqual(["Overdue deadlines:1", "Deadlines this week:2", "Follow-ups this week:1"]);
    expect(d.sections[1].items.map((i) => i.task.id)).toEqual(["mon", "sat"]);
    expect(d.sections[2].items[0].detail).toBe("in 3 days");
  });
});

describe("who gets it", () => {
  it("one email per owner, and tasks with no owner, an owner with no email or an inactive owner go to the fallback with a note", () => {
    const tasks = [
      task({ id: "a", deadline: at("2026-10-25T17:00") }),
      task({ id: "b", ownerName: "Yoni", ownerEmail: "yoni@solargik.com", deadline: at("2026-10-25T18:00") }),
      task({ id: "none", ownerName: null, ownerEmail: null, deadline: at("2026-10-25T19:00") }),
      task({ id: "noemail", ownerName: "Teiby", ownerEmail: null, deadline: at("2026-10-25T20:00") }),
      task({ id: "gone", ownerName: "Old", ownerEmail: "old@solargik.com", ownerActive: false, deadline: at("2026-10-25T21:00") }),
    ];
    const { digests, unreachable } = buildDigests(tasks, "daily", NOW, LEORA);
    expect(unreachable).toBe(0);
    expect(digests.map((d) => [d.to, d.itemCount])).toEqual([["amit@solargik.com", 1], [LEORA, 3], ["yoni@solargik.com", 1]]);
    const leora = digests.find((d) => d.to === LEORA)!;
    expect(leora.notes).toEqual(["Teiby has no usable email address in People (or is inactive), so the tasks below are sent to you.", "Old has no usable email address in People (or is inactive), so the tasks below are sent to you."]);
  });
  it("counts the tasks nobody can be emailed about when there is no fallback address", () => {
    const tasks = [task({ id: "none", ownerName: null, ownerEmail: null, deadline: at("2026-10-25T19:00") }), task({ id: "a", deadline: at("2026-10-25T17:00") })];
    const r = buildDigests(tasks, "daily", NOW, null);
    expect(r.unreachable).toBe(1);
    expect(r.digests.map((d) => d.to)).toEqual(["amit@solargik.com"]);
    expect(buildDigests(tasks, "daily", NOW, "not an address").unreachable).toBe(1);
  });
  it("merges the fallback's own tasks with the ones sent to it, in one email", () => {
    const tasks = [task({ id: "mine", ownerName: "Leora", ownerEmail: LEORA, deadline: at("2026-10-25T17:00") }), task({ id: "none", ownerName: null, ownerEmail: null, deadline: at("2026-10-25T18:00") })];
    const { digests } = buildDigests(tasks, "daily", NOW, LEORA.toUpperCase());
    expect(digests).toHaveLength(1);
    expect(digests[0].itemCount).toBe(2);
  });
});

describe("the email text", () => {
  const [digest] = buildDigests([task({ id: "t1", topic: "Reply <b>now</b>", deadline: at("2026-10-25T17:00"), nextFollowUp: "2026-10-25" })], "daily", NOW, LEORA).digests;
  it("has a subject with the counts, links to the tasks and escapes what was typed", () => {
    const mail = buildDigestEmail(digest, "daily", NOW, "https://solargik-tracker.vercel.app/");
    expect(mail.subject).toBe("Solargik tasks for today (25 Oct 2026): 1 deadline, 1 follow-up");
    expect(mail.html).toContain("https://solargik-tracker.vercel.app/tasks#t1");
    expect(mail.html).toContain("Reply &lt;b&gt;now&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>now</b>");
    expect(mail.html).toContain("Deadlines due today (1)");
    expect(mail.html).toContain("10 hours left");
  });
  it("names the week in the weekly subject", () => {
    const [d] = buildDigests([task({ id: "w", deadline: at("2026-10-28T10:00") })], "weekly", NOW, LEORA).digests;
    expect(buildDigestEmail(d, "weekly", NOW, "https://x").subject).toBe("Solargik tasks: your week (25 Oct 2026 – 31 Oct 2026): 1 deadline");
  });
});
