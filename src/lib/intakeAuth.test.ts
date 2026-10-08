import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { isIntakeAuthorized } from "./intakeAuth";

const TOKEN = "a-long-enough-intake-token-1";
const OLD = "the-previous-intake-token-2";
const req = (authorization?: string) => new Request("https://example.com/api/intake/projects", { headers: authorization ? { authorization } : {} });

describe("isIntakeAuthorized", () => {
  it("accepts the current token only as a Bearer token", () => {
    expect(isIntakeAuthorized(req(`Bearer ${TOKEN}`), { INTAKE_TOKEN: TOKEN })).toBe(true);
    expect(isIntakeAuthorized(req(TOKEN), { INTAKE_TOKEN: TOKEN })).toBe(false);
    expect(isIntakeAuthorized(req(`Bearer ${TOKEN}x`), { INTAKE_TOKEN: TOKEN })).toBe(false);
    expect(isIntakeAuthorized(req(), { INTAKE_TOKEN: TOKEN })).toBe(false);
  });

  it("refuses everything when no usable token is set", () => {
    expect(isIntakeAuthorized(req(`Bearer ${TOKEN}`), {})).toBe(false);
    expect(isIntakeAuthorized(req("Bearer short"), { INTAKE_TOKEN: "short" })).toBe(false);
    expect(isIntakeAuthorized(req("Bearer "), { INTAKE_TOKEN: "" })).toBe(false);
  });

  it("accepts the previous token only while it is set (rotation), and no other secret", () => {
    const env = { INTAKE_TOKEN: TOKEN, INTAKE_TOKEN_PREVIOUS: OLD };
    expect(isIntakeAuthorized(req(`Bearer ${OLD}`), env)).toBe(true);
    expect(isIntakeAuthorized(req(`Bearer ${TOKEN}`), env)).toBe(true);
    expect(isIntakeAuthorized(req(`Bearer ${OLD}`), { INTAKE_TOKEN: TOKEN })).toBe(false);
    expect(isIntakeAuthorized(req("Bearer a-cron-secret-of-sixteen-chars"), { ...env, CRON_SECRET: "a-cron-secret-of-sixteen-chars" })).toBe(false);
  });
});

// A guard on the source itself: the intake token must stay confined to the intake endpoints.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("INTAKE_TOKEN stays confined to the intake endpoints", () => {
  const root = join(process.cwd(), "src");
  const files = sourceFiles(root).map((path) => ({ path: relative(root, path).replace(/\\/g, "/"), text: readFileSync(path, "utf8") }));

  it("is read only by the shared check (and shown as set / not set on the Inbox page)", () => {
    const readers = files.filter((f) => /process\.env\.INTAKE_TOKEN|env\.INTAKE_TOKEN/.test(f.text)).map((f) => f.path).sort();
    expect(readers).toEqual(["app/inbox/page.tsx", "lib/intakeAuth.ts"]);
  });

  it("is only used by route files under /api/intake, and every one of them checks it", () => {
    const users = files.filter((f) => f.text.includes("isIntakeAuthorized") && f.path !== "lib/intakeAuth.ts").map((f) => f.path);
    expect(users.length).toBeGreaterThan(0);
    for (const path of users) expect(path).toMatch(/^app\/api\/intake\/.+\/route\.ts$/);
    const routes = files.filter((f) => /^app\/api\/intake\/.+\/route\.ts$/.test(f.path));
    for (const r of routes) expect(r.text, r.path).toContain("isIntakeAuthorized(request)");
  });

  it("the customer and project lists are read-only (GET only); only suggestions and import-run can be posted to", () => {
    const methodsOf = (path: string) => [...files.find((f) => f.path === path)!.text.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]).sort();
    expect(methodsOf("app/api/intake/customers/route.ts")).toEqual(["GET"]);
    expect(methodsOf("app/api/intake/projects/route.ts")).toEqual(["GET"]);
    expect(methodsOf("app/api/intake/suggestions/route.ts")).toEqual(["GET", "POST"]);
    expect(methodsOf("app/api/intake/import-run/route.ts")).toEqual(["GET", "POST"]);
    const intakeRoutes = files.filter((x) => /^app\/api\/intake\/.+\/route\.ts$/.test(x.path)).map((x) => x.path).sort();
    expect(intakeRoutes).toEqual([
      "app/api/intake/customers/route.ts",
      "app/api/intake/import-run/route.ts",
      "app/api/intake/projects/route.ts",
      "app/api/intake/suggestions/route.ts",
    ]);
  });
});
