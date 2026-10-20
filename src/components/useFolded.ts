"use client";

import { useSyncExternalStore } from "react";
import { FOLD_STORAGE_KEY, parseFolded, withFolded } from "@/lib/foldState";

// Whether one customer group or task is folded, remembered in this browser. Server-rendered pages start with everything
// open; the saved choice is applied right after the page loads. If the browser refuses to store anything (private window),
// the choice still works until the page is closed.
const listeners = new Set<() => void>();
let storageFailed = false;
let memory = "[]";

function snapshot(): string {
  if (storageFailed) return memory;
  try {
    return window.localStorage.getItem(FOLD_STORAGE_KEY) ?? "[]";
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange); // another tab changed it
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function write(id: string, folded: boolean) {
  const value = withFolded(snapshot(), id, folded);
  memory = value;
  try {
    window.localStorage.setItem(FOLD_STORAGE_KEY, value);
  } catch {
    storageFailed = true;
  }
  listeners.forEach((l) => l());
}

export function useFolded(id: string): [boolean, (folded: boolean) => void] {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const folded = parseFolded(raw).includes(id);
  return [folded, (next) => write(id, next)];
}

// Opens a task and its customer's group on the Tasks tab and scrolls to the task: used by links that jump to one task (the
// bell, the Tasks cards), so the task is never hidden inside something folded. Safe to call from any page.
export function revealTask(customerId: string, taskId: string) {
  write(`group:${customerId}`, false);
  write(`task:${taskId}`, false);
  // on the Tasks page itself the card appears a moment after it is unfolded; elsewhere the browser scrolls by the link's #
  window.setTimeout(() => document.getElementById(taskId)?.scrollIntoView({ block: "start" }), 200);
}