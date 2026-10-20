"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { agoText, taskAttention, taskStatusChoice } from "@/lib/tasks";
import type { TaskView } from "@/server/services/tasks";
import { changeTaskStatus } from "@/server/actions/tasks";
import { ChoicePill } from "@/components/ColorSelect";
import { CloseCustomerTasksButton } from "@/components/CloseCustomerTasksButton";
import { TaskForm, type CustomerOption, type PersonOption, type ProjectOption } from "@/components/TaskForm";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED, cardStyle, secondaryButton } from "@/lib/theme";

const small = { ...secondaryButton, padding: "3px 12px", fontSize: 13 } as const;

// The open tasks of a customer or of one project, most urgent first, on the customer and project pages. Tasks can be
// added, edited and marked done right here (the Tasks tab has the full view with the log).
export function TasksCard({
  tasks,
  todayIso,
  empty,
  moreHref,
  showProject,
  heading = true,
  customerId,
  customerName,
  projectId = "",
  customers,
  projects,
  people,
  allowCloseAll = false,
}: {
  tasks: TaskView[];
  todayIso: string;
  empty: string;
  moreHref: string;
  showProject: boolean;
  heading?: boolean; // false when the page already has a summary line above the card
  customerId: string; // the customer new tasks are for
  customerName: string;
  projectId?: string; // the project new tasks are for ("" = the customer in general)
  customers: CustomerOption[];
  projects: ProjectOption[]; // the customer's projects (for the project box of the form)
  people: PersonOption[];
  allowCloseAll?: boolean; // "Close all N" for the customer's open tasks (not on a single project's card)
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const done = (id: string) =>
    startTransition(async () => {
      setError(null);
      const r = await changeTaskStatus(id, "RESOLVED");
      if (!r.ok) setError(r.error);
    });

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

      {adding && (
        <div style={{ margin: "8px 0" }}>
          <TaskForm customers={customers} projects={projects} people={people} prefill={{ customerId, projectId }} onDone={() => setAdding(false)} />
        </div>
      )}

      {tasks.length === 0 && !adding && <div style={{ padding: "8px 0", color: TEXT_MUTED, fontSize: 14 }}>{empty}</div>}
      {tasks.map((t, i) => {
        if (editingId === t.id) {
          return (
            <div key={t.id} style={{ margin: "8px 0" }}>
              <TaskForm task={t} customers={customers} projects={projects} people={people} onDone={() => setEditingId(null)} />
            </div>
          );
        }
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
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <ChoicePill choice={taskStatusChoice(t.status)} />
              <button type="button" style={small} disabled={pending} onClick={() => setEditingId(t.id)}>
                Edit
              </button>
              <button type="button" style={small} disabled={pending} title="Mark this task as resolved" onClick={() => done(t.id)}>
                Mark done
              </button>
            </div>
          </div>
        );
      })}

      <div style={{ paddingTop: 10, borderTop: `1px solid ${ROW_DIVIDER}`, fontSize: 13.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {!adding && (
          <button type="button" style={small} disabled={pending} onClick={() => setAdding(true)}>
            + Add task
          </button>
        )}
        {allowCloseAll && <CloseCustomerTasksButton customerId={customerId} customerName={customerName} openCount={tasks.length} />}
        <Link href={moreHref} style={{ color: NAVY, fontWeight: 700 }}>
          Open in Tasks
        </Link>
        {error && (
          <span role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
