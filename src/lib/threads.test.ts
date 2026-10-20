import { describe, expect, it } from "vitest";
import { groupThreads, normalizeSubject, stripSubject, type ThreadRow } from "./threads";

const row = (id: string, over: Partial<ThreadRow> = {}): ThreadRow => ({
  id,
  conversationId: null,
  sourceSubject: "Re: 318 PRJ Full package design",
  sourceFrom: "yoni@solargik.com",
  sourceReceivedAt: "2026-10-14T08:00:00Z",
  sourceMessageId: `m-${id}`,
  sourceLink: `https://outlook/${id}`,
  projectId: "p318",
  customerId: "c1",
  ...over,
});

describe("subjects of one email chain", () => {
  it("drops Re / Fw / AW / R: prefixes (stacked, any case) and spaces, and lower-cases for comparing", () => {
    expect(stripSubject("RE: Fw: AW:  318 PRJ  Full package design ")).toBe("318 PRJ Full package design");
    expect(normalizeSubject("R: [Import] Consegna merce - Project 359")).toBe("[import] consegna merce - project 359");
    expect(normalizeSubject("Re: Re: Initial layout for BLUMBERG")).toBe(normalizeSubject("FW: Initial layout for BLUMBERG"));
    expect(normalizeSubject(null)).toBe("");
    expect(stripSubject("Revalue payments")).toBe("Revalue payments"); // "Re" inside a word is not a prefix
  });
});

describe("groupThreads", () => {
  it("groups by the conversation id, listing each email once, oldest first", () => {
    const t = groupThreads([
      row("a", { conversationId: "conv1", sourceReceivedAt: "2026-10-19T10:00:00Z" }),
      row("b", { conversationId: "conv1", sourceReceivedAt: "2026-10-11T10:00:00Z", sourceSubject: "318 PRJ Full package design", sourceFrom: "ivan@revalue.com" }),
      row("c", { conversationId: "conv1", sourceMessageId: "m-a", sourceLink: "https://outlook/a", sourceReceivedAt: "2026-10-19T10:00:00Z" }), // a second proposal from the same email
      row("d", { conversationId: "conv2", sourceSubject: "Other thing" }),
    ]);
    expect(t).toHaveLength(2);
    expect(t[0].rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(t[0].subject).toBe("318 PRJ Full package design");
    expect(t[0].emails.map((e) => e.day)).toEqual(["2026-10-11", "2026-10-19"]); // 3 proposals, 2 emails
    expect(t[1].rows.map((r) => r.id)).toEqual(["d"]);
  });

  it("older proposals with no conversation id group by subject within the same project, and join a chain that has an id", () => {
    const t = groupThreads([
      row("old1"),
      row("old2", { sourceSubject: "FW: 318 PRJ Full package design", sourceMessageId: "x2", sourceLink: null }),
      row("new", { conversationId: "conv9", sourceSubject: "RE: 318 PRJ Full package design" }),
      row("later", { conversationId: "conv9", sourceMessageId: "x9" }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0].rows.map((r) => r.id)).toEqual(["old1", "old2", "new", "later"]);
  });

  it("keeps a generic subject apart across different projects, and a row with no subject on its own", () => {
    const t = groupThreads([
      row("p1", { sourceSubject: "Update", projectId: "pA" }),
      row("p2", { sourceSubject: "Re: Update", projectId: "pB" }),
      row("p3", { sourceSubject: "Update", projectId: "pA", sourceMessageId: "other" }),
      row("n1", { sourceSubject: null, projectId: null, customerId: null }),
      row("n2", { sourceSubject: null, projectId: null, customerId: null }),
    ]);
    expect(t.map((x) => x.rows.map((r) => r.id))).toEqual([["p1", "p3"], ["p2"], ["n1"], ["n2"]]);
  });

  it("two emails with the same conversation id but different subjects are still one chain; chains appear where they first appear", () => {
    const t = groupThreads([row("x", { sourceSubject: "A", conversationId: "k", projectId: null, customerId: null }), row("y", { sourceSubject: "B", conversationId: "j" }), row("z", { sourceSubject: "A changed", conversationId: "k", projectId: null, customerId: null })]);
    expect(t.map((x) => x.rows.map((r) => r.id))).toEqual([["x", "z"], ["y"]]);
  });
});