import Link from "next/link";
import { agoText, taskAttention, taskStatusChoice } from "@/lib/tasks";
import type { TaskView } from "@/server/services/tasks";
import { ChoicePill } from "@/components/ColorSelect";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED, cardStyle } from "@/lib/theme";

// The open tasks of a customer or of one project, most urgent first (read-only: tasks are edited on the Tasks page).
export function TasksCard({
  tasks,
  todayIso,
  empty,
  moreHref,
  showProject,
  heading = true,
}: {
  tasks: TaskView[];
  todayIso: string;
  empty: string;
  moreHref: string;
  showProject: boolean;
  heading?: boolean; // false when the page already has a summary line above the card
}) {
  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      {heading && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
            Tasks{tasks.length > 0 ? ` (${tasks.length} open)` : ""}
          </div>
          <div style={{ width: 28, height: 3, borderRadius: 2, background: ORANGE, margin: "8px 0 6px" }} />
        </>
      )}
      {tasks.length === 0 && <div style={{ padding: "8px 0", color: TEXT_MUTED, fontSize: 14 }}>{empty}</div>}
      {tasks.map((t, i) => {
        const attention = taskAttention({ status: t.status, nextFollowUp: t.nextFollowUp, lastContactAt: t.lastContactAt, createdOn: t.createdOn }, todayIso);
        return (
          <div key={t.id} style={{ padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`, display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
            <Link href={`/tasks#${t.id}`} style={{ color: NAVY, fontWeight: 700, overflowWrap: "anywhere" }}>
              {t.topic}
            </Link>
            <div style={{ fontSize: 13, color: TEXT_MUTED }}>
              {showProject ? `${t.projectName ?? "The customer in general"}` : ""}
              {t.lastContactAt ? `${showProject ? " · " : ""}last correspondence ${agoText(t.lastContactAt, todayIso)}` : ""}
              {t.nextFollowUp ? `${showProject || t.lastContactAt ? " · " : ""}follow up ${agoText(t.nextFollowUp, todayIso)}` : ""}
              {attention ? ` · ${attention.text}` : ""}
            </div>
            <ChoicePill choice={taskStatusChoice(t.status)} />
          </div>
        );
      })}
      <div style={{ paddingTop: 10, borderTop: `1px solid ${ROW_DIVIDER}`, fontSize: 13.5 }}>
        <Link href={moreHref} style={{ color: NAVY, fontWeight: 700 }}>
          Open in Tasks (add or update)
        </Link>
      </div>
    </div>
  );
}
