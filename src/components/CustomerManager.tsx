"use client";

import { useState, useTransition } from "react";
import { saveCustomerManager } from "@/server/actions/customerManager";
import { NAVY, TEXT_MUTED, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

type Manager = { name: string; email: string; phone: string };

// "Customer project manager": who the project manager is on the customer's side. Pick one of the customer's
// contacts (copied in) or type it; the Edit button reveals the form.
export function CustomerManager({ projectId, current, contacts }: { projectId: string; current: Manager; contacts: Manager[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Manager>(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: Manager) => {
    setError(null);
    startTransition(async () => {
      const result = await saveCustomerManager(projectId, value);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  };

  const field = (label: string, key: keyof Manager, type = "text") => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: TEXT_MUTED }}>
      {label}
      <input type={type} value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} style={{ ...inputStyle, width: 220 }} />
    </label>
  );

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Customer project manager</span>
        {contacts.length > 0 && (
          <select
            aria-label="Pick from the customer's contacts"
            value=""
            style={{ ...inputStyle, width: 260 }}
            onChange={(e) => {
              const picked = contacts[Number(e.target.value)];
              if (picked) setDraft(picked);
            }}
          >
            <option value="">Pick from the customer&apos;s contacts…</option>
            {contacts.map((c, i) => (
              <option key={`${c.name}-${i}`} value={i}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {field("Name", "name")}
          {field("Email", "email", "email")}
          {field("Phone", "phone", "tel")}
        </div>
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
          {current.name && (
            <button type="button" disabled={pending} style={secondaryButton} onClick={() => save({ name: "", email: "", phone: "" })}>
              Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 14 }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Customer project manager</span>
      {current.name ? (
        <>
          <strong>{current.name}</strong>
          {current.email && (
            <a href={`mailto:${current.email}`} style={{ color: NAVY }}>
              {current.email}
            </a>
          )}
          {current.phone && (
            <a href={`tel:${current.phone.replace(/[^\d+]/g, "")}`} style={{ color: NAVY }}>
              {current.phone}
            </a>
          )}
        </>
      ) : (
        <span style={{ color: TEXT_MUTED }}>Not set</span>
      )}
      <button
        type="button"
        style={{ background: "none", border: "none", padding: 0, fontSize: 13, fontWeight: 600, color: NAVY, cursor: "pointer" }}
        onClick={() => {
          setDraft(current);
          setError(null);
          setEditing(true);
        }}
      >
        {current.name ? "Edit" : "Add"}
      </button>
    </div>
  );
}
