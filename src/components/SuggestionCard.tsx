"use client";

import { useState, useTransition } from "react";
import { approve, approveAsTask, approveForTask, reject } from "@/server/actions/suggestions";
import type { SuggestionView } from "@/server/services/suggestions";
import type { OpenTaskChoice } from "@/server/services/taskMatch";
import { TASK_OUTCOMES, matchTasksToEmail } from "@/lib/taskMatch";
import { formatDate, parseDateInput } from "@/lib/dates";
import { DateField } from "@/components/DateField";
import { TaskForm, type PersonOption } from "@/components/TaskForm";
import { taskFromActionItem, taskPrefillFromSuggestion } from "@/lib/tasks";
import { NEW_PROJECT_PROFILE_FIELDS } from "@/lib/newProject";
import { CHOICES, type ChoiceField } from "@/lib/projectProfile";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// The fields of a change-order proposal a reviewer can correct before approving (text, as typed).
type ChangeOrderFields = { reason: string; amount: string; dateSent: string; invoicedDate: string; invoiceStatus: string; paymentTermsDays: string };
const fieldLabel = { fontSize: 12.5, fontWeight: 700, color: NAVY, display: "flex", flexDirection: "column" as const, gap: 4 };

const TEXT_KINDS = ["PHASE_UPDATE", "ITEM_UPDATE", "NOTE", "ACTION_ITEM", "CORRESPONDENCE_NOTE", "TASK_UPDATE"];
// a note only records that someone looked at it, and an action item becomes a task: neither needs a project (one can
// still be picked), but an action item needs a customer or a project (the task is for a customer)
const REVIEW_ONLY = ["NOTE", "ACTION_ITEM", "CORRESPONDENCE_NOTE", "TASK_UPDATE"];

const taskLabel = (t: OpenTaskChoice) => {
  const label = `${t.customerName}${t.projectName ? ` · ${t.projectName}` : ""}: ${t.topic}`;
  return label.length > 110 ? `${label.slice(0, 109)}…` : label;
};
// a new project is not about an existing one: it needs a customer, not a project
const CURRENCY_CODES = ["USD", "EUR", "ILS", "GBP", "CHF", "CAD"];
const CONFIDENCE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  HIGH: { bg: "#D8F5E3", text: "#047857", label: "High confidence" },
  MEDIUM: { bg: "#FFF1D0", text: "#8A5A00", label: "Medium confidence" },
  LOW: { bg: "#FBE0DE", text: "#8C1D18", label: "Low confidence" },
};

// A saved file in SharePoint is shown by its name; anything else (the Outlook link) says it is the email.
function fileLabel(url: string | null | undefined, name: string): string {
  try {
    return url && new URL(url).hostname.endsWith("sharepoint.com") ? `${name} (SharePoint)` : `${name} (the email)`;
  } catch {
    return name;
  }
}

// One proposed change from the email reader. Approve applies it (after you pick the project and reword the text if
// needed); Reject discards it. Nothing changes until Approve.
export function SuggestionCard({
  s,
  projects,
  customers,
  people,
  openTasks = [],
}: {
  s: SuggestionView;
  projects: { id: string; name: string; currency: string; customerId: string }[];
  customers: { id: string; name: string }[];
  people: PersonOption[];
  openTasks?: OpenTaskChoice[];
}) {
  const pending = s.status === "PENDING";
  // An open task this email may be about: the same email chain, else the same subject in the same project or customer.
  // A task update names its task itself; a note in the task's chain can be approved as the answer to it.
  const isTaskUpdate = s.payload.kind === "TASK_UPDATE";
  const canAnswerTask = pending && (s.payload.kind === "NOTE" || s.payload.kind === "CORRESPONDENCE_NOTE");
  const match = pending ? matchTasksToEmail({ conversationId: s.conversationId, sourceSubject: s.sourceSubject, projectId: s.projectId, customerId: s.customerId }, openTasks) : null;
  const candidates = match ? openTasks.filter((t) => match.candidateIds.includes(t.id)) : [];
  // the picker lists the likely tasks first, then the rest of that customer's open tasks (every open task when the customer is unknown)
  const taskChoices = [...candidates, ...openTasks.filter((t) => !candidates.some((c) => c.id === t.id) && (!s.customerId || t.customerId === s.customerId))];
  const [taskId, setTaskId] = useState(s.payload.kind === "TASK_UPDATE" ? s.payload.taskId : (match?.taskId ?? ""));
  const [outcome, setOutcome] = useState<string>(s.payload.kind === "TASK_UPDATE" ? s.payload.outcome : "RESOLVED");
  // "Create task": opens the New task form prefilled from this proposal (nothing is saved until Add task there)
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [projectId, setProjectId] = useState(s.projectId ?? "");
  // a note or action item with no project can be filed on the customer's page instead
  const [customerId, setCustomerId] = useState(s.customerId ?? "");
  const p = s.payload;
  const isChangeOrder = p.kind === "CHANGE_ORDER" || p.kind === "CHANGE_ORDER_UPDATE";
  const isNewChangeOrder = p.kind === "CHANGE_ORDER";
  const [co, setCo] = useState<ChangeOrderFields>({
    reason: p.kind === "CHANGE_ORDER" ? p.reason : "",
    amount: p.kind === "CHANGE_ORDER" ? (p.amount ?? "") : "",
    dateSent: p.kind === "CHANGE_ORDER" ? (p.dateSent ?? "") : "",
    invoicedDate: p.kind === "CHANGE_ORDER" || p.kind === "CHANGE_ORDER_UPDATE" ? (p.invoicedDate ?? "") : "",
    invoiceStatus: p.kind === "CHANGE_ORDER" || p.kind === "CHANGE_ORDER_UPDATE" ? (p.invoiceStatus ?? "") : "",
    paymentTermsDays: (p.kind === "CHANGE_ORDER" || p.kind === "CHANGE_ORDER_UPDATE") && p.paymentTermsDays !== null ? String(p.paymentTermsDays) : "",
  });
  const isNewProject = p.kind === "NEW_PROJECT";
  // a proposal to create a task: "Create task" opens the task form (owner, follow-up date, details, project...) and confirming it
  // creates the task and approves the proposal in one step
  const isTaskProposal = p.kind === "ACTION_ITEM";
  const [np, setNp] = useState({
    number: p.kind === "NEW_PROJECT" ? p.number : "",
    name: p.kind === "NEW_PROJECT" ? p.name : "",
    country: p.kind === "NEW_PROJECT" ? (p.country ?? "") : "",
    capacityKwp: p.kind === "NEW_PROJECT" ? (p.capacityKwp ?? "") : "",
    contractAmount: p.kind === "NEW_PROJECT" ? (p.contractAmount ?? "") : "",
    currency: p.kind === "NEW_PROJECT" ? (p.currency ?? "") : "",
    signedDate: p.kind === "NEW_PROJECT" ? (p.signedDate ?? "") : "",
  });
  // the contract details the proposal carries into the profile (each can be corrected or cleared before approving)
  const [prof, setProf] = useState<Record<string, string>>(p.kind === "NEW_PROJECT" ? { ...p.profile } : {});
  const sources: Record<string, string> = p.kind === "NEW_PROJECT" ? p.sources : {};
  const projectCurrency = projects.find((x) => x.id === projectId)?.currency ?? null;
  const emailCurrency = p.kind === "CHANGE_ORDER" ? p.currency : null;
  const currencyClash = Boolean(emailCurrency && projectCurrency && emailCurrency !== projectCurrency);
  const [editing, setEditing] = useState(false);
  const textPayload = "text" in s.payload ? s.payload.text : "";
  const [text, setText] = useState(textPayload);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const needsProject = !REVIEW_ONLY.includes(s.kind) && !isNewProject;
  const confidence = s.confidence ? CONFIDENCE_STYLE[s.confidence] : null;

  const received = s.sourceReceivedAt ? formatDate(parseDateInput(s.sourceReceivedAt.slice(0, 10))) : null;

  // the other files an approval will link: a contract, a document with a note, a milestone's invoice, proofs of payment
  const extraLinks: { label: string; href: string }[] = [];
  if (p.kind === "CONTRACT_DOCUMENT") extraLinks.push({ label: fileLabel(p.fileLink, "Contract file"), href: p.fileLink });
  if (p.kind === "CORRESPONDENCE_NOTE" && p.fileLink) extraLinks.push({ label: fileLabel(p.fileLink, "Document"), href: p.fileLink });
  if (p.kind === "MILESTONE_UPDATE" && p.invoiceLink) extraLinks.push({ label: fileLabel(p.invoiceLink, "Invoice file"), href: p.invoiceLink });
  if ((p.kind === "MILESTONE_UPDATE" || p.kind === "CHANGE_ORDER_UPDATE") && p.payslipLink) extraLinks.push({ label: fileLabel(p.payslipLink, "Proof of payment"), href: p.payslipLink });

  return (
    <section style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 10px", background: "#DCE8FB", color: "#1D4F9F" }}>{s.kindText}</span>
        <strong style={{ color: NAVY, fontSize: 15 }}>{s.summary}</strong>
        {confidence && <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 10px", background: confidence.bg, color: confidence.text }}>{confidence.label}</span>}
      </div>

      <div style={{ fontSize: 13, color: TEXT_MUTED }}>
        {[s.sourceFrom && `From ${s.sourceFrom}`, s.sourceSubject && `“${s.sourceSubject}”`, received].filter(Boolean).join(" · ") || "No source details"}
        {s.sourceLink && (
          <>
            {" · "}
            <a href={s.sourceLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
              Open email
            </a>
          </>
        )}
        {s.sourceMessageId && (
          <div title={s.sourceMessageId} style={{ fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>
            Outlook message ID: {s.sourceMessageId}
          </div>
        )}
      </div>

      {s.evidence && (
        <blockquote style={{ margin: 0, padding: "6px 12px", borderLeft: `3px solid ${ROW_DIVIDER}`, color: TEXT_MUTED, fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{s.evidence}</blockquote>
      )}

      <div style={{ fontSize: 14.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        <span style={{ color: TEXT_MUTED }}>{pending ? "If approved: " : "Proposed: "}</span>
        {editing ? null : s.description}
      </div>
      {editing && (
        <textarea
          aria-label="Edit the text before approving"
          rows={4}
          value={text}
          maxLength={5000}
          onChange={(e) => setText(e.target.value)}
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }}
        />
      )}

      {pending && s.kind === "ACTION_ITEM" && candidates.length > 0 && (
        <div style={{ fontSize: 13.5, padding: "8px 12px", borderRadius: 8, background: "#FFF6E0", color: "#6B4A00" }}>
          An open task already exists in this email chain: {candidates.map((t) => `“${t.topic}”`).join(", ")}. Check the Tasks tab before creating another.
        </div>
      )}
      {canAnswerTask && candidates.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px", border: "1px solid #BFD3F2", borderRadius: 10, background: "#F2F7FE" }}>
          <div style={{ fontSize: 13.5, color: NAVY }}>
            <strong>{candidates.length === 1 ? "This looks like an answer to an open task" : "This may be an answer to one of these open tasks"}</strong>
            {match?.how === "conversation" ? " (same email chain)" : " (same subject and project)"}:{" "}
            {candidates.length === 1 ? `“${candidates[0].topic}”${candidates[0].ownerName ? `, owner ${candidates[0].ownerName}` : ""}.` : "pick the task, then choose what this email does to it."}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {candidates.length > 1 && (
              <select aria-label="Task this email answers" value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ ...inputStyle, maxWidth: 360, borderColor: taskId ? undefined : "#F0C069" }}>
                <option value="">Pick the task</option>
                {candidates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {taskLabel(t)}
                  </option>
                ))}
              </select>
            )}
            <select aria-label="What this email does to the task" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...inputStyle, maxWidth: 260 }}>
              {TASK_OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              style={primaryButton}
              disabled={busy || !taskId}
              title="Adds this email to the task's log and approves this note. It does not change anything else."
              onClick={() =>
                startTransition(async () => {
                  setMessage(null);
                  const result = await approveForTask(s.id, taskId, outcome, editing || text !== textPayload ? text : undefined);
                  setMessage(result.ok ? { ok: true, text: result.note } : { ok: false, text: result.error });
                })
              }
            >
              {busy ? "Working…" : outcome === "RESOLVED" ? "Resolve task" : "Update task"}
            </button>
          </div>
        </div>
      )}

      {pending && isChangeOrder && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", border: `1px solid ${ROW_DIVIDER}`, borderRadius: 10, background: "#FAFBFC" }}>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
            {isNewChangeOrder ? "Check these before approving: approving creates the change order on the Payments page." : "Check these before approving: approving updates that change order on the Payments page."} Empty means not stated.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            {isNewChangeOrder && (
              <label style={{ ...fieldLabel, flex: "1 1 100%" }}>
                Reason
                <input value={co.reason} maxLength={500} onChange={(e) => setCo({ ...co, reason: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
              </label>
            )}
            {isNewChangeOrder && (
              <label style={fieldLabel}>
                Amount{projectCurrency ? ` (${projectCurrency})` : emailCurrency ? ` (${emailCurrency})` : ""}
                <input value={co.amount} inputMode="decimal" onChange={(e) => setCo({ ...co, amount: e.target.value })} placeholder="e.g. 12500.50" style={{ ...inputStyle, width: 150 }} />
              </label>
            )}
            {isNewChangeOrder && (
              <div style={fieldLabel}>
                Date sent
                <DateField ariaLabel="Date the change order was sent" value={co.dateSent || null} onCommit={(c) => setCo({ ...co, dateSent: c.date ?? "" })} />
              </div>
            )}
            <div style={fieldLabel}>
              Invoice date
              <DateField ariaLabel="Invoice date" value={co.invoicedDate || null} onCommit={(c) => setCo({ ...co, invoicedDate: c.date ?? "" })} />
            </div>
            <label style={fieldLabel}>
              Invoice status
              <select value={co.invoiceStatus} onChange={(e) => setCo({ ...co, invoiceStatus: e.target.value })} style={{ ...inputStyle, width: 130 }}>
                <option value="">Not stated</option>
                <option value="SENT">Sent</option>
                <option value="PAID">Paid</option>
              </select>
            </label>
            <label style={fieldLabel}>
              Terms (days)
              <input value={co.paymentTermsDays} inputMode="numeric" onChange={(e) => setCo({ ...co, paymentTermsDays: e.target.value })} placeholder="e.g. 30" style={{ ...inputStyle, width: 100 }} />
            </label>
          </div>
          {(p.kind === "CHANGE_ORDER" || p.kind === "CHANGE_ORDER_UPDATE") && (p.fileLink || p.invoiceLink || (p.kind === "CHANGE_ORDER" && s.sourceLink)) && (
            <div style={{ fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap" }}>
              {(p.fileLink || (p.kind === "CHANGE_ORDER" && s.sourceLink)) && (
                <a href={p.fileLink ?? s.sourceLink ?? "#"} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                  {fileLabel(p.fileLink ?? s.sourceLink, "Change order file")}
                </a>
              )}
              {p.invoiceLink && (
                <a href={p.invoiceLink} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                  {fileLabel(p.invoiceLink, "Invoice file")}
                </a>
              )}
              <span style={{ color: TEXT_MUTED }}>These links will be saved on the change order.</span>
            </div>
          )}
          {currencyClash && (
            <div role="alert" style={{ fontSize: 13.5, color: "#8C1D18" }}>
              The email gives the amount in {emailCurrency}, but this project&apos;s payments are in {projectCurrency}. Approving will be refused until that is sorted out.
            </div>
          )}
        </div>
      )}

      {pending && isNewProject && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", border: `1px solid ${ROW_DIVIDER}`, borderRadius: 10, background: "#FAFBFC" }}>
          <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
            Check these before approving: approving creates the project <strong>{np.number || "?"}-{np.name || "?"}</strong> in 360 with the standard phases and items, for the customer picked below. Empty means not stated.
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>
              Project number
              <input value={np.number} inputMode="numeric" maxLength={4} onChange={(e) => setNp({ ...np, number: e.target.value })} style={{ ...inputStyle, width: 100 }} />
            </label>
            <label style={{ ...fieldLabel, flex: "1 1 220px" }}>
              Name (without the number)
              <input value={np.name} maxLength={120} onChange={(e) => setNp({ ...np, name: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </label>
            <label style={fieldLabel}>
              Country
              <input value={np.country} maxLength={80} onChange={(e) => setNp({ ...np, country: e.target.value })} style={{ ...inputStyle, width: 140 }} />
            </label>
            <label style={fieldLabel}>
              Capacity (kWp)
              <input value={np.capacityKwp} inputMode="decimal" onChange={(e) => setNp({ ...np, capacityKwp: e.target.value })} placeholder="e.g. 996.84" style={{ ...inputStyle, width: 120 }} />
            </label>
            <label style={fieldLabel}>
              Contract amount
              <input value={np.contractAmount} inputMode="decimal" onChange={(e) => setNp({ ...np, contractAmount: e.target.value })} placeholder="e.g. 275000" style={{ ...inputStyle, width: 130 }} />
            </label>
            <label style={fieldLabel}>
              Currency
              <select value={np.currency} onChange={(e) => setNp({ ...np, currency: e.target.value })} style={{ ...inputStyle, width: 100 }}>
                <option value="">EUR (default)</option>
                {CURRENCY_CODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details open={Object.keys(prof).length > 0 || Boolean(np.signedDate)} style={{ marginTop: 2 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: NAVY }}>
              Contract details for the project profile ({Object.values(prof).filter((v) => v.trim()).length + (np.signedDate ? 1 : 0)})
            </summary>
            <div style={{ fontSize: 12.5, color: TEXT_MUTED, margin: "6px 0 8px" }}>
              Read from the signed document; the sentence it came from is shown under each one. Empty means not stated. Approving fills these in the profile; you can change any of them later.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={fieldLabel}>
                Contract signing date
                <DateField ariaLabel="Contract signing date" value={np.signedDate || null} onCommit={(c) => setNp({ ...np, signedDate: c.date ?? "" })} />
                {sources.signedDate && <span style={{ fontWeight: 400, color: TEXT_MUTED }}>“{sources.signedDate}”</span>}
              </div>
              {NEW_PROJECT_PROFILE_FIELDS.map((f) => (
                <div key={f.key} style={fieldLabel}>
                  <span id={`np-${s.id}-${f.key}`}>{f.label}</span>
                  {f.type === "date" ? (
                    <DateField ariaLabel={f.label} value={prof[f.key] || null} onCommit={(c) => setProf({ ...prof, [f.key]: c.date ?? "" })} />
                  ) : f.type === "choice" ? (
                    <select aria-labelledby={`np-${s.id}-${f.key}`} value={prof[f.key] ?? ""} onChange={(e) => setProf({ ...prof, [f.key]: e.target.value })} style={{ ...inputStyle, width: 200 }}>
                      <option value="">Not stated</option>
                      {CHOICES[f.key as ChoiceField].map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  ) : f.type === "short" ? (
                    <input aria-labelledby={`np-${s.id}-${f.key}`} value={prof[f.key] ?? ""} maxLength={200} onChange={(e) => setProf({ ...prof, [f.key]: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
                  ) : (
                    <textarea aria-labelledby={`np-${s.id}-${f.key}`} rows={2} value={prof[f.key] ?? ""} maxLength={4000} onChange={(e) => setProf({ ...prof, [f.key]: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" }} />
                  )}
                  {sources[f.key] && <span style={{ fontWeight: 400, color: TEXT_MUTED }}>“{sources[f.key]}”</span>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {extraLinks.length > 0 && (        <div style={{ fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap" }}>
          {extraLinks.map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
              {l.label}
            </a>
          ))}
          {pending && <span style={{ color: TEXT_MUTED }}>{p.kind === "CORRESPONDENCE_NOTE" ? "Open it to check it before approving." : "These links will be saved when you approve."}</span>}
        </div>
      )}

      {pending ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {isTaskUpdate && (
            <>
              <select aria-label="Task" value={taskId} onChange={(e) => setTaskId(e.target.value)} style={{ ...inputStyle, maxWidth: 360, borderColor: taskId ? undefined : "#F0C069" }}>
                <option value="">Pick the task</option>
                {taskChoices.map((t) => (
                  <option key={t.id} value={t.id}>
                    {taskLabel(t)}
                  </option>
                ))}
              </select>
              <select aria-label="What this email does to the task" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ ...inputStyle, maxWidth: 260 }}>
                {TASK_OUTCOMES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </>
          )}
          {!isNewProject && !isTaskProposal && !isTaskUpdate && <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inputStyle, maxWidth: 280, borderColor: projectId || !needsProject ? undefined : "#F0C069" }}>
            <option value="">{s.projectRef ? `Pick the project (email says “${s.projectRef}”)` : needsProject ? "Pick the project" : "No project (optional)"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>}
          {isNewProject && (
            <select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ ...inputStyle, maxWidth: 260, borderColor: customerId ? undefined : "#F0C069" }}>
              <option value="">Pick the customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {!needsProject && !isNewProject && !isTaskProposal && !isTaskUpdate && !projectId && (
            <select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ ...inputStyle, maxWidth: 260, borderColor: customerId ? undefined : "#F0C069" }}>
              <option value="">{s.kind === "ACTION_ITEM" ? "Pick the customer for the task" : "General item: pick the customer"}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (general)
                </option>
              ))}
            </select>
          )}
          {TEXT_KINDS.includes(s.kind) && !isTaskProposal && (
            <button type="button" style={secondaryButton} onClick={() => setEditing(!editing)}>
              {editing ? "Done editing" : "Edit text"}
            </button>
          )}
          {isTaskProposal && (
            <button type="button" style={primaryButton} disabled={busy} title="Opens the task so you can edit it and fill in the details. Confirming creates the task and approves this proposal." onClick={() => setCreatingTask((o) => !o)}>
              {creatingTask ? "Cancel task" : "Create task"}
            </button>
          )}
          {isTaskUpdate && (
            <button
              type="button"
              style={primaryButton}
              disabled={busy || !taskId}
              title="Adds this to the task's log and sets the task's status as chosen. Nothing else changes."
              onClick={() =>
                startTransition(async () => {
                  setMessage(null);
                  const result = await approveForTask(s.id, taskId, outcome, editing || text !== textPayload ? text : undefined);
                  setMessage(result.ok ? { ok: true, text: result.note } : { ok: false, text: result.error });
                })
              }
            >
              {busy ? "Working…" : outcome === "RESOLVED" ? "Resolve task" : "Update task"}
            </button>
          )}
          {!isTaskProposal && !isTaskUpdate && (
          <button
            type="button"
            style={primaryButton}
            disabled={busy || (needsProject && !projectId) || (isNewProject && (!customerId || !np.number.trim() || !np.name.trim()))}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await approve(s.id, { projectId: isNewProject ? null : projectId || null, ...(!projectId || isNewProject ? { customerId: customerId || null } : {}), ...(editing || text !== textPayload ? { text } : {}), ...(isChangeOrder ? { fields: co } : {}), ...(isNewProject ? { fields: { ...np, ...prof } } : {}) });
                setMessage(result.ok ? { ok: true, text: result.note } : { ok: false, text: result.error });
              })
            }
          >
            {busy ? "Working…" : "Approve"}
          </button>
          )}
          <button
            type="button"
            style={secondaryButton}
            disabled={busy}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await reject(s.id);
                if (!result.ok) setMessage({ ok: false, text: result.error });
              })
            }
          >
            Reject
          </button>
          {s.kind !== "ACTION_ITEM" && (
            <button type="button" style={secondaryButton} disabled={busy} title="Start a task from this proposal. It does not approve or reject it." onClick={() => setCreatingTask((o) => !o)}>
              {creatingTask ? "Cancel task" : "Create task"}
            </button>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: TEXT_MUTED, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            {s.status === "APPROVED" ? "Approved" : "Rejected"}
            {s.projectName ? ` · ${s.projectName}` : s.customerName ? ` · ${s.customerName} (general)` : ""}
            {s.resultNote ? ` · ${s.resultNote}` : ""}
          </span>
          {!(isTaskProposal && s.status === "APPROVED") && (
            <button type="button" style={{ ...secondaryButton, padding: "4px 12px", fontSize: 13 }} title="Start a task from this proposal" onClick={() => setCreatingTask((o) => !o)}>
              {creatingTask ? "Cancel task" : "Create task"}
            </button>
          )}
        </div>
      )}

      {creatingTask && (
        <TaskForm
          customers={customers}
          projects={projects.map((x) => ({ id: x.id, name: x.name, customerId: x.customerId }))}
          people={people}
          prefill={
            p.kind === "ACTION_ITEM"
              ? taskFromActionItem(
                  { summary: s.summary, kindText: s.kindText, sourceFrom: s.sourceFrom, sourceSubject: s.sourceSubject, sourceReceivedAt: s.sourceReceivedAt, sourceLink: s.sourceLink, text: p.text, who: p.who, by: p.by },
                  projects.find((x) => x.id === s.projectId)?.customerId ?? s.customerId ?? "",
                  s.projectId ?? "",
                  people,
                )
              : taskPrefillFromSuggestion(s, projects.find((x) => x.id === projectId)?.customerId ?? (customerId || s.customerId || ""), projectId)
          }
          submit={isTaskProposal && pending ? (data) => approveAsTask(s.id, data) : undefined}
          submitLabel={isTaskProposal && pending ? "Create task" : undefined}
          onDone={() => setCreatingTask(false)}
          onSaved={() => {
            setCreatingTask(false);
            setTaskCreated(true);
          }}
        />
      )}
      {taskCreated && (
        <div role="status" style={{ fontSize: 13.5, color: "#047857" }}>
          Task created. <a href="/tasks" style={{ color: NAVY, fontWeight: 700 }}>Open Tasks</a>
        </div>
      )}

      {message && (
        <div role={message.ok ? "status" : "alert"} style={{ fontSize: 13.5, color: message.ok ? "#047857" : "#8C1D18" }}>
          {message.text}
        </div>
      )}
    </section>
  );
}
