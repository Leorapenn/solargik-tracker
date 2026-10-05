"use client";

import { useState, useTransition } from "react";
import type { ProjectLifecycle } from "@prisma/client";
import { updateProject } from "@/server/actions/edit";
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from "@/lib/lifecycle";
import { isLocked } from "@/lib/lockable";
import { NAVY, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type EditableProject = {
  id: string;
  name: string;
  country: string;
  capacityMw: string;
  contractValue: string;
  lifecycle: ProjectLifecycle;
  lockedFields: string[];
};

const FIELD_LABEL: Record<string, string> = {
  name: "Name",
  country: "Country",
  capacityMw: "Capacity (MW)",
  contractValue: "Contract value (USD)",
  lifecycle: "Project status",
};

export function ProjectEditor({ project }: { project: EditableProject }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: project.name,
    country: project.country,
    capacityMw: project.capacityMw,
    contractValue: project.contractValue,
    lifecycle: project.lifecycle,
  });
  const [unlock, setUnlock] = useState<string[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const reset = () => {
    setForm({
      name: project.name,
      country: project.country,
      capacityMw: project.capacityMw,
      contractValue: project.contractValue,
      lifecycle: project.lifecycle,
    });
    setUnlock([]);
    setMessage(null);
  };

  const lockNote = (field: string) =>
    isLocked(project.lockedFields, field) && (
      <span style={{ fontSize: 12, color: TEXT_MUTED, display: "flex", gap: 6, alignItems: "center" }}>
        Edited by hand, so imports won&apos;t overwrite it.
        <label style={{ display: "inline-flex", gap: 4, alignItems: "center", color: NAVY, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={unlock.includes(field)}
            onChange={(e) => setUnlock(e.target.checked ? [...unlock, field] : unlock.filter((f) => f !== field))}
          />
          Use monday.com&apos;s value again
        </label>
      </span>
    );

  const text = (field: "name" | "country" | "capacityMw" | "contractValue", numeric = false) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: TEXT_MUTED }}>
      {FIELD_LABEL[field]}
      <input
        value={form[field]}
        inputMode={numeric ? "decimal" : undefined}
        onChange={(e) => setForm({ ...form, [field]: e.target.value })}
        style={inputStyle}
      />
      {lockNote(field)}
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <button
          type="button"
          style={open ? primaryButton : secondaryButton}
          aria-expanded={open}
          onClick={() => {
            if (open) reset();
            setOpen(!open);
          }}
        >
          {open ? "Close editor" : "Edit details"}
        </button>
      </div>

      {open && (
        <form
          style={{ ...cardStyle, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setMessage(null);
            startTransition(async () => {
              const result = await updateProject(project.id, { ...form, unlock });
              if (result.ok) {
                setMessage({ kind: "ok", text: "Saved." });
                setUnlock([]);
                setOpen(false);
              } else {
                setMessage({ kind: "error", text: result.error });
              }
            });
          }}
        >
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13.5, maxWidth: 720 }}>
            Anything you change here is kept: the next import from monday.com won&apos;t overwrite it. This site never
            writes back to monday.com.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            {text("name")}
            {text("country")}
            {text("capacityMw", true)}
            {text("contractValue", true)}
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: TEXT_MUTED }}>
              {FIELD_LABEL.lifecycle}
              <select
                value={form.lifecycle}
                onChange={(e) => setForm({ ...form, lifecycle: e.target.value as ProjectLifecycle })}
                style={inputStyle}
              >
                {LIFECYCLE_ORDER.map((l) => (
                  <option key={l} value={l}>
                    {LIFECYCLE_LABELS[l]}
                  </option>
                ))}
              </select>
              {lockNote("lifecycle")}
            </label>
          </div>
          {message?.kind === "error" && (
            <div role="alert" style={{ color: "#8C1D18", fontSize: 14 }}>
              {message.text}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={pending} style={primaryButton}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button type="button" style={secondaryButton} onClick={() => { reset(); setOpen(false); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {!open && message?.kind === "ok" && (
        <div role="status" style={{ color: "#047857", fontSize: 14 }}>
          {message.text}
        </div>
      )}
    </div>
  );
}
