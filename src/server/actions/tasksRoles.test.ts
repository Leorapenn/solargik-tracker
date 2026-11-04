import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionToken, SESSION_COOKIE } from "@/lib/session";

// The real task actions, run with a staff cookie and with a manager cookie: staff can change status, update and dates, and are
// refused everything else BEFORE anything is touched. (The services are replaced by spies, so no database is used.)

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => (name === "solargik_session" && state.cookie ? { value: state.cookie } : undefined) }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const calls = vi.hoisted(() => ({ names: [] as string[] }));
vi.mock("@/server/services/tasks", () => {
  const spy = (name: string) => async () => {
    calls.names.push(name);
  };
  return {
    addTaskUpdate: spy("addTaskUpdate"),
    closeCustomerTasks: async () => {
      calls.names.push("closeCustomerTasks");
      return 0;
    },
    createTask: spy("createTask"),
    deleteTask: spy("deleteTask"),
    markContactedToday: spy("markContactedToday"),
    setTaskDeadline: spy("setTaskDeadline"),
    setTaskFollowUp: spy("setTaskFollowUp"),
    setTaskPriority: spy("setTaskPriority"),
    setTaskStatus: spy("setTaskStatus"),
    updateTask: spy("updateTask"),
  };
});

import * as actions from "./tasks";
import { requireActionAuth, requirePageAuth, requireAnyPageAuth, hasSession, currentRole } from "@/lib/auth";

beforeEach(() => {
  process.env.APP_PASSWORD = "manager-password-123";
  process.env.STAFF_PASSWORD = "staff-password-456";
  calls.names.length = 0;
  state.cookie = undefined;
});

const as = async (role: "manager" | "staff" | null) => {
  state.cookie = role ? await createSessionToken(role) : undefined;
};

describe("staff session", () => {
  beforeEach(() => as("staff"));

  it("can mark a task done, change its dates and add an update", async () => {
    expect((await actions.changeTaskStatus("t", "RESOLVED")).ok).toBe(true);
    expect((await actions.changeTaskFollowUp("t", "2026-12-01")).ok).toBe(true);
    expect((await actions.changeTaskDeadline("t", "2026-12-01T17:00")).ok).toBe(true);
    expect((await actions.logTaskUpdate("t", { text: "Called them", contact: true })).ok).toBe(true);
    expect((await actions.contactedToday("t")).ok).toBe(true);
    expect(calls.names).toEqual(["setTaskStatus", "setTaskFollowUp", "setTaskDeadline", "addTaskUpdate", "markContactedToday"]);
  });

  it("cannot change an owner or anything else of a task, create, delete or reprioritise: refused before anything is touched", async () => {
    await expect(actions.saveTask("t", { customerId: "c", topic: "x", ownerId: "someone" } as never)).rejects.toThrow("Unauthorized");
    await expect(actions.saveNewTask({ customerId: "c", topic: "x" } as never)).rejects.toThrow("Unauthorized");
    await expect(actions.removeTask("t")).rejects.toThrow("Unauthorized");
    await expect(actions.changeTaskPriority("t", "HIGH")).rejects.toThrow("Unauthorized");
    await expect(actions.closeAllCustomerTasks("c")).rejects.toThrow("Unauthorized");
    expect(calls.names).toEqual([]);
  });

  it("cannot pass anything but the four fields of the form into an update", async () => {
    const seen: unknown[] = [];
    const services = await import("@/server/services/tasks");
    vi.spyOn(services, "addTaskUpdate").mockImplementation(async (_id, input) => {
      seen.push(input);
    });
    await actions.logTaskUpdate("t", { text: "x", contact: true, sourceLink: "https://evil.example.com", sourceSubject: "forged" } as never);
    expect(seen).toEqual([{ date: undefined, text: "x", contact: true, nextFollowUp: undefined }]);
  });

  it("is a staff session for the page helpers: the manager-only ones turn it away to the Tasks page", async () => {
    expect(await currentRole()).toBe("staff");
    expect(await hasSession()).toBe(false);
    await expect(requireActionAuth()).rejects.toThrow("Unauthorized");
    await expect(requirePageAuth()).rejects.toThrow("REDIRECT:/tasks");
    await expect(requireAnyPageAuth()).resolves.toBe("staff");
  });
});

describe("manager session", () => {
  beforeEach(() => as("manager"));

  it("can run everything, as before", async () => {
    expect((await actions.saveTask("t", { customerId: "c", topic: "x" } as never)).ok).toBe(true);
    expect((await actions.removeTask("t")).ok).toBe(true);
    expect((await actions.changeTaskPriority("t", "HIGH")).ok).toBe(true);
    expect((await actions.changeTaskStatus("t", "RESOLVED")).ok).toBe(true);
    expect(calls.names).toEqual(["updateTask", "deleteTask", "setTaskPriority", "setTaskStatus"]);
    expect(await hasSession()).toBe(true);
    await expect(requirePageAuth()).resolves.toBeUndefined();
  });
});

describe("nobody signed in", () => {
  it("is refused everywhere, also with a forged or empty cookie", async () => {
    for (const cookie of [undefined, "", "v1.9999999999999.00", "v2s.9999999999999.00"]) {
      state.cookie = cookie;
      await expect(actions.changeTaskStatus("t", "RESOLVED")).rejects.toThrow("Unauthorized");
      await expect(actions.removeTask("t")).rejects.toThrow("Unauthorized");
      await expect(requireAnyPageAuth()).rejects.toThrow("REDIRECT:/login");
      await expect(requirePageAuth()).rejects.toThrow("REDIRECT:/login");
    }
    expect(calls.names).toEqual([]);
    expect(SESSION_COOKIE).toBe("solargik_session");
  });

  it("staff access that is switched off (no STAFF_PASSWORD) turns a staff cookie into nothing", async () => {
    await as("staff");
    delete process.env.STAFF_PASSWORD;
    await expect(actions.changeTaskStatus("t", "RESOLVED")).rejects.toThrow("Unauthorized");
    expect(await currentRole()).toBeNull();
  });
});
