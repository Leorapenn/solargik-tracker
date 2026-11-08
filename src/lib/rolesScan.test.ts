import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Guards for the two-password login: staff (the second password) may open the Tasks page and run five task actions, and NOTHING else.
// These scan the source, so a new page, route or action that forgets its check, or a staff permission added by accident, fails here.

const ROOT = join(process.cwd(), "src");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const files = walk(ROOT).filter((p) => !/\.test\.tsx?$/.test(p));

describe("server actions", () => {
  const actionFiles = files.filter((p) => rel(p).startsWith("server/actions/") && !rel(p).endsWith("auth.ts"));

  // every exported async function with the role check it calls first
  const actions = actionFiles.flatMap((file) => {
    const text = readFileSync(file, "utf8");
    const starts = [...text.matchAll(/export async function (\w+)/g)];
    return starts.map((m, i) => {
      const body = text.slice(m.index!, i + 1 < starts.length ? starts[i + 1].index! : text.length);
      const manager = /requireActionAuth\(\)/.test(body);
      const staff = /requireStaffAction\(\)/.test(body);
      return { file: rel(file), name: m[1], manager, staff };
    });
  });

  it("every action checks the role, and none checks twice or neither", () => {
    expect(actions.length).toBeGreaterThan(40);
    for (const a of actions) expect({ ...a, ok: a.manager !== a.staff }).toMatchObject({ ok: true }); // exactly one of the two
  });

  it("staff may run exactly these five, all about their own tasks' status, updates and dates", () => {
    const staffAllowed = actions.filter((a) => a.staff).map((a) => `${a.file}:${a.name}`).sort();
    expect(staffAllowed).toEqual(
      [
        "server/actions/tasks.ts:changeTaskDeadline",
        "server/actions/tasks.ts:changeTaskFollowUp",
        "server/actions/tasks.ts:changeTaskStatus",
        "server/actions/tasks.ts:contactedToday",
        "server/actions/tasks.ts:logTaskUpdate",
      ].sort(),
    );
  });

  it("the actions that can change an owner, a priority, a topic, create or delete tasks are managers only", () => {
    const manager = (name: string) => actions.find((a) => a.name === name)?.manager;
    for (const name of ["saveTask", "saveNewTask", "changeTaskPriority", "removeTask", "closeAllCustomerTasks"]) expect(manager(name)).toBe(true);
  });

  it("the update action passes on only the four fields of its form (a staff member can call it)", () => {
    const text = readFileSync(join(ROOT, "server/actions/tasks.ts"), "utf8");
    expect(text).toMatch(/addTaskUpdate\(id, \{ date: input\?\.date, text: input\?\.text, contact: input\?\.contact, nextFollowUp: input\?\.nextFollowUp \}\)/);
  });
});

describe("pages", () => {
  const pages = files.filter((p) => p.endsWith("page.tsx"));

  it("every page except the login and the redirecting home checks the role; only the Tasks page and the read-only Overview let staff in", () => {
    const open: string[] = [];
    for (const page of pages) {
      const text = readFileSync(page, "utf8");
      const name = rel(page);
      if (name === "app/login/page.tsx" || name === "app/page.tsx") continue;
      const any = /requireAnyPageAuth\(\)/.test(text);
      const manager = /requirePageAuth\(\)/.test(text);
      expect({ name, checked: any || manager }).toEqual({ name, checked: true });
      if (any) open.push(name);
    }
    expect(open.sort()).toEqual(["app/overview/page.tsx", "app/tasks/page.tsx"]);
  });
});

describe("route handlers", () => {
  const routes = files.filter((p) => p.endsWith("route.ts"));

  it("every route is a cron job (its own secret), the intake (its own token), or checks for a MANAGER session", () => {
    expect(routes.length).toBeGreaterThan(8);
    for (const route of routes) {
      const name = rel(route);
      const text = readFileSync(route, "utf8");
      const own = name.startsWith("app/api/cron/") || name.startsWith("app/api/intake/");
      expect({ name, checked: own || /hasSession\(\)/.test(text) }).toEqual({ name, checked: true });
      // no route may accept a staff session by using the role helpers that let staff in
      expect(text).not.toMatch(/requireAnyPageAuth|requireStaffAction/);
    }
  });

  it("hasSession means a manager", () => {
    const text = readFileSync(join(ROOT, "lib/auth.ts"), "utf8");
    expect(text).toMatch(/export async function hasSession\(\)[^}]*=== "manager"/);
    expect(text).toMatch(/export async function requireActionAuth\(\)[^}]*!== "manager"/);
  });

  it("the role helpers that let staff in are used only where intended", () => {
    const users = (name: string) => files.filter((p) => !rel(p).endsWith("lib/auth.ts") && new RegExp(name).test(readFileSync(p, "utf8"))).map(rel).sort();
    expect(users("requireStaffAction")).toEqual(["server/actions/tasks.ts"]);
    expect(users("requireAnyPageAuth")).toEqual(["app/overview/page.tsx", "app/tasks/page.tsx"]);
  });
});
