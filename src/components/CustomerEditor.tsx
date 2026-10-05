"use client";

import { useState, useTransition } from "react";
import type { CustomerImportance } from "@prisma/client";
import { updateCustomer } from "@/server/actions/edit";
import { isLocked } from "@/lib/lockable";
import { NAVY, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type EditableCustomer = {
  id: string;
  name: string;
  importance: CustomerImportance;
  lockedFields: string[];
};

const IMPORTANCE_LABELS: Record<CustomerImportance, string> = {
  NORMAL: "Normal",
  SEMI_STRATEGIC: "Semi-Strategic",
  STRATEGIC: "Strategic",
};

export function CustomerEditor({ customer }: { customer: EditableCustomer }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: customer.name, importance: customer.importance });
  const [unlock, setUnlock] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setForm({ name: customer.name, importance: customer.importance });
    setUnlock([]);
    setError(null);
    setOpen(false);
  };

  const lockNote = (field: string) =>
    isLocked(customer.lockedFields, field) && (
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <button
          type="button"
          style={open ? primaryButton : secondaryButton}
          aria-expanded={open}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {open ? "Close editor" : "Edit customer"}
        </button>
      </div>
      {open && (
        <form
          style={{ ...cardStyle, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateCustomer(customer.id, { ...form, unlock });
              if (result.ok) {
                setUnlock([]);
                setOpen(false);
              } else {
                setError(result.error);
              }
            });
          }}
        >
          <p style={{ margin: 0, color: TEXT_MUTED, fontSize: 13.5, maxWidth: 720 }}>
            Anything you change here is kept: the next import from monday.com won&apos;t overwrite it. This site never
            writes back to monday.com.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: TEXT_MUTED }}>
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              {lockNote("name")}
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: TEXT_MUTED }}>
              Importance
              <select
                value={form.importance}
                onChange={(e) => setForm({ ...form, importance: e.target.value as CustomerImportance })}
                style={inputStyle}
              >
                {(Object.keys(IMPORTANCE_LABELS) as CustomerImportance[]).map((key) => (
                  <option key={key} value={key}>
                    {IMPORTANCE_LABELS[key]}
                  </option>
                ))}
              </select>
              {lockNote("importance")}
            </label>
          </div>
          {error && (
            <div role="alert" style={{ color: "#8C1D18", fontSize: 14 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={pending} style={primaryButton}>
              {pending ? "Saving…" : "Save changes"}
            </button>
            <button type="button" style={secondaryButton} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
