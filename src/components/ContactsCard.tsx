"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { deleteContact, saveContact } from "@/server/actions/edit";
import type { ContactPerson } from "@/lib/contacts";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

type Draft = { ids: string[]; name: string; email: string; role: string; englishLevel: string };
const blank: Draft = { ids: [], name: "", email: "", role: "", englishLevel: "" };

export function ContactsCard({ customerId, people }: { customerId: string; people: ContactPerson[] }) {
  const [pending, startTransition] = useTransition();
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const run = (task: () => Promise<{ ok: boolean; error?: string }>, success: string, after?: () => void) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setMessage({ kind: "ok", text: success });
        after?.();
      } else {
        setMessage({ kind: "error", text: result.error ?? "Something went wrong." });
      }
    });

  const field = (label: string, key: keyof Omit<Draft, "ids">, props: { type?: string } = {}) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: TEXT_MUTED }}>
      {label}
      <input
        type={props.type}
        value={draft![key]}
        onChange={(e) => setDraft({ ...draft!, [key]: e.target.value })}
        style={inputStyle}
      />
    </label>
  );

  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
          Contacts
        </div>
        <button
          type="button"
          style={editMode ? primaryButton : secondaryButton}
          aria-pressed={editMode}
          onClick={() => {
            setEditMode(!editMode);
            setDraft(null);
            setMessage(null);
          }}
        >
          {editMode ? "Done" : "Edit"}
        </button>
      </div>
      <div style={{ width: 28, height: 3, borderRadius: 2, background: ORANGE, margin: "8px 0 14px" }} />

      {message && (
        <div
          role="status"
          style={{ padding: "8px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12, background: message.kind === "ok" ? "#D8F5E3" : "#FCE9E7", color: message.kind === "ok" ? "#047857" : "#8C1D18" }}
        >
          {message.text}
        </div>
      )}

      {people.length === 0 && !draft && (
        <div style={{ color: TEXT_MUTED, fontSize: 14 }}>
          No contacts yet. They&apos;re imported from the POC columns on the Supply Projects board, or you can add one with Edit.
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" }}>
        {people.map((person) => (
          <li key={person.key} style={{ padding: "12px 0", borderTop: `1px solid ${ROW_DIVIDER}` }}>
            {draft && draft.ids.join() === person.ids.join() ? null : (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: NAVY }}>{person.name}</div>
                  <div style={{ fontSize: 13, color: TEXT_MUTED }}>
                    {[person.role, person.englishLevel && `English: ${person.englishLevel}`].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {person.email && (
                    <a href={`mailto:${person.email}`} style={{ fontSize: 13.5, color: NAVY, wordBreak: "break-all" }}>
                      {person.email}
                    </a>
                  )}
                  {person.projects.length > 0 && (
                    <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 3 }}>
                      On {person.projects.length} project{person.projects.length === 1 ? "" : "s"}:{" "}
                      {person.projects.slice(0, 3).map((p, i) => (
                        <span key={p.id}>
                          {i > 0 && ", "}
                          <Link href={`/projects/${p.id}`} style={{ color: NAVY }}>
                            {p.name}
                          </Link>
                        </span>
                      ))}
                      {person.projects.length > 3 && ` and ${person.projects.length - 3} more`}
                    </div>
                  )}
                </div>
                {editMode && (
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() =>
                        setDraft({ ids: person.ids, name: person.name, email: person.email ?? "", role: person.role ?? "", englishLevel: person.englishLevel ?? "" })
                      }
                    >
                      Edit
                    </button>
                    {person.deletable && (
                      <button
                        type="button"
                        style={secondaryButton}
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Delete ${person.name}?`)) run(() => deleteContact(customerId, person.ids), "Contact deleted.");
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {draft && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 10, borderTop: `1px solid ${ROW_DIVIDER}`, paddingTop: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => saveContact(customerId, { ids: draft.ids, name: draft.name, email: draft.email, role: draft.role, englishLevel: draft.englishLevel }),
              draft.ids.length ? "Contact saved. Imports won't overwrite it." : "Contact added.",
              () => setDraft(null),
            );
          }}
        >
          <strong style={{ fontSize: 13, color: NAVY }}>{draft.ids.length ? "Edit contact" : "New contact"}</strong>
          {field("Name", "name")}
          {field("Email", "email", { type: "email" })}
          {field("Role (e.g. CEO, Site manager)", "role")}
          {field("English level", "englishLevel")}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={pending} style={primaryButton}>
              Save
            </button>
            <button type="button" style={secondaryButton} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {editMode && !draft && (
        <button type="button" style={{ ...secondaryButton, marginTop: 14 }} onClick={() => setDraft({ ...blank })}>
          + Add contact
        </button>
      )}
    </div>
  );
}
