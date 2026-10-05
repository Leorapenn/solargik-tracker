"use client";

import { useId, useState, useTransition } from "react";
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
}: {
  kind: "customer" | "project";
  id: string;
  flags: string[];
  colors?: Record<string, FlagColor>;
  suggestions: string[];
}) {
  const [pending, startTransition] = useTransition();
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
      if (result.ok) setText("");
      else setError(result.error);
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }} role="group" aria-label="Flags">
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Flags</span>
        {flags.length === 0 && <span style={{ fontSize: 13, color: TEXT_MUTED }}>None yet</span>}
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
        {error && (
          <span role="alert" style={{ fontSize: 13, color: "#8C1D18" }}>
            {error}
          </span>
        )}
      </form>
    </div>
  );
}
