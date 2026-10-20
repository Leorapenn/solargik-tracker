import { redirect } from "next/navigation";
import { requirePageAuth } from "@/lib/auth";

// Action items and tasks are one thing now: an approved action item becomes a task. The old address leads to the Tasks tab.
export default async function ActionsPage() {
  await requirePageAuth();
  redirect("/tasks");
}