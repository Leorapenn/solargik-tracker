"use client";

import { useState, useTransition } from "react";
import { saveSharePointLink } from "@/server/actions/sharepointLink";
import { NAVY, TEXT_MUTED, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

// "Open in SharePoint": the link to the project's folder, with a small Add / Edit for changing it.
export function SharePointLink({ projectId, link }: { projectId: string; link: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(link ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: string) => {
    setError(null);
    startTransition(async () => {
      const result = await saveSharePointLink(projectId, value);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>SharePoint folder</span>
        <input
          aria-label="SharePoint folder link"
          placeholder="Paste the link to this project's SharePoint folder"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={{ ...inputStyle, width: "min(640px, 100%)" }}
        />
        {error && (
          <div role="alert" style={{ color: "#8C1D18", fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" disabled={pending} style={primaryButton} onClick={() => save(draft)}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" style={secondaryButton} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>SharePoint folder</span>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
          Open in SharePoint
        </a>
      ) : (
        <span style={{ color: TEXT_MUTED }}>Not linked</span>
      )}
      <button
        type="button"
        style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: NAVY, cursor: "pointer" }}
        onClick={() => {
          setDraft(link ?? "");
          setError(null);
          setEditing(true);
        }}
      >
        {link ? "Edit" : "Add"}
      </button>
    </div>
  );
}
