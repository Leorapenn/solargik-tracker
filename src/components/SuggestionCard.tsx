"use client";

import { useState, useTransition } from "react";
import { approve, reject } from "@/server/actions/suggestions";
import type { SuggestionView } from "@/server/services/suggestions";
import { formatDate, parseDateInput } from "@/lib/dates";
import { DateField } from "@/components/DateField";
import { TaskForm, type PersonOption } from "@/components/TaskForm";
import { taskPrefillFromSuggestion } from "@/lib/tasks";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// The fields of a change-order proposal a reviewer can correct before approving (text, as typed).
type ChangeOrderFields = { reason: string; amount: string; dateSent: string; invoicedDate: string; invoiceStatus: string; paymentTermsDays: string };
const fieldLabel = { fontSize: 12.5, fontWeight: 700, color: NAVY, display: "flex", flexDirection: "column" as const, gap: 4 };

const TEXT_KINDS = ["PHASE_UPDATE", "ITEM_UPDATE", "NOTE", "ACTION_ITEM", "CORRESPONDENCE_NOTE"];
// these only record that someone looked at them, so approving needs no project (but one can still be picked)
const REVIEW_ONLY = ["NOTE", "ACTION_ITEM", "CORRESPONDENCE_NOTE"];
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
}: {
  s: SuggestionView;
  projects: { id: string; name: string; currency: string; customerId: string }[];
  customers: { id: string; name: string }[];
  people: PersonOption[];
}) {
  const pending = s.status === "PENDING";
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
  const projectCurrency = projects.find((x) => x.id === projectId)?.currency ?? null;
  const emailCurrency = p.kind === "CHANGE_ORDER" ? p.currency : null;
  const currencyClash = Boolean(emailCurrency && projectCurrency && emailCurrency !== projectCurrency);
  const [editing, setEditing] = useState(false);
  const textPayload = "text" in s.payload ? s.payload.text : "";
  const [text, setText] = useState(textPayload);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const needsProject = !REVIEW_ONLY.includes(s.kind);
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

      {extraLinks.length > 0 && (
        <div style={{ fontSize: 13, display: "flex", gap: 14, flexWrap: "wrap" }}>
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
          <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inputStyle, maxWidth: 280, borderColor: projectId || !needsProject ? undefined : "#F0C069" }}>
            <option value="">{s.projectRef ? `Pick the project (email says “${s.projectRef}”)` : needsProject ? "Pick the project" : "No project (optional)"}</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {!needsProject && !projectId && (
            <select aria-label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={{ ...inputStyle, maxWidth: 260, borderColor: customerId ? undefined : "#F0C069" }}>
              <option value="">General item: pick the customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (general)
                </option>
              ))}
            </select>
          )}
          {TEXT_KINDS.includes(s.kind) && (
            <button type="button" style={secondaryButton} onClick={() => setEditing(!editing)}>
              {editing ? "Done editing" : "Edit text"}
            </button>
          )}
          <button
            type="button"
            style={primaryButton}
            disabled={busy || (needsProject && !projectId)}
            onClick={() =>
              startTransition(async () => {
                setMessage(null);
                const result = await approve(s.id, { projectId: projectId || null, ...(!projectId ? { customerId: customerId || null } : {}), ...(editing || text !== textPayload ? { text } : {}), ...(isChangeOrder ? { fields: co } : {}) });
                setMessage(result.ok ? { ok: true, text: result.note } : { ok: false, text: result.error });
              })
            }
          >
            {busy ? "Working…" : "Approve"}
          </button>
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
          <button type="button" style={secondaryButton} disabled={busy} title="Start a task from this proposal. It does not approve or reject it." onClick={() => setCreatingTask((o) => !o)}>
            {creatingTask ? "Cancel task" : "Create task"}
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: TEXT_MUTED, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>
            {s.status === "APPROVED" ? "Approved" : "Rejected"}
            {s.projectName ? ` · ${s.projectName}` : s.customerName ? ` · ${s.customerName} (general)` : ""}
            {s.resultNote ? ` · ${s.resultNote}` : ""}
          </span>
          <button type="button" style={{ ...secondaryButton, padding: "4px 12px", fontSize: 13 }} title="Start a task from this proposal" onClick={() => setCreatingTask((o) => !o)}>
            {creatingTask ? "Cancel task" : "Create task"}
          </button>
        </div>
      )}

      {creatingTask && (
        <TaskForm
          customers={customers}
          projects={projects.map((x) => ({ id: x.id, name: x.name, customerId: x.customerId }))}
          people={people}
          prefill={taskPrefillFromSuggestion(s, projects.find((x) => x.id === projectId)?.customerId ?? (customerId || s.customerId || ""), projectId)}
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
