"use client";

import { useId, useState, useTransition, type ReactNode } from "react";
import { addFlag, removeFlag, setFlagColor, setFlagNote } from "@/server/actions/flags";
import {
  DEFAULT_FLAG_COLOR,
  FLAG_COLORS,
  FLAG_COLOR_LABELS,
  MAX_FLAG_LENGTH,
  MAX_FLAG_NOTE,
  colorOf,
  formatNoteDate,
  nextFlagColor,
  type FlagColor,
  type FlagNote,
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
  notes = {},
  suggestions,
  compact = false,
  extra,
  name,
}: {
  kind: "customer" | "project";
  id: string;
  flags: string[];
  colors?: Record<string, FlagColor>;
  // why each flag is there (optional), shown on hover and edited by clicking the flag
  notes?: Record<string, FlagNote>;
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
  const colored = true; // customer and project flags both have a severity color
  // the flag whose note is open for reading/editing, and the text being typed
  const [editing, setEditing] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const openNote = (flag: string) => {
    setError(null);
    setEditing(flag);
    setNoteText(notes[flag]?.text ?? "");
  };

  const saveNote = () => {
    if (!editing) return;
    const flag = editing;
    setError(null);
    startTransition(async () => {
      const result = await setFlagNote(kind, id, flag, noteText);
      if (result.ok) setEditing(null);
      else setError(result.error);
    });
  };

  const submit = () => {
    const label = text;
    setError(null);
    startTransition(async () => {
      const result = await addFlag(kind, id, label, colored ? color : undefined);
      if (result.ok) {
        setText("");
        if (compact) setAdding(false);
        // on the full pages, offer to say why right away (a "Skip" closes it)
        else {
          setEditing(label.replace(/\s+/g, " ").trim());
          setNoteText("");
        }
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
              note={notes[flag]}
              onEditNote={() => (editing === flag ? setEditing(null) : openNote(flag))}
              onCycleColor={
                flagColor
                  ? () => {
                      setError(null);
                      startTransition(async () => {
                        const result = await setFlagColor(kind, id, flag, nextFlagColor(flagColor));
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
      {editing && flags.includes(editing) && (
        <form
          style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: compact ? 300 : 520, whiteSpace: "normal" }}
          onSubmit={(event) => {
            event.preventDefault();
            saveNote();
          }}
        >
          <label style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }} htmlFor={`${listId}-note`}>
            Why is &ldquo;{editing}&rdquo; flagged?
          </label>
          <textarea
            id={`${listId}-note`}
            value={noteText}
            maxLength={MAX_FLAG_NOTE}
            rows={compact ? 4 : 3}
            autoFocus
            placeholder="Optional. Say what is going on, e.g. who is affected and what is being done."
            onChange={(event) => setNoteText(event.target.value)}
            style={{ ...inputStyle, width: "100%", resize: "vertical", font: "inherit" }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="submit" disabled={pending} style={secondaryButton}>
              Save note
            </button>
            <button type="button" style={secondaryButton} onClick={() => setEditing(null)}>
              {notes[editing] ? "Cancel" : "Skip"}
            </button>
            <span style={{ fontSize: 12, color: TEXT_MUTED }}>
              {noteText.length}/{MAX_FLAG_NOTE}
              {notes[editing]?.at ? ` · last changed ${formatNoteDate(notes[editing].at)}` : ""}
              {notes[editing] ? " · save it empty to remove the note" : ""}
            </span>
          </div>
        </form>
      )}
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
