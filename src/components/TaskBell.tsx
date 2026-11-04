import { currentRole } from "@/lib/auth";
import { listReminders, type TaskReminder } from "@/server/services/tasks";
import { NotificationsBell } from "@/components/NotificationsBell";

// The bell for the top bar (runs on the server for every page). Signed out: nothing. If the tasks cannot be read, the bell
// shows as empty rather than breaking the page it sits on.
export async function TaskBell() {
  let items: TaskReminder[] = [];
  try {
    if (!(await currentRole())) return null; // managers and staff both see their reminders
    items = await listReminders();
  } catch {
    items = [];
  }
  return <NotificationsBell items={items} />;
}
