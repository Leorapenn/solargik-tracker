"use client";

import { useState, useTransition } from "react";
import { savePhaseUpdate, saveSubStageUpdate } from "@/server/actions/statusUpdates";
import { MAX_STATUS_TEXT } from "@/lib/statusUpdate";
import { NAVY, TEXT_MUTED, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// A phase's typed status update (long text) with the day it was last changed, which is stamped by the
// server. `compact` is the Phases-tab cell: two lines at most, the rest on hover. `editable` shows the
// Add / Edit button (on the Phases tab only while the page's Edit mode is on).
export function PhaseUpdate({
  phaseId,
  kind = "phase",
  text,
  updatedOn,
  editable,
  compact = false,
  label,
}: {
  // the id of the phase, or of the sub-phase (item) when kind is "subStage"
  phaseId: string;
  kind?: "phase" | "subStage";
  text: string | null;
  updatedOn: string | null; // already formatted, e.g. "07 Oct 2026"
  editable: boolean;
  compact?: boolean;
  label: string; // for screen readers, e.g. "Design status update for Barge 2"
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setDraft(text ?? "");
    setError(null);
    setOpen(true);
  };
  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = kind === "subStage" ? await saveSubStageUpdate(phaseId, draft) : await savePhaseUpdate(phaseId, draft);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  };

  const linkButton = {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 12,
    fontWeight: 600,
    color: NAVY,
    cursor: "pointer",
    textAlign: "left" as const,
    alignSelf: "flex-start" as const,
  };

  if (open) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: compact ? 200 : undefined }}>
        <textarea
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={compact ? 5 : 4}
          maxLength={MAX_STATUS_TEXT}
          autoFocus
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        {error && (
          <div role="alert" style={{ color: "#8C1D18", fontSize: 12 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" disabled={pending} style={{ ...primaryButton, padding: "5px 10px", fontSize: 12 }} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" style={{ ...secondaryButton, padding: "5px 10px", fontSize: 12 }} onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {text ? (
        <div
          style={{
            fontSize: compact ? 12 : 14,
            color: compact ? TEXT_MUTED : undefined,
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            ...(compact ? { display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden", maxWidth: 220 } : {}),
          }}
        >
          {text}
        </div>
      ) : (
        !compact && <div style={{ fontSize: 13, color: TEXT_MUTED }}>No update yet</div>
      )}
      {text && updatedOn && !compact && <div style={{ fontSize: 12, color: TEXT_MUTED }}>Updated {updatedOn}</div>}
      {editable && (
        <button type="button" style={linkButton} onClick={start}>
          {text ? "Edit update" : "Add update"}
        </button>
      )}
    </div>
  );
}
