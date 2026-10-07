"use client";

import { useState, useTransition } from "react";
import { approve, reject } from "@/server/actions/suggestions";
import type { SuggestionView } from "@/server/services/suggestions";
import { formatDate, parseDateInput } from "@/lib/dates";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

const TEXT_KINDS = ["PHASE_UPDATE", "ITEM_UPDATE", "NOTE"];

// One proposed change from the email reader. Approve applies it (after you pick the project and reword the text if
// needed); Reject discards it. Nothing changes until Approve.
export function SuggestionCard({ s, projects }: { s: SuggestionView; projects: { id: string; name: string }[] }) {
  const pending = s.status === "PENDING";
  const [projectId, setProjectId] = useState(s.projectId ?? "");
  const [editing, setEditing] = useState(false);
  const textPayload = "text" in s.payload ? s.payload.text : "";
  const [text, setText] = useState(textPayload);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, startTransition] = useTransition();
  const needsProject = s.kind !== "NOTE";

  const received = s.sourceReceivedAt ? formatDate(parseDateInput(s.sourceReceivedAt.slice(0, 10))) : null;

  return (
    <section style={{ ...cardStyle, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 999, padding: "2px 10px", background: "#DCE8FB", color: "#1D4F9F" }}>{s.kindText}</span>
        <strong style={{ color: NAVY, fontSize: 15 }}>{s.summary}</strong>
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

      {pending ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          {needsProject && (
            <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ ...inputStyle, maxWidth: 280, borderColor: projectId ? undefined : "#F0C069" }}>
              <option value="">{s.projectRef ? `Pick the project (email says “${s.projectRef}”)` : "Pick the project"}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
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
                const result = await approve(s.id, { projectId: needsProject ? projectId : null, ...(editing || text !== textPayload ? { text } : {}) });
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
        </div>
      ) : (
        <div style={{ fontSize: 13, color: TEXT_MUTED }}>
          {s.status === "APPROVED" ? "Approved" : "Rejected"}
          {s.projectName ? ` · ${s.projectName}` : ""}
          {s.resultNote ? ` · ${s.resultNote}` : ""}
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
