import { describe, expect, it } from "vitest";
import { groupContacts, type ContactRow } from "./contacts";

const row = (over: Partial<ContactRow> & { id: string }): ContactRow => ({
  name: "Dana Levi",
  email: "dana@revalue.com",
  role: "CEO",
  englishLevel: "Strong",
  source: "IMPORTED",
  projectId: "p1",
  projectName: "257-Barge 2",
  ...over,
});

describe("groupContacts", () => {
  it("merges the same person across projects, keyed by email regardless of case", () => {
    const people = groupContacts([
      row({ id: "a", projectId: "p1", projectName: "257-Barge 2" }),
      row({ id: "b", email: "DANA@revalue.com", projectId: "p2", projectName: "258-Gattico" }),
      row({ id: "c", email: "avi@revalue.com", name: "Avi", projectId: "p1", projectName: "257-Barge 2" }),
    ]);
    expect(people).toHaveLength(2);
    const dana = people.find((p) => p.name === "Dana Levi")!;
    expect(dana.ids).toEqual(["a", "b"]);
    expect(dana.projects.map((p) => p.name)).toEqual(["257-Barge 2", "258-Gattico"]);
  });

  it("lists the person on the most projects first", () => {
    const people = groupContacts([
      row({ id: "a", name: "Zed", email: "z@x.com", projectId: "p1", projectName: "A" }),
      row({ id: "b", name: "Dana", email: "d@x.com", projectId: "p1", projectName: "A" }),
      row({ id: "c", name: "Dana", email: "d@x.com", projectId: "p2", projectName: "B" }),
    ]);
    expect(people.map((p) => p.name)).toEqual(["Dana", "Zed"]);
  });

  it("groups people without an email by name, and does not count a project twice", () => {
    const people = groupContacts([
      row({ id: "a", email: null, name: "Moshe", projectId: "p1", projectName: "A" }),
      row({ id: "b", email: null, name: "moshe", projectId: "p1", projectName: "A" }),
    ]);
    expect(people).toHaveLength(1);
    expect(people[0].projects).toHaveLength(1);
  });

  it("only lets hand-added people be deleted", () => {
    const manual = groupContacts([row({ id: "a", source: "MANUAL", projectId: null, projectName: null })]);
    expect(manual[0].deletable).toBe(true);
    expect(manual[0].projects).toEqual([]);

    const mixed = groupContacts([row({ id: "a", source: "MANUAL" }), row({ id: "b", source: "IMPORTED" })]);
    expect(mixed[0].deletable).toBe(false);
  });

  it("fills a missing role from another row of the same person", () => {
    const people = groupContacts([row({ id: "a", role: null }), row({ id: "b", role: "CFO" })]);
    expect(people[0].role).toBe("CFO");
  });
});
