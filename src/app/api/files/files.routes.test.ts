import { beforeEach, describe, expect, it, vi } from "vitest";

// The storage service and the login check are faked: these tests are about WHO may do what and WHICH files, not about
// the real store.
const state = { session: true, token: "token", blob: null as null | { statusCode: number; stream: ReadableStream | null; blob: { contentType: string } } };
vi.mock("@/lib/auth", () => ({ hasSession: async () => state.session }));
vi.mock("@/server/uploads", () => ({ uploadsConfigured: () => Boolean(state.token) }));
const getMock = vi.fn();
vi.mock("@vercel/blob", () => ({ get: (...args: unknown[]) => getMock(...args) }));
const handleUploadMock = vi.fn();
vi.mock("@vercel/blob/client", () => ({ handleUpload: (options: unknown) => handleUploadMock(options) }));

import { GET } from "./[name]/route";
import { POST } from "./upload/route";

const ctx = (name: string) => ({ params: Promise.resolve({ name }) });
const stream = () => new Response("PDFDATA").body;

beforeEach(() => {
  state.session = true;
  state.token = "token";
  getMock.mockReset();
  handleUploadMock.mockReset();
});

describe("GET /api/files/<name>", () => {
  it("answers 401 without a login and never touches the store", async () => {
    state.session = false;
    const response = await GET(new Request("http://x/api/files/a.pdf"), ctx("a.pdf"));
    expect(response.status).toBe(401);
    expect(getMock).not.toHaveBeenCalled();
  });
  it("answers 503 while the store is not connected", async () => {
    state.token = "";
    expect((await GET(new Request("http://x"), ctx("a.pdf"))).status).toBe(503);
  });
  it("refuses a name that is not one stored file name, without asking the store", async () => {
    for (const bad of ["..", "a/b.pdf", "..%2Fx", ".env", "a b"]) {
      expect((await GET(new Request("http://x"), ctx(bad))).status).toBe(404);
    }
    expect(getMock).not.toHaveBeenCalled();
  });
  it("streams the file from uploads/<name> with safe headers", async () => {
    getMock.mockResolvedValue({ statusCode: 200, stream: stream(), blob: { contentType: "application/pdf" } });
    const response = await GET(new Request("http://x"), ctx("Invoice-1-abc.pdf"));
    expect(getMock).toHaveBeenCalledWith("uploads/Invoice-1-abc.pdf", { access: "private" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("PDFDATA");
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

  it("answers 401 without a login and never asks the store for permission", async () => {
    state.session = false;
    expect((await POST(post({}))).status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });
  it("answers 503 while the store is not connected", async () => {
    state.token = "";
    expect((await POST(post({}))).status).toBe(503);
  });
  it("answers 400 for a body that is not JSON", async () => {
    const response = await POST(new Request("http://x", { method: "POST", body: "nope" }));
    expect(response.status).toBe(400);
  });
  it("issues a permission limited to the allowed types, 10 MB, no overwrite, for uploads/<safe name> only", async () => {
    handleUploadMock.mockImplementation(async (options: { onBeforeGenerateToken: (pathname: string) => Promise<unknown> }) => {
      const granted = await options.onBeforeGenerateToken("uploads/Invoice-1.pdf");
      return { granted };
    });
    const response = await POST(post({ type: "blob.generate-client-token" }));
    expect(response.status).toBe(200);
    expect((await response.json()).granted).toEqual({
      allowedContentTypes: ["application/pdf", "image/png", "image/jpeg"],
      maximumSizeInBytes: 10 * 1024 * 1024,
      addRandomSuffix: true,
      allowOverwrite: false,
    });
  });
  it("refuses a pathname outside uploads/ or with a path in it", async () => {
    handleUploadMock.mockImplementation(async (options: { onBeforeGenerateToken: (pathname: string) => Promise<unknown> }) => options.onBeforeGenerateToken("other/../x.pdf"));
    expect((await POST(post({}))).status).toBe(400);
    handleUploadMock.mockImplementation(async (options: { onBeforeGenerateToken: (pathname: string) => Promise<unknown> }) => options.onBeforeGenerateToken("uploads/a/b.pdf"));
    expect((await POST(post({}))).status).toBe(400);
  });
});
