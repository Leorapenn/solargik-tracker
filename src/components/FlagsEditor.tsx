"use client";

import { useId, useState, useTransition } from "react";
import { addFlag, removeFlag } from "@/server/actions/flags";
import { MAX_FLAG_LENGTH } from "@/lib/flags";
import { NAVY, TEXT_MUTED, inputStyle, secondaryButton } from "@/lib/theme";
import { FlagChip } from "@/components/FlagChip";

// Flags added by hand: shown as chips (click x to remove) with a box to add another.
export function FlagsEditor({
  kind,
  id,
  flags,
  suggestions,
}: {
  kind: "customer" | "project";
  id: string;
  flags: string[];
  suggestions: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const submit = () => {
    const label = text;
    setError(null);
    startTransition(async () => {
      const result = await addFlag(kind, id, label);
      if (result.ok) setText("");
      else setError(result.error);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="group" aria-label="Flags">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Flags</span>
        {flags.length === 0 && <span style={{ fontSize: 13, color: TEXT_MUTED }}>None yet</span>}
        {flags.map((flag) => (
          <FlagChip
            key={flag}
            label={flag}
            onRemove={() => {
              setError(null);
              startTransition(async () => {
                const result = await removeFlag(kind, id, flag);
                if (!result.ok) setError(result.error);
              });
            }}
            disabled={pending}
          />
        ))}
      </div>
      <form
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          aria-label="New flag"
          placeholder="Add a flag, e.g. Payment risk"
          list={listId}
          value={text}
          maxLength={MAX_FLAG_LENGTH}
          onChange={(event) => setText(event.target.value)}
          style={{ ...inputStyle, width: 260 }}
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !flags.some((f) => f.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
        <button type="submit" disabled={pending || !text.trim()} style={secondaryButton}>
          Add flag
        </button>
        {error && (
          <span role="alert" style={{ fontSize: 13, color: "#8C1D18" }}>
            {error}
          </span>
        )}
      </form>
    </div>
  );
}
