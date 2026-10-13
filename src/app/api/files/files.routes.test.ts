import { beforeEach, describe, expect, it, vi } from "vitest";

// The storage service and the login check are faked: these tests are about WHO may do what and WHICH files, not about
// the real store.
const state = { session: true, mode: "token" as "token" | "oidc" | null };
vi.mock("@/lib/auth", () => ({ hasSession: async () => state.session }));
vi.mock("@/server/uploads", () => ({ uploadMode: () => state.mode, uploadsConfigured: () => state.mode !== null }));
const getMock = vi.fn();
const issueSignedTokenMock = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => getMock(...args), issueSignedToken: (options: unknown) => issueSignedTokenMock(options) }));
const handleUploadMock = vi.fn();
const handleUploadPresignedMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({
  handleUpload: (options: unknown) => handleUploadMock(options),
  handleUploadPresigned: (options: unknown) => handleUploadPresignedMock(options),
}));

import { GET } from "./[name]/route";
import { POST } from "./upload/route";

const ctx = (name: string) => ({ params: Promise.resolve({ name }) });
const stream = () => new Response("PDFDATA").body;

beforeEach(() => {
  state.session = true;
  state.mode = "token";
  getMock.mockReset();
  issueSignedTokenMock.mockReset();
  handleUploadMock.mockReset();
  handleUploadPresignedMock.mockReset();
});

describe("GET /api/files/<name>", () => {
  it("answers 401 without a login and never touches the store", async () => {
    state.session = false;
    const response = await GET(new Request("http://x/api/files/a.pdf"), ctx("a.pdf"));
    expect(response.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });
  it("answers 503 while the store is not connected", async () => {
    state.mode = null;
    expect((await GET(new Request("http://x"), ctx("a.pdf"))).status).toBe(503);
  });
  it("refuses a name that is not one stored file name, without asking the store", async () => {
    for (const bad of ["..", "a/b.pdf", "..%2Fx", ".env", "a b"]) {
      expect((await GET(new Request("http://x"), ctx(bad))).status).toBe(404);
    }
    expect(getMock).not.toHaveBeenCalled();
  });
  it("streams the file from uploads/<name> with safe headers (either connection)", async () => {
    for (const mode of ["token", "oidc"] as const) {
      state.mode = mode;
      getMock.mockResolvedValue({ statusCode: 200, stream: stream(), blob: { contentType: "application/pdf" } });
      const response = await GET(new Request("http://x"), ctx("Invoice-1-abc.pdf"));
      expect(getMock).toHaveBeenLastCalledWith("uploads/Invoice-1-abc.pdf", { access: "private" });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect(await response.text()).toBe("PDFDATA");
    }
  });
  it("never serves an unexpected stored type as itself", async () => {
    getMock.mockResolvedValue({ statusCode: 200, stream: stream(), blob: { contentType: "text/html" } });
    const response = await GET(new Request("http://x"), ctx("x-abc.pdf"));
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
  });
  it("answers 404 for a missing file and 502 when the store fails", async () => {
    getMock.mockResolvedValueOnce(null);
    expect((await GET(new Request("http://x"), ctx("gone.pdf"))).status).toBe(404);
    getMock.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(new Request("http://x"), ctx("x.pdf"))).status).toBe(502);
  });
});

describe("POST /api/files/upload", () => {
  const post = (body: unknown) => new Request("http://x/api/files/upload", { method: "POST", body: JSON.stringify(body) });
  type TokenOptions = { onBeforeGenerateToken: (pathname: string) => Promise<unknown> };
  type PresignedOptions = { getSignedToken: (pathname: string, clientPayload: string | null, multipart: boolean) => Promise<unknown> };

  it("answers 401 without a login and never asks the store for permission", async () => {
    state.session = false;
    expect((await POST(post({}))).status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
    expect(handleUploadPresignedMock).not.toHaveBeenCalled();
  });
  it("answers 503 while the store is not connected", async () => {
    state.mode = null;
    expect((await POST(post({}))).status).toBe(503);
  });
  it("answers 400 for a body that is not JSON", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: "nope" }));
    expect(response.status).toBe(400);
  });

  describe("read-write token connection", () => {
    it("issues a permission limited to the allowed types, 10 MB, no overwrite, for uploads/<safe name> only", async () => {
      handleUploadMock.mockImplementation(async (options: TokenOptions) => ({ granted: await options.onBeforeGenerateToken("uploads/Invoice-1-abc123.pdf") }));
      const response = await POST(post({ type: "blob.generate-client-token" }));
      expect(response.status).toBe(200);
      expect((await response.json()).granted).toEqual({
        allowedContentTypes: ["application/pdf", "image/png", "image/jpeg"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        addRandomSuffix: false,
        allowOverwrite: false,
      });
    });
    it("refuses a pathname outside uploads/ or with a path in it", async () => {
      handleUploadMock.mockImplementation(async (options: TokenOptions) => options.onBeforeGenerateToken("other/../x.pdf"));
      expect((await POST(post({ type: "blob.generate-client-token" }))).status).toBe(400);
      handleUploadMock.mockImplementation(async (options: TokenOptions) => options.onBeforeGenerateToken("uploads/a/b.pdf"));
      expect((await POST(post({ type: "blob.generate-client-token" }))).status).toBe(400);
    });
    it("refuses a presigned request when the site is not on the keyless connection", async () => {
      expect((await POST(post({ type: "blob.generate-presigned-url" }))).status).toBe(400);
      expect(handleUploadPresignedMock).not.toHaveBeenCalled();
    });
  });

  describe("keyless (OIDC) connection", () => {
    beforeEach(() => {
      state.mode = "oidc";
      issueSignedTokenMock.mockResolvedValue({ delegationToken: "d", clientSigningToken: "c", validUntil: 1 });
    });
    it("issues a signed token for ONE pathname, put only, allowed types, 10 MB, and never overwrites", async () => {
      handleUploadPresignedMock.mockImplementation(async (options: PresignedOptions) => ({ granted: await options.getSignedToken("uploads/Invoice-1-abc123.pdf", null, false) }));
      const response = await POST(post({ type: "blob.generate-presigned-url" }));
      expect(response.status).toBe(200);
      const call = issueSignedTokenMock.mock.calls[0][0];
      expect(call).toMatchObject({ pathname: "uploads/Invoice-1-abc123.pdf", operations: ["put"], allowedContentTypes: ["application/pdf", "image/png", "image/jpeg"], maximumSizeInBytes: 10 * 1024 * 1024 });
      expect(call.validUntil).toBeGreaterThan(Date.now());
      expect(call.validUntil).toBeLessThanOrEqual(Date.now() + 15 * 60 * 1000 + 1000);
      expect((await response.json()).granted.urlOptions).toEqual({
        allowedContentTypes: ["application/pdf", "image/png", "image/jpeg"],
        maximumSizeInBytes: 10 * 1024 * 1024,
        allowOverwrite: false,
        addRandomSuffix: false,
      });
    });
    it("refuses a pathname that is not uploads/<safe name> without asking the store for a token", async () => {
      for (const bad of ["other/x.pdf", "uploads/a/b.pdf", "uploads/../x.pdf", "*"]) {
        handleUploadPresignedMock.mockImplementation(async (options: PresignedOptions) => options.getSignedToken(bad, null, false));
        expect((await POST(post({ type: "blob.generate-presigned-url" }))).status).toBe(400);
      }
      expect(issueSignedTokenMock).not.toHaveBeenCalled();
    });
    it("refuses a client-token request when the site is on the keyless connection", async () => {
      expect((await POST(post({ type: "blob.generate-client-token" }))).status).toBe(400);
      expect(handleUploadMock).not.toHaveBeenCalled();
    });
  });
});
