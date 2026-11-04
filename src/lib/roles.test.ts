import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STAFF_HOME, staffLanding, staffMayVisit } from "./roles";
import { authConfigured, createSessionToken, sessionRole, staffConfigured, verifySessionToken } from "./session";

const MANAGER_PW = "manager-password-123";
const STAFF_PW = "staff-password-456";
let saved: { app?: string; staff?: string };

beforeEach(() => {
  saved = { app: process.env.APP_PASSWORD, staff: process.env.STAFF_PASSWORD };
  process.env.APP_PASSWORD = MANAGER_PW;
  process.env.STAFF_PASSWORD = STAFF_PW;
});
afterEach(() => {
  for (const [key, value] of [["APP_PASSWORD", saved.app], ["STAFF_PASSWORD", saved.staff]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("sessions with two roles", () => {
  it("a manager token proves manager, a staff token proves staff", async () => {
    expect(await sessionRole(await createSessionToken("manager"))).toBe("manager");
    expect(await sessionRole(await createSessionToken())).toBe("manager"); // the default is how it always was
    expect(await sessionRole(await createSessionToken("staff"))).toBe("staff");
    expect(await verifySessionToken(await createSessionToken("manager"))).toBe(true);
    expect(await verifySessionToken(await createSessionToken("staff"))).toBe(false); // "signed in as a manager" is false for staff
  });

  it("a staff member cannot turn their token into a manager's", async () => {
    const staff = await createSessionToken("staff");
    const [, expires, signature] = staff.split(".");
    for (const forged of [`v1.${expires}.${signature}`, `v2s.${expires}.${signature}x`, `v1.${Number(expires) + 1}.${signature}`, `v3.${expires}.${signature}`, "v1..", "", "staff"]) {
      expect(await sessionRole(forged)).not.toBe("manager");
    }
    expect(await sessionRole(`v1.${expires}.${signature}`)).toBeNull();
  });

  it("a token from before staff access existed (v1) is still a manager's", async () => {
    // exactly the format the app issued before roles: v1.<expiry>.<hmac of "v1.<expiry>" with APP_PASSWORD>
    const expires = Date.now() + 60_000;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(MANAGER_PW), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v1.${expires}`))), (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await sessionRole(`v1.${expires}.${sig}`)).toBe("manager");
  });

  it("changing the staff password signs staff out, and the manager password signs everyone out", async () => {
    const staff = await createSessionToken("staff");
    const manager = await createSessionToken("manager");
    process.env.STAFF_PASSWORD = "another-staff-password";
    expect(await sessionRole(staff)).toBeNull();
    expect(await sessionRole(manager)).toBe("manager"); // the managers stay signed in
    process.env.APP_PASSWORD = "another-manager-password";
    expect(await sessionRole(manager)).toBeNull();
  });

  it("staff access is off until STAFF_PASSWORD is set, long enough, and not the manager's", async () => {
    const staff = await createSessionToken("staff");
    for (const value of [undefined, "", "short", MANAGER_PW]) {
      if (value === undefined) delete process.env.STAFF_PASSWORD;
      else process.env.STAFF_PASSWORD = value;
      expect(staffConfigured()).toBe(false);
      expect(await sessionRole(staff)).toBeNull();
      await expect(createSessionToken("staff")).rejects.toThrow();
    }
    process.env.STAFF_PASSWORD = STAFF_PW;
    expect(staffConfigured()).toBe(true);
    expect(authConfigured()).toBe(true);
  });

  it("nothing works without the manager password configured, and expired or garbled tokens prove nothing", async () => {
    const staff = await createSessionToken("staff");
    delete process.env.APP_PASSWORD;
    expect(authConfigured()).toBe(false);
    expect(staffConfigured()).toBe(false);
    expect(await sessionRole(staff)).toBeNull();
    process.env.APP_PASSWORD = MANAGER_PW;
    expect(await sessionRole(undefined)).toBeNull();
    expect(await sessionRole("v2s.0.abcd")).toBeNull();
    expect(await sessionRole("v1.9999999999999.zz")).toBeNull();
  });
});

describe("what staff may open", () => {
  it("only the Tasks page, with or without a trailing slash", () => {
    expect(staffMayVisit("/tasks")).toBe(true);
    expect(staffMayVisit("/tasks/")).toBe(true);
    for (const path of ["/", "/customers", "/customers/abc", "/projects", "/projects/abc", "/phases", "/payments", "/payments/abc", "/updates", "/updates/export", "/updates/agenda", "/inbox", "/people", "/import", "/search", "/tasks/digest", "/tasks/anything", "/api/files/upload", "/api/files/x.pdf", "/tasksx", "/actions"]) {
      expect(staffMayVisit(path)).toBe(false);
    }
  });

  it("after signing in staff land on the Tasks page, or on the task page they asked for", () => {
    expect(staffLanding("")).toBe(STAFF_HOME);
    expect(staffLanding("/tasks?filter=attention")).toBe("/tasks?filter=attention");
    expect(staffLanding("/payments")).toBe(STAFF_HOME);
    expect(staffLanding("/tasks/digest")).toBe(STAFF_HOME);
    expect(staffLanding("//evil.example.com")).toBe(STAFF_HOME);
    expect(staffLanding("https://evil.example.com/tasks")).toBe(STAFF_HOME);
    expect(staffLanding("/\\evil")).toBe(STAFF_HOME);
  });
});
