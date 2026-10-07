import { describe, expect, it } from "vitest";
import { cleanWebLink, executionFolderUrl } from "./links";

describe("cleanWebLink", () => {
  it("accepts http(s) links, trims, and treats empty as none", () => {
    expect(cleanWebLink("  https://solargik.sharepoint.com/sites/Projects  ")).toEqual({ ok: true, value: "https://solargik.sharepoint.com/sites/Projects" });
    expect(cleanWebLink("")).toEqual({ ok: true, value: null });
    expect(cleanWebLink(null)).toEqual({ ok: true, value: null });
  });
  it("rejects anything else", () => {
    expect(cleanWebLink("javascript:alert(1)").ok).toBe(false);
    expect(cleanWebLink("ftp://x/y").ok).toBe(false);
    expect(cleanWebLink("not a link").ok).toBe(false);
    expect(cleanWebLink("https://x.com/" + "a".repeat(1100)).ok).toBe(false);
  });
});

describe("executionFolderUrl", () => {
  it("builds an encoded link to a project's folder", () => {
    expect(executionFolderUrl("259 (Revalue, Rignano Flaminio 1, Italy)")).toBe(
      "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/259%20(Revalue,%20Rignano%20Flaminio%201,%20Italy)",
    );
    expect(executionFolderUrl("290-PRJ (Revalue, Sant'Oreste 2, Italy)")).toContain("Sant'Oreste%202");
  });
});
