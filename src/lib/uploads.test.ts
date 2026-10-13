import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  blobPathname,
  checkUpload,
  cleanFileLink,
  isOwnFileLink,
  isUploadPathname,
  ownFileLink,
  safeFileName,
  servedContentType,
} from "./uploads";

const messages = { tooLong: "too long", invalid: "invalid" };

describe("safeFileName", () => {
  it("keeps a plain name and lower-cases the extension", () => {
    expect(safeFileName("Invoice 12.PDF")).toBe("Invoice-12.pdf");
  });
  it("drops any path and odd characters", () => {
    expect(safeFileName("C:\\Users\\me\\..\\evil name?.pdf")).toBe("evil-name.pdf");
    expect(safeFileName("../../etc/passwd.png")).toBe("passwd.png");
  });
  it("removes non-ASCII text but never returns an empty name", () => {
    expect(safeFileName("חשבונית.pdf")).toBe("file.pdf");
    expect(safeFileName("")).toBe("file");
  });
  it("shortens very long names", () => {
    expect(safeFileName("a".repeat(300) + ".pdf").length).toBeLessThanOrEqual(84);
  });
});

describe("checkUpload", () => {
  it("accepts pdf, png and jpg up to 10 MB", () => {
    expect(checkUpload({ name: "a.pdf", size: 1000, type: "application/pdf" })).toEqual({ ok: true, contentType: "application/pdf" });
    expect(checkUpload({ name: "a.PNG", size: 1000, type: "image/png" }).ok).toBe(true);
    expect(checkUpload({ name: "a.jpeg", size: MAX_UPLOAD_BYTES, type: "image/jpeg" }).ok).toBe(true);
  });
  it("refuses other types, an empty file and anything over 10 MB", () => {
    expect(checkUpload({ name: "a.exe", size: 10, type: "application/octet-stream" }).ok).toBe(false);
    expect(checkUpload({ name: "a.docx", size: 10 }).ok).toBe(false);
    expect(checkUpload({ name: "noextension", size: 10 }).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: 10, type: "text/html" }).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: 0 }).ok).toBe(false);
    expect(checkUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 }).ok).toBe(false);
  });
});

describe("pathnames and our own links", () => {
  it("only knows files stored as uploads/<safe name>", () => {
    expect(blobPathname("Invoice-12-abc123.pdf")).toBe("uploads/Invoice-12-abc123.pdf");
    expect(isUploadPathname("uploads/Invoice-12.pdf")).toBe(true);
    for (const bad of ["", ".", "..", "a/b.pdf", "..%2Fx.pdf", ".hidden.pdf", "a b.pdf", "a\\b.pdf"]) expect(blobPathname(bad)).toBeNull();
    expect(isUploadPathname("other/Invoice.pdf")).toBe(false);
    expect(isUploadPathname("uploads/a/b.pdf")).toBe(false);
    expect(isUploadPathname("uploads/../x.pdf")).toBe(false);
  });
  it("makes the link from the stored pathname and recognises exactly those links", () => {
    expect(ownFileLink("uploads/Invoice-12-abc.pdf")).toBe("/api/files/Invoice-12-abc.pdf");
    expect(ownFileLink("elsewhere/x.pdf")).toBeNull();
    expect(isOwnFileLink("/api/files/Invoice-12-abc.pdf")).toBe(true);
    expect(isOwnFileLink("/api/files/../secret")).toBe(false);
    expect(isOwnFileLink("/api/files/a/b.pdf")).toBe(false);
    expect(isOwnFileLink("/api/other/x.pdf")).toBe(false);
    expect(isOwnFileLink("https://example.com/api/files/x.pdf")).toBe(false);
  });
});

describe("cleanFileLink", () => {
  it("treats empty as no link", () => {
    expect(cleanFileLink("  ", messages)).toEqual({ ok: true, value: null });
    expect(cleanFileLink(undefined, messages)).toEqual({ ok: true, value: null });
  });
  it("accepts web addresses and our own uploaded files", () => {
    expect(cleanFileLink("https://example.com/a b.pdf", messages)).toEqual({ ok: true, value: "https://example.com/a%20b.pdf" });
    expect(cleanFileLink(" /api/files/Invoice-1-abc.pdf ", messages)).toEqual({ ok: true, value: "/api/files/Invoice-1-abc.pdf" });
  });
  it("refuses everything else, including other paths on this site and non-web schemes", () => {
    for (const bad of ["/api/intake/projects", "/api/files/../x", "javascript:alert(1)", "ftp://x.com/a.pdf", "C:\\file.pdf", "not a link"]) {
      expect(cleanFileLink(bad, messages)).toEqual({ ok: false, error: "invalid" });
    }
    expect(cleanFileLink("https://x.com/" + "a".repeat(1001), messages)).toEqual({ ok: false, error: "too long" });
  });
});

describe("servedContentType", () => {
  it("serves only the three allowed types as themselves", () => {
    expect(servedContentType("application/pdf")).toBe("application/pdf");
    expect(servedContentType("image/png")).toBe("image/png");
    expect(servedContentType("text/html")).toBe("application/octet-stream");
    expect(servedContentType(undefined)).toBe("application/octet-stream");
  });
});
