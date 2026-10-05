"use client";

import { useState, useTransition } from "react";
import type { Department } from "@prisma/client";
import { applyDefaultOwners, createPerson, setDepartmentOwner, updatePerson } from "@/server/actions/people";
import { departmentLabel, DEPARTMENTS } from "@/lib/departments";
import type { SortState } from "@/lib/sort";
import { SortSummary } from "@/components/SortSummary";
import { SortTh } from "@/components/SortTh";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle, inputStyle, primaryButton, secondaryButton } from "@/lib/theme";

export type PersonRow = { id: string; name: string; email: string | null; active: boolean; itemCount: number };

type Params = Record<string, string | string[] | undefined>;

const th = { padding: "13px 18px", textAlign: "left" as const, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const };
const td = { padding: "12px 18px", fontSize: 14.5, verticalAlign: "middle" as const };

export function PeopleManager({
  people,
  defaults,
  sort,
  params,
}: {
  people: PersonRow[];
  defaults: Partial<Record<Department, string>>;
  sort: SortState;
  params: Params;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", email: "", active: true });

  const report = (result: { ok: boolean; error?: string }, success: string) =>
    setMessage(result.ok ? { kind: "ok", text: success } : { kind: "error", text: result.error ?? "Something went wrong." });

  const activePeople = people.filter((p) => p.active);
  const sortProps = { current: sort, basePath: "/people", params, style: th };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {message && (
        <div
          role="status"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 14,
            background: message.kind === "ok" ? "#D8F5E3" : "#FCE9E7",
            color: message.kind === "ok" ? "#047857" : "#8C1D18",
          }}
        >
          {message.text}
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr style={{ background: NAVY, color: "#fff" }}>
                <SortTh label="Name" sortKey="name" {...sortProps} />
                <SortTh label="Email" sortKey="email" {...sortProps} />
                <SortTh label="Items owned" sortKey="items" {...sortProps} />
                <SortTh label="Status" sortKey="status" {...sortProps} />
                <SortTh style={th} />
              </tr>
            </thead>
            <tbody>
              {people.map((person) =>
                editing === person.id ? (
                  <tr key={person.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, background: "#FBFCFE" }}>
                    <td style={td}>
                      <input aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={td}>
                      <input aria-label="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={inputStyle} />
                    </td>
                    <td style={td}>{person.itemCount}</td>
                    <td style={td}>
                      <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                        Active
                      </label>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        disabled={pending}
                        style={primaryButton}
                        onClick={() =>
                          startTransition(async () => {
                            const result = await updatePerson(person.id, draft);
                            report(result, "Saved.");
                            if (result.ok) setEditing(null);
                          })
                        }
                      >
                        Save
                      </button>{" "}
                      <button type="button" style={secondaryButton} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={person.id} style={{ borderBottom: `1px solid ${ROW_DIVIDER}`, opacity: person.active ? 1 : 0.55 }}>
                    <td style={{ ...td, fontWeight: 700, color: NAVY }}>{person.name}</td>
                    <td style={{ ...td, color: TEXT_MUTED }}>{person.email ?? "—"}</td>
                    <td style={td}>{person.itemCount}</td>
                    <td style={td}>{person.active ? "Active" : "Inactive"}</td>
                    <td style={td}>
                      <button
                        type="button"
                        style={secondaryButton}
                        onClick={() => {
                          setEditing(person.id);
                          setDraft({ name: person.name, email: person.email ?? "", active: person.active });
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ),
              )}
              {people.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ ...td, color: TEXT_MUTED }}>
                    No people yet. Add the first one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${ROW_DIVIDER}` }}>
          <SortSummary
            basePath="/people"
            params={params}
            current={sort}
            labels={{ name: "Name", email: "Email", items: "Items owned", status: "Status" }}
          />
        </div>

        <form
          style={{ display: "flex", gap: 10, flexWrap: "wrap", padding: 16, borderTop: `1px solid ${ROW_DIVIDER}` }}
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              const result = await createPerson(newName, newEmail);
              report(result, `Added ${newName.trim()}.`);
              if (result.ok) {
                setNewName("");
                setNewEmail("");
              }
            });
          }}
        >
          <input aria-label="New person's name" placeholder="Name" required value={newName} onChange={(e) => setNewName(e.target.value)} style={{ ...inputStyle, width: 220 }} />
          <input aria-label="New person's email" placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ ...inputStyle, width: 260 }} />
          <button type="submit" disabled={pending} style={primaryButton}>
            Add person
          </button>
        </form>
      </div>

      <div style={{ ...cardStyle, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: NAVY }}>
          Default owner by department
        </div>
        <p style={{ color: TEXT_MUTED, fontSize: 14, margin: "8px 0 16px", maxWidth: 720 }}>
          New projects automatically give each item to its department&apos;s default owner. Existing items keep the owner
          they have; use the button below to fill in items that have no owner yet.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {DEPARTMENTS.map((department) => (
            <label key={department} style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: TEXT_MUTED }}>
              {departmentLabel(department)}
              <select
                value={defaults[department] ?? ""}
                disabled={pending}
                style={inputStyle}
                onChange={(e) =>
                  startTransition(async () => {
                    const result = await setDepartmentOwner(department, e.target.value || null);
                    report(result, `${departmentLabel(department)} default owner saved.`);
                  })
                }
              >
                <option value="">No default</option>
                {activePeople.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={pending}
          style={{ ...secondaryButton, marginTop: 18 }}
          onClick={() =>
            startTransition(async () => {
              const result = await applyDefaultOwners();
              report(result, result.ok ? `Assigned ${result.assigned} item${result.assigned === 1 ? "" : "s"} that had no owner.` : "");
            })
          }
        >
          Assign defaults to items with no owner
        </button>
      </div>
    </div>
  );
}
