"use client";

import { useState, useTransition } from "react";
import { assignPhaseOwners } from "@/server/actions/phaseOwners";
import { NAVY, TEXT_MUTED, inputStyle } from "@/lib/theme";

// "Phase owner: Dana" with a small Change link; choosing someone saves straight away. The owners of the phase's
// items are separate and not affected.
export function PhaseOwner({
  phaseId,
  ownerId,
  ownerName,
  people,
  label,
}: {
  phaseId: string;
  ownerId: string | null;
  ownerName: string | null;
  people: { id: string; name: string }[];
  label: string; // for screen readers, e.g. "Design phase owner"
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const choose = (personId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await assignPhaseOwners([phaseId], personId || null);
      if (result.ok) setEditing(false);
      else setError(result.error);
    });
  };

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <select
          aria-label={label}
          autoFocus
          disabled={pending}
          value={ownerId ?? ""}
          onChange={(e) => choose(e.target.value)}
          onBlur={() => !pending && setEditing(false)}
          style={{ ...inputStyle, padding: "4px 8px", fontSize: 12.5 }}
        >
          <option value="">No owner</option>
          {ownerId && !people.some((p) => p.id === ownerId) && <option value={ownerId}>{ownerName} (inactive)</option>}
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {error && (
          <div role="alert" style={{ color: "#8C1D18", fontSize: 12 }}>
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
      <span>
        Phase owner: <strong style={{ color: ownerName ? NAVY : TEXT_MUTED }}>{ownerName ?? "none"}</strong>
      </span>
      <button
        type="button"
        aria-label={`Change the ${label}`}
        onClick={() => setEditing(true)}
        style={{ background: "none", border: "none", padding: 0, fontSize: "0.75rem", fontWeight: 600, color: NAVY, cursor: "pointer" }}
      >
        {ownerName ? "Change" : "Assign"}
      </button>
    </div>
  );
}
