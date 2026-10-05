"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { addFlag, removeFlag, setCustomerFlagColor } from "@/server/actions/flags";
import {
  DEFAULT_FLAG_COLOR,
  FLAG_COLORS,
  FLAG_COLOR_LABELS,
  MAX_FLAG_LENGTH,
  colorOf,
  nextFlagColor,
  type FlagColor,
} from "@/lib/flags";
import { NAVY, TEXT_MUTED, inputStyle, secondaryButton } from "@/lib/theme";
import { FlagChip } from "@/components/FlagChip";

// Flags added by hand: chips (click x to remove) with a box to add another. Customer flags are green,
// yellow or red: pick the color when adding, or click a chip's dot to change it.
export function FlagsEditor({
  kind,
  id,
  flags,
  colors = {},
  suggestions,
  compact = false,
  extra,
  name,
}: {
  kind: "customer" | "project";
  id: string;
  flags: string[];
  colors?: Record<string, FlagColor>;
  suggestions: string[];
  // compact: for a table cell. No "Flags" heading; the add box opens from a small "+ Flag" button.
  compact?: boolean;
  // extra chips shown before the editable ones (e.g. the automatic name-variant / blocked chips)
  extra?: ReactNode;
  // what the flags belong to, for screen readers in the table
  name?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(!compact);
  const [text, setText] = useState("");
  const [color, setColor] = useState<FlagColor>(DEFAULT_FLAG_COLOR);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const colored = kind === "customer";

  const submit = () => {
    const label = text;
    setError(null);
    startTransition(async () => {
      const result = await addFlag(kind, id, label, colored ? color : undefined);
      if (result.ok) {
        setText("");
        if (compact) setAdding(false);
      } else setError(result.error);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="group" aria-label={name ? `Flags for ${name}` : "Flags"}>
      <div style={{ display: "flex", gap: compact ? 6 : 8, flexWrap: "wrap", alignItems: "center" }}>
        {!compact && <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Flags</span>}
        {extra}
        {flags.length === 0 && !extra && !compact && <span style={{ fontSize: 13, color: TEXT_MUTED }}>None yet</span>}
        {flags.map((flag) => {
          const flagColor = colored ? colorOf(colors, flag) : null;
          return (
            <FlagChip
              key={flag}
              label={flag}
              color={flagColor}
              onCycleColor={
                flagColor
                  ? () => {
                      setError(null);
                      startTransition(async () => {
                        const result = await setCustomerFlagColor(id, flag, nextFlagColor(flagColor));
                        if (!result.ok) setError(result.error);
                      });
                    }
                  : undefined
              }
              onRemove={() => {
                setError(null);
                startTransition(async () => {
                  const result = await removeFlag(kind, id, flag);
                  if (!result.ok) setError(result.error);
                });
              }}
              disabled={pending}
            />
          );
        })}
        {compact && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label={name ? `Add a flag to ${name}` : "Add a flag"}
            style={{ ...secondaryButton, padding: "2px 10px", fontSize: 12.5, borderRadius: 999 }}
          >
            + Flag
          </button>
        )}
      </div>
      {adding && (
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
          autoFocus={compact}
          style={{ ...inputStyle, width: compact ? 180 : 260 }}
        />
        <datalist id={listId}>
          {suggestions
            .filter((s) => !flags.some((f) => f.toLowerCase() === s.toLowerCase()))
            .map((s) => (
              <option key={s} value={s} />
            ))}
        </datalist>
        {colored && (
          <select aria-label="Flag color" value={color} onChange={(event) => setColor(event.target.value as FlagColor)} style={inputStyle}>
            {FLAG_COLORS.map((c) => (
              <option key={c} value={c}>
                {FLAG_COLOR_LABELS[c]}
              </option>
            ))}
          </select>
        )}
        <button type="submit" disabled={pending || !text.trim()} style={secondaryButton}>
          Add flag
        </button>
        {compact && (
          <button
            type="button"
            style={secondaryButton}
            onClick={() => {
              setAdding(false);
              setText("");
              setError(null);
            }}
          >
            Cancel
          </button>
        )}
        {error && (
          <span role="alert" style={{ fontSize: 13, color: "#8C1D18" }}>
            {error}
          </span>
        )}
      </form>
      )}
      {!adding && error && (
        <span role="alert" style={{ fontSize: 12.5, color: "#8C1D18" }}>
          {error}
        </span>
      )}
    </div>
  );
}
