import { describe, expect, it } from "vitest";
import { staffView, type TaskView } from "./tasks";

const task: TaskView = {
  id: "t1",
  customerId: "c1",
  customerName: "Revalue",
  projectId: "p1",
  projectName: "318-San Miniato",
  topic: "Geotech approval documents",
  details: "Revalue asks for the model approval",
  status: "OPEN",
  priority: "HIGH",
  ownerId: "o1",
  ownerName: "Yechiel",
  lastContactAt: "2026-11-02",
  lastContactNote: "They replied",
  nextFollowUp: "2026-11-06",
  resolvedAt: null,
  deadline: null,
  deadlineAt: null,
  sourceLink: "https://outlook.office.com/mail/id/1",
  createdOn: "2026-10-20",
  updates: [
    { id: "u1", date: "2026-11-02", text: "Revalue replied", sourceLink: "https://outlook.office.com/mail/id/2", sourceSubject: "Re: Geotech" },
    { id: "u2", date: "2026-10-20", text: "Task created", sourceLink: null, sourceSubject: null },
  ],
  emails: [{ key: "k", day: "2026-11-01", subject: "Geotech", link: "https://outlook.office.com/mail/id/3" }],
};

describe("what staff are sent of a task", () => {
  it("keeps what they work with and drops every link into the mailbox and to the project page", () => {
    const s = staffView(task);
    expect(s).toMatchObject({ id: "t1", topic: task.topic, details: task.details, status: "OPEN", ownerName: "Yechiel", nextFollowUp: "2026-11-06", projectName: "318-San Miniato", customerName: "Revalue" });
    expect(s.sourceLink).toBeNull();
    expect(s.projectId).toBeNull();
    expect(s.emails).toEqual([]);
    expect(s.updates.map((u) => [u.text, u.sourceLink, u.sourceSubject])).toEqual([["Revalue replied", null, null], ["Task created", null, null]]);
    expect(JSON.stringify(s)).not.toMatch(/outlook\.office\.com/);
  });
  it("does not change the original", () => {
    staffView(task);
    expect(task.sourceLink).toBe("https://outlook.office.com/mail/id/1");
    expect(task.updates[0].sourceLink).toBe("https://outlook.office.com/mail/id/2");
  });
});
