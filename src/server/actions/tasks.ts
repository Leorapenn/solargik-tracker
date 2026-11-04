"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth, requireStaffAction } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import type { TaskInput } from "@/lib/tasks";
import { addTaskUpdate, closeCustomerTasks, createTask, deleteTask, markContactedToday, setTaskDeadline, setTaskFollowUp, setTaskPriority, setTaskStatus, updateTask } from "@/server/services/tasks";

// WHO MAY RUN WHAT. Staff (the second password) may run exactly five of these: change a task's status (mark it done), add an update
// (log it, or "contacted today"), and change its dates (the follow-up date and the deadline). They call requireStaffAction; every
// other action calls requireActionAuth and refuses staff, so changing an owner, a priority, a topic, creating or deleting a task
// is for managers only. src/lib/rolesScan.test.ts lists the staff-allowed ones: adding one is a deliberate change there, and
// src/server/actions/tasksRoles.test.ts runs these actions with a staff and a manager session.

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/customers", "layout");
  revalidatePath("/projects", "layout");
  // the bell in the top bar lives in the root layout
  revalidatePath("/", "layout");
}

// ---- managers only ----

export async function saveNewTask(input: TaskInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await createTask(input);
    refresh();
    return {};
  });
}

// The whole task, including its owner: managers only.
export async function saveTask(id: string, input: TaskInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await updateTask(id, input);
    refresh();
    return {};
  });
}

export async function changeTaskPriority(id: string, priority: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setTaskPriority(id, priority);
    refresh();
    return {};
  });
}

// Closes (resolves) every open task of one customer.
export async function closeAllCustomerTasks(customerId: string): Promise<ActionResult<{ closed: number }>> {
  await requireActionAuth();
  return run(async () => {
    const closed = await closeCustomerTasks(customerId);
    refresh();
    return { closed };
  });
}

export async function removeTask(id: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await deleteTask(id);
    refresh();
    return {};
  });
}

// ---- managers and staff ----

export async function changeTaskStatus(id: string, status: string): Promise<ActionResult> {
  await requireStaffAction();
  return run(async () => {
    await setTaskStatus(id, status);
    refresh();
    return {};
  });
}

// Sets or removes the next follow-up date on its own (no log text).
export async function changeTaskFollowUp(id: string, date: string): Promise<ActionResult> {
  await requireStaffAction();
  return run(async () => {
    await setTaskFollowUp(id, date);
    refresh();
    return {};
  });
}

// Sets or removes the deadline ("YYYY-MM-DDTHH:MM", Israel time) on its own.
export async function changeTaskDeadline(id: string, deadline: string): Promise<ActionResult> {
  await requireStaffAction();
  return run(async () => {
    await setTaskDeadline(id, deadline);
    refresh();
    return {};
  });
}

// A dated log entry; by default it also counts as the last correspondence. A new follow-up date can be set with it.
export async function logTaskUpdate(id: string, input: { date?: string; text: string; contact: boolean; nextFollowUp?: string }): Promise<ActionResult> {
  await requireStaffAction();
  return run(async () => {
    // only the four fields of the form are taken over, whatever else a request carries (a staff member can call this action)
    await addTaskUpdate(id, { date: input?.date, text: input?.text, contact: input?.contact, nextFollowUp: input?.nextFollowUp });
    refresh();
    return {};
  });
}

export async function contactedToday(id: string): Promise<ActionResult> {
  await requireStaffAction();
  return run(async () => {
    await markContactedToday(id);
    refresh();
    return {};
  });
}
