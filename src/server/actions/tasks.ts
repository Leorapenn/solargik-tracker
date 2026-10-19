"use server";

import { revalidatePath } from "next/cache";
import { requireActionAuth } from "@/lib/auth";
import { run, type ActionResult } from "@/lib/errors";
import type { TaskInput } from "@/lib/tasks";
import { addTaskUpdate, createTask, deleteTask, markContactedToday, setTaskStatus, updateTask } from "@/server/services/tasks";

function refresh() {
  revalidatePath("/tasks");
  revalidatePath("/customers", "layout");
  // the bell in the top bar lives in the root layout
  revalidatePath("/", "layout");
}

export async function saveNewTask(input: TaskInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await createTask(input);
    refresh();
    return {};
  });
}

export async function saveTask(id: string, input: TaskInput): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await updateTask(id, input);
    refresh();
    return {};
  });
}

export async function changeTaskStatus(id: string, status: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await setTaskStatus(id, status);
    refresh();
    return {};
  });
}

// A dated log entry; by default it also counts as the last correspondence. A new follow-up date can be set with it.
export async function logTaskUpdate(id: string, input: { date?: string; text: string; contact: boolean; nextFollowUp?: string }): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await addTaskUpdate(id, input);
    refresh();
    return {};
  });
}

export async function contactedToday(id: string): Promise<ActionResult> {
  await requireActionAuth();
  return run(async () => {
    await markContactedToday(id);
    refresh();
    return {};
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
