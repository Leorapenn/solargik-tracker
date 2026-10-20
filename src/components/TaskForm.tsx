"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { saveNewTask, saveTask } from "@/server/actions/tasks";
import { MAX_CONTACT_NOTE, MAX_DETAILS, MAX_TOPIC, TASK_STATUSES, type TaskInput } from "@/lib/tasks";
import type { TaskView } from "@/server/services/tasks";
import { DateField } from "@/components/DateField";
import { NAVY, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type CustomerOption = { id: string; name: string };
export type ProjectOption = { id: string; name: string; customerId: string };
export type PersonOption = { id: string; name: string };

const blank = (customerId: string): TaskInput => ({ customerId, projectId: "", topic: "", details: "", status: "OPEN", ownerId: "", lastContactAt: "", lastContactNote: "", nextFollowUp: "", sourceLink: "" });

const fromTask = (t: TaskView): TaskInput => ({
  customerId: t.customerId,
  projectId: t.projectId ?? "",
  topic: t.topic,
  details: t.details ?? "",
  status: t.status,
  ownerId: t.ownerId ?? "",
  lastContactAt: t.lastContactAt ?? "",
  lastContactNote: t.lastContactNote ?? "",
  nextFollowUp: t.nextFollowUp ?? "",
  sourceLink: t.sourceLink ?? "",
});

// Creates a task, or edits one: the customer, optionally one of its projects, the topic, the status, who owns it, the last
// correspondence and when to follow up next.
export function TaskForm({
  task,
  presetCustomerId = "",
  prefill,
  customers,
  projects,
  people,
  onDone,
  onSaved,
}: {
  task?: TaskView;
  presetCustomerId?: string;
  // values to start a new task with (e.g. from an Inbox proposal); nothing is saved until Add task
  prefill?: Partial<TaskInput>;
  customers: CustomerOption[];
  projects: ProjectOption[];
  people: PersonOption[];
  // closes the form (Cancel, or after saving unless onSaved is given)
  onDone: () => void;
  // called instead of onDone after a successful save
  onSaved?: () => void;
}) {
  const [data, setData] = useState<TaskInput>(task ? fromTask(task) : { ...blank(presetCustomerId), ...prefill });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<TaskInput>) => setData((d) => ({ ...d, ...patch }));
  const customerProjects = useMemo(
    () => projects.filter((p) => p.customerId === data.customerId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [projects, data.customerId],
  );

  const field = (text: string, child: ReactNode, width?: number | string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, width }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: TEXT_MUTED }}>{text}</div>
      {child}
    </div>
  );

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = task ? await saveTask(task.id, data) : await saveNewTask(data);
      if (result.ok) (onSaved ?? onDone)();
      else setError(result.error);
    });
  }

  return (
    <form
      style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{task ? "Edit task" : "New task"}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {field(
          "Customer",
          <select aria-label="Customer" value={data.customerId} onChange={(e) => set({ customerId: e.target.value, projectId: "" })} style={{ ...inputStyle, minWidth: 200 }}>
            <option value="">Choose…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>,
        )}
        {field(
          "Project (optional)",
          <select aria-label="Project" value={data.projectId} onChange={(e) => set({ projectId: e.target.value })} disabled={!data.customerId} style={{ ...inputStyle, minWidth: 220 }}>
            <option value="">The customer in general</option>
            {customerProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>,
        )}
        {field(
          "Status",
          <select aria-label="Status" value={data.status} onChange={(e) => set({ status: e.target.value })} style={inputStyle}>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>,
        )}
        {field(
          "Owner",
          <select aria-label="Owner" value={data.ownerId} onChange={(e) => set({ ownerId: e.target.value })} style={inputStyle}>
            <option value="">Nobody</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>,
        )}
      </div>

      {field(
        "Issue or topic",
        <input aria-label="Issue or topic" value={data.topic} maxLength={MAX_TOPIC} placeholder="e.g. Disputing the charges we sent" onChange={(e) => set({ topic: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} autoFocus={!task} />,
      )}
      {field(
        "Details (optional)",
        <textarea aria-label="Details" value={data.details} maxLength={MAX_DETAILS} rows={3} placeholder="What is going on, what has been tried" onChange={(e) => set({ details: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }} />,
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
        {field("Last correspondence", <DateField ariaLabel="Last correspondence date" value={data.lastContactAt || null} onCommit={(c) => set({ lastContactAt: c.date ?? "" })} />)}
        {field(
          "About it (one line)",
          <input aria-label="About the last correspondence" value={data.lastContactNote} maxLength={MAX_CONTACT_NOTE} placeholder="e.g. They replied, trying to set a call" onChange={(e) => set({ lastContactNote: e.target.value })} style={{ ...inputStyle, width: 340 }} />,
        )}
        {field("Follow up on", <DateField ariaLabel="Follow-up date" value={data.nextFollowUp || null} onCommit={(c) => set({ nextFollowUp: c.date ?? "" })} />)}
      </div>

      {data.sourceLink && (
        <div style={{ fontSize: 13.5, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: TEXT_MUTED }}>Linked email:</span>
          <a href={data.sourceLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
            Open email
          </a>
          <button type="button" style={{ ...secondaryButton, padding: "2px 10px", fontSize: 12.5 }} onClick={() => set({ sourceLink: "" })}>
            Remove link
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" disabled={pending} style={primaryButton}>
          {pending ? "Saving…" : task ? "Save" : "Add task"}
        </button>
        <button type="button" disabled={pending} style={secondaryButton} onClick={onDone}>
          Cancel
        </button>
        {error && (
          <span role="alert" style={{ color: "#8C1D18", fontSize: 13.5 }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
