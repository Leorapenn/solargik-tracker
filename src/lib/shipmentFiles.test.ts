import { describe, expect, it } from "vitest";
import { assetIdOf, fitName, isSharepointLink, mergeFiles, safeName, sharepointLink, uniqueName } from "./shipmentFiles";

describe("file and folder names", () => {
  it("makes a name safe for Windows and SharePoint, keeping what is readable", () => {
    expect(safeName("360-PRJ / Shipment #02 - ISR")).toBe("360-PRJ - Shipment #02 - ISR");
    expect(safeName('a:b*c?"d<e>f|g.pdf')).toBe("a-b-c-d-e-f-g.pdf");
    expect(safeName("  trailing dots...  ")).toBe("trailing dots");
    expect(safeName("装箱照片(1).zip")).toBe("装箱照片(1).zip");
    expect(safeName("///")).toBe("-");
    expect(safeName("", "file")).toBe("file");
    expect(safeName("...")).toBe("file");
  });
  it("cuts a very long name but keeps the extension", () => {
    const long = `${"x".repeat(200)}.pdf`;
    const out = safeName(long);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith(".pdf")).toBe(true);
  });
  it("shortens a name so the whole path fits, keeping the extension", () => {
    expect(fitName("short.pdf", 100)).toBe("short.pdf");
    const out = fitName(`${"y".repeat(120)}.xlsx`, 200);
    expect(200 + 1 + out.length).toBeLessThanOrEqual(250);
    expect(out.endsWith(".xlsx")).toBe(true);
    expect(fitName("a-very-long-name.pdf", 300).length).toBeGreaterThanOrEqual(12 - 1); // never below a readable minimum
  });
  it("never reuses a name: (2), (3)...", () => {
    const taken = new Set(["a.pdf", "a (2).pdf", "b"]);
    expect(uniqueName("a.pdf", (n) => taken.has(n))).toBe("a (3).pdf");
    expect(uniqueName("c.pdf", (n) => taken.has(n))).toBe("c.pdf");
    expect(uniqueName("b", (n) => taken.has(n))).toBe("b (2)");
  });
});

describe("links", () => {
  it("builds the SharePoint link with every part encoded", () => {
    expect(sharepointLink("360 - PRJ (iAccess, Hufingen, Germany)", "360-PRJ - Shipment #01 - ISR", "Packing list (6).pdf")).toBe(
      "https://solargik.sharepoint.com/sites/Projects/Shared%20Documents/EXECUTION/360%20-%20PRJ%20(iAccess%2C%20Hufingen%2C%20Germany)/Procurement%20%2B%20Logistics/Shipments/360-PRJ%20-%20Shipment%20%2301%20-%20ISR/Packing%20list%20(6).pdf",
    );
  });
  it("tells SharePoint addresses from monday.com ones, and reads an asset id", () => {
    expect(isSharepointLink("https://solargik.sharepoint.com/sites/Projects/x.pdf")).toBe(true);
    expect(isSharepointLink("https://solargikcrm.monday.com/protected_static/1/resources/2/x.pdf")).toBe(false);
    expect(isSharepointLink("http://solargik.sharepoint.com/x")).toBe(false);
    expect(assetIdOf("https://solargikcrm.monday.com/protected_static/6995427/resources/3008913672/a%20b.pdf")).toBe("3008913672");
    expect(assetIdOf("https://example.com/x.pdf")).toBeNull();
  });
});

describe("keeping the links when the monday.com import runs again", () => {
  const monday = (id: number, name: string) => ({ name, url: `https://solargikcrm.monday.com/protected_static/1/resources/${id}/${name}` });
  it("adds only the files the shipment does not know, and never turns a SharePoint link back into a monday.com one", () => {
    const moved = { name: "BL.pdf", url: "https://solargik.sharepoint.com/sites/Projects/BL.pdf", mondayUrl: monday(2, "BL.pdf").url };
    const existing = [monday(1, "PL.xlsx"), moved];
    const incoming = [monday(1, "PL.xlsx"), monday(2, "BL.pdf"), monday(3, "POD.pdf")];
    const merged = mergeFiles(existing, incoming);
    expect(merged.map((f) => f.url)).toEqual([monday(1, "PL.xlsx").url, moved.url, monday(3, "POD.pdf").url]);
    expect(merged[1]).toEqual(moved);
  });
  it("keeps two files with the same name apart (they have different addresses)", () => {
    const a = monday(10, "COO draft.pdf");
    const b = monday(11, "COO draft.pdf");
    expect(mergeFiles([a], [a, b])).toEqual([a, b]);
  });
  it("is the same list when nothing is new", () => {
    const files = [monday(1, "a.pdf")];
    expect(mergeFiles(files, files)).toEqual(files);
    expect(mergeFiles([], [])).toEqual([]);
  });
});
