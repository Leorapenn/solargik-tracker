"use client";

import { useState, useTransition } from "react";
import { saveProjectSummary } from "@/server/actions/statusUpdates";
import { MAX_STATUS_TEXT } from "@/lib/statusUpdate";
import { NAVY, TEXT_MUTED, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// The project's status summary: generated from the phases' statuses unless someone typed over it.
export function ProjectSummary({ projectId, text, manual }: { projectId: string; text: string; manual: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await saveProjectSummary(projectId, value);
      if (result.ok) setOpen(false);
      else setError(result.error);
    });
  };

  const badge = {
    fontSize: 11.5,
    fontWeight: 700,
    borderRadius: 999,
    padding: "2px 9px",
    background: manual ? "#FFF1D6" : "#E4E6EC",
    color: manual ? "#9A4B00" : TEXT_MUTED,
  };

  if (open) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          aria-label="Project status summary"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          maxLength={MAX_STATUS_TEXT}
          autoFocus
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }}
        />
        {error && (
          <div role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" disabled={pending} style={primaryButton} onClick={() => save(draft)}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" style={secondaryButton} onClick={() => setOpen(false)}>
            Cancel
          </button>
          {manual && (
            <button type="button" disabled={pending} style={secondaryButton} onClick={() => save("")}>
              Back to automatic
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</span>
        <span style={badge}>{manual ? "Edited by hand" : "Automatic"}</span>
      </div>
      <div style={{ display: "flex", gap: 14 }}>
        <button
          type="button"
          style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: NAVY, cursor: "pointer" }}
          onClick={() => {
            setDraft(text);
            setError(null);
            setOpen(true);
          }}
        >
          Edit summary
        </button>
        {manual && (
          <button
            type="button"
            disabled={pending}
            style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: NAVY, cursor: "pointer" }}
            onClick={() => save("")}
          >
            Back to automatic
          </button>
        )}
      </div>
      {error && (
        <div role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
          {error}
        </div>
      )}
    </div>
  );
}
