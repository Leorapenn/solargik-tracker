"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { changeTaskStatus, contactedToday, logTaskUpdate, removeTask } from "@/server/actions/tasks";
import { MAX_UPDATE_TEXT, TASK_STATUSES, agoText, taskAttention } from "@/lib/tasks";
import { formatDate, parseDateInput } from "@/lib/dates";
import type { TaskView } from "@/server/services/tasks";
import { ColorSelect } from "@/components/ColorSelect";
import { DateField } from "@/components/DateField";
import { TaskForm, type CustomerOption, type PersonOption, type ProjectOption } from "@/components/TaskForm";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const fmt = (iso: string) => formatDate(parseDateInput(iso));
const small = { ...secondaryButton, padding: "4px 12px", fontSize: 13 } as const;
const ATTENTION = {
  overdue: { bg: "#FCE0DD", text: "#8C1D18" },
  today: { bg: "#FEF0D6", text: "#8A5300" },
  quiet: { bg: "#E4E6EC", text: "#4A4F5C" },
} as const;

// One task: the topic, status, project, owner, the last correspondence and the next follow-up, with the log of dated
// entries and the quick actions (contacted today, log an update, edit, delete).
export function TaskCard({
  task,
  todayIso,
  customers,
  projects,
  people,
}: {
  task: TaskView;
  todayIso: string;
  customers: CustomerOption[];
  projects: ProjectOption[];
  people: PersonOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(true); // the arrow folds the task to its title and status
  const [text, setText] = useState("");
  const [contact, setContact] = useState(true);
  const [next, setNext] = useState("");
  const attention = taskAttention({ status: task.status, nextFollowUp: task.nextFollowUp, lastContactAt: task.lastContactAt, createdOn: task.createdOn }, todayIso);
  const resolved = task.status === "RESOLVED";
  const entries = showAll ? task.updates : task.updates.slice(0, 3);

  const go = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) after?.();
      else setError(r.error ?? "That didn't work.");
    });

  if (editing) return <TaskForm task={task} customers={customers} projects={projects} people={people} onDone={() => setEditing(false)} />;

  return (
    <div id={task.id} style={{ ...cardStyle, padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10, opacity: resolved ? 0.8 : 1 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} the task: ${task.topic}`}
          title={open ? "Hide the details" : "Show the details"}
          onClick={() => setOpen((o) => !o)}
          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E4E6EC", background: "#fff", color: NAVY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flex: "none" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, overflowWrap: "anywhere", flex: "1 1 260px", textDecoration: resolved ? "line-through" : "none" }}>{task.topic}</div>
        {!open && attention && (
          <span style={{ background: ATTENTION[attention.level].bg, color: ATTENTION[attention.level].text, borderRadius: 999, padding: "1px 10px", fontSize: 12.5, fontWeight: 700 }}>{attention.text}</span>
        )}
        <ColorSelect ariaLabel={`Status of ${task.topic}`} value={task.status} options={TASK_STATUSES} disabled={pending} onChange={(v) => v && go(() => changeTaskStatus(task.id, v))} />
      </div>

      {open && (
        <>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13.5, color: TEXT_MUTED }}>
        <span>
          {task.projectId ? (
            <Link href={`/projects/${task.projectId}`} style={{ color: NAVY, fontWeight: 700 }}>
              {task.projectName}
            </Link>
          ) : (
            <span>The customer in general</span>
          )}
        </span>
        <span>Owner: <span style={{ color: "#1A1A1A" }}>{task.ownerName ?? "nobody"}</span></span>
        <span>
          Last correspondence:{" "}
          <span style={{ color: "#1A1A1A" }}>
            {task.lastContactAt ? `${agoText(task.lastContactAt, todayIso)} (${fmt(task.lastContactAt)})` : "none yet"}
          </span>
        </span>
        {!resolved && (
          <span>
            Follow up:{" "}
            <span style={{ color: task.nextFollowUp && task.nextFollowUp <= todayIso ? "#8C1D18" : "#1A1A1A", fontWeight: task.nextFollowUp && task.nextFollowUp <= todayIso ? 700 : 400 }}>
              {task.nextFollowUp ? `${fmt(task.nextFollowUp)} (${agoText(task.nextFollowUp, todayIso)})` : "not set"}
            </span>
          </span>
        )}
        {resolved && task.resolvedAt && <span style={{ color: "#047857", fontWeight: 700 }}>Resolved {fmt(task.resolvedAt)}</span>}
        {task.sourceLink && (
          <a href={task.sourceLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
            Open email
          </a>
        )}
        {attention && (
          <span style={{ background: ATTENTION[attention.level].bg, color: ATTENTION[attention.level].text, borderRadius: 999, padding: "1px 10px", fontSize: 12.5, fontWeight: 700 }}>{attention.text}</span>
        )}
      </div>

      {task.lastContactNote && <div style={{ fontSize: 13.5, overflowWrap: "anywhere" }}>{task.lastContactNote}</div>}
      {task.details && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", color: "#333" }}>{task.details}</div>}

      {task.updates.length > 0 && (
        <div style={{ borderTop: `1px solid ${ROW_DIVIDER}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          {entries.map((u) => (
            <div key={u.id} style={{ fontSize: 13, display: "flex", gap: 10 }}>
              <span style={{ color: TEXT_MUTED, whiteSpace: "nowrap", minWidth: 92 }}>{fmt(u.date)}</span>
              <span style={{ overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>{u.text}</span>
            </div>
          ))}
          {task.updates.length > 3 && (
            <button type="button" onClick={() => setShowAll((s) => !s)} style={{ alignSelf: "flex-start", border: "none", background: "transparent", color: NAVY, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
              {showAll ? "Show fewer" : `Show all ${task.updates.length} entries`}
            </button>
          )}
        </div>
      )}

      {logging && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 8, background: "#F6F7FB", borderRadius: 8, padding: "10px 12px" }}
          onSubmit={(e) => {
            e.preventDefault();
            go(() => logTaskUpdate(task.id, { text, contact, nextFollowUp: next }), () => {
              setLogging(false);
              setText("");
              setNext("");
              setContact(true);
            });
          }}
        >
          <textarea aria-label="What happened" value={text} maxLength={MAX_UPDATE_TEXT} rows={2} autoFocus placeholder="What happened? e.g. They replied, call set for Thursday" onChange={(e) => setText(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", font: "inherit", resize: "vertical" }} />
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13.5, display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={contact} onChange={(e) => setContact(e.target.checked)} /> Counts as correspondence with the customer
            </label>
            <span style={{ fontSize: 13.5, display: "flex", gap: 8, alignItems: "center" }}>
              New follow-up date <DateField ariaLabel="New follow-up date" value={next || null} onCommit={(c) => setNext(c.date ?? "")} />
            </span>
            <button type="submit" disabled={pending || !text.trim()} style={{ ...primaryButton, padding: "5px 14px", fontSize: 13 }}>
              Add to log
            </button>
            <button type="button" style={small} onClick={() => setLogging(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!resolved && (
          <button type="button" disabled={pending} style={small} onClick={() => go(() => contactedToday(task.id))}>
            Contacted today
          </button>
        )}
        <button type="button" disabled={pending} style={small} onClick={() => setLogging((l) => !l)}>
          Log update
        </button>
        <button type="button" disabled={pending} style={small} onClick={() => setEditing(true)}>
          Edit
        </button>
        <button
          type="button"
          disabled={pending}
          style={{ ...small, color: "#8C1D18" }}
          onClick={() => {
            if (window.confirm(`Delete the task "${task.topic}" and its log? This can't be undone.`)) go(() => removeTask(task.id));
          }}
        >
          Delete
        </button>
        {error && (
          <span role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
            {error}
          </span>
        )}
      </div>
        </>
      )}
    </div>
  );
}
