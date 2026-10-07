import { describe, expect, it } from "vitest";
import { checkPhone, cleanCustomerManager, groupContacts, type ContactRow } from "./contacts";

describe("checkPhone", () => {
  it("accepts ordinary phone numbers and tidies the spacing", () => {
    expect(checkPhone("  +39  06 1234 5678 ")).toEqual({ ok: true, value: "+39 06 1234 5678" });
    expect(checkPhone("(050) 791-7125")).toEqual({ ok: true, value: "(050) 791-7125" });
    expect(checkPhone("")).toEqual({ ok: true, value: null });
    expect(checkPhone(null)).toEqual({ ok: true, value: null });
  });
  it("rejects letters, too few or too many digits", () => {
    expect(checkPhone("call me").ok).toBe(false);
    expect(checkPhone("123").ok).toBe(false);
    expect(checkPhone("1".repeat(25)).ok).toBe(false);
    expect(checkPhone("<script>").ok).toBe(false);
  });
  it("is carried through when people are grouped", () => {
    const people = groupContacts([{ id: "a", name: "Dana", email: "d@x.com", phone: "+39 06 1234 5678", role: null, englishLevel: null, source: "MANUAL", projectId: null, projectName: null }]);
    expect(people[0].phone).toBe("+39 06 1234 5678");
  });
});

describe("cleanCustomerManager", () => {
  it("needs a name once anything is given, and clears when everything is empty", () => {
    expect(cleanCustomerManager({ name: " Dana  Levi ", email: "d@x.com", phone: "+39 06 1234 5678" })).toEqual({ ok: true, value: { name: "Dana Levi", email: "d@x.com", phone: "+39 06 1234 5678" } });
    expect(cleanCustomerManager({ name: "", email: "", phone: "" })).toEqual({ ok: true, value: { name: null, email: null, phone: null } });
    expect(cleanCustomerManager({ name: "", email: "d@x.com", phone: "" }).ok).toBe(false);
    expect(cleanCustomerManager({ name: "Dana", email: "nope", phone: "" }).ok).toBe(false);
    expect(cleanCustomerManager({ name: "Dana", email: "", phone: "abc" }).ok).toBe(false);
  });
});

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
