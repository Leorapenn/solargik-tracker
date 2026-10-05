"use client";

import { useEffect, useRef, useState } from "react";
import { formatTyped, maskTypedDate, monthGrid, parseTypedDate } from "@/lib/dateInput";
import { toDateInputValue, todayInAppTz } from "@/lib/dates";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

export type DateChoice = { date: string | null; notApplicable: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// A date box you can type into (DD/MM/YYYY) or pick from a calendar. Nothing is chosen until you type a
// complete valid date and press Enter / leave the box, or click a day: moving through months and years in
// the calendar never selects a date. With allowNotApplicable, "N/A" marks a date that doesn't apply.
export function DateField({
  value,
  notApplicable = false,
  allowNotApplicable = false,
  onCommit,
  disabled,
  ariaLabel,
  placeholder = "DD/MM/YYYY",
}: {
  value: string | null;
  notApplicable?: boolean;
  allowNotApplicable?: boolean;
  onCommit: (choice: DateChoice) => void;
  disabled?: boolean;
  ariaLabel: string;
  placeholder?: string;
}) {
  const shown = notApplicable ? "N/A" : formatTyped(value);
  // what the person has typed, or null while the box just shows the saved value
  const [draft, setDraft] = useState<string | null>(null);
  const [seen, setSeen] = useState(shown);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [view, setView] = useState(() => viewFor(value));
  const root = useRef<HTMLDivElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // once the saved value changes (after a save, or an edit elsewhere) drop whatever was typed
  if (seen !== shown) {
    setSeen(shown);
    setDraft(null);
    setError(false);
  }
  const text = draft ?? shown;

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && popover.current?.contains(event.target)) return;
      setOpen(false);
    };
    const away = (event: MouseEvent) => {
      if (event.target instanceof Node && (root.current?.contains(event.target) || popover.current?.contains(event.target))) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function openCalendar() {
    const rect = input.current?.getBoundingClientRect();
    if (rect) {
      const width = 280;
      setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
    }
    setView(viewFor(value));
    setOpen(true);
  }

  const commit = (choice: DateChoice) => {
    setError(false);
    setOpen(false);
    onCommit(choice);
  };

  function commitText() {
    const unchanged = () => {
      setDraft(null);
      setError(false);
    };
    const typed = text.trim();
    if (draft === null || typed === shown) return unchanged();
    if (allowNotApplicable && /^n\/?a$/i.test(typed)) return notApplicable ? unchanged() : commit({ date: null, notApplicable: true });

    const parsed = parseTypedDate(typed);
    if (!parsed.ok) return setError(true);
    if (parsed.iso === null) return value === null && !notApplicable ? unchanged() : commit({ date: null, notApplicable: false });
    if (parsed.iso !== value || notApplicable) commit({ date: parsed.iso, notApplicable: false });
    else unchanged();
  }

  const today = toDateInputValue(todayInAppTz());
  const grid = monthGrid(view.year, view.month);
  const years = Array.from({ length: 101 }, (_, i) => 2000 + i);

  const small = {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    borderRadius: 6,
    padding: "5px 9px",
    fontSize: 13,
    cursor: "pointer",
    color: NAVY,
    fontWeight: 600,
  } as const;

  return (
    <div ref={root} style={{ display: "inline-flex", flexDirection: "column", gap: 3 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <input
          ref={input}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          aria-label={ariaLabel}
          aria-invalid={error}
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          onBlur={commitText}
          onChange={(event) => {
            const raw = event.target.value;
            setError(false);
            setDraft(allowNotApplicable && /^[nN]/.test(raw) ? raw.slice(0, 3) : maskTypedDate(raw, text));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitText();
            } else if (event.key === "Escape") {
              setDraft(null);
              setError(false);
              setOpen(false);
            } else if (event.key === "ArrowDown" && event.altKey) {
              openCalendar();
            }
          }}
          style={{
            width: 112,
            border: `1px solid ${error ? "#B3261E" : BORDER}`,
            borderRadius: 6,
            padding: "5px 8px",
            fontSize: 13,
            background: "#fff",
            color: notApplicable ? TEXT_MUTED : undefined,
          }}
        />
        <button
          type="button"
          disabled={disabled}
          aria-label={`Open calendar for ${ariaLabel}`}
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openCalendar())}
          style={{ ...small, padding: "4px 7px", lineHeight: 1 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
        </button>
      </div>
      {error && (
        <span role="alert" style={{ fontSize: 11.5, color: "#B3261E" }}>
          Use DD/MM/YYYY, e.g. 05/10/2026
        </span>
      )}

      {open && position && (
        <div
          ref={popover}
          role="dialog"
          aria-label="Choose a date"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: 280,
            zIndex: 50,
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(20,42,92,0.18)",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
          onKeyDown={(event) => event.key === "Escape" && setOpen(false)}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              aria-label="Previous month"
              style={small}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setView(shiftMonth(view, -1))}
            >
              ‹
            </button>
            <select
              aria-label="Month"
              value={view.month}
              onChange={(e) => setView({ ...view, month: Number(e.target.value) })}
              style={{ ...small, flex: 1, minWidth: 0 }}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
            <select
              aria-label="Year"
              value={view.year}
              onChange={(e) => setView({ ...view, year: Number(e.target.value) })}
              style={{ ...small, width: 74 }}
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label="Next month"
              style={small}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setView(shiftMonth(view, 1))}
            >
              ›
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
            {WEEKDAYS.map((day) => (
              <div key={day} style={{ fontSize: 11, fontWeight: 700, color: TEXT_MUTED, padding: "2px 0" }}>
                {day}
              </div>
            ))}
            {grid.flat().map((day) => {
              const selected = day.iso === value && !notApplicable;
              return (
                <button
                  key={day.iso}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => commit({ date: day.iso, notApplicable: false })}
                  aria-label={formatTyped(day.iso)}
                  aria-pressed={selected}
                  style={{
                    border: day.iso === today ? `1px solid ${NAVY}` : "1px solid transparent",
                    background: selected ? NAVY : "transparent",
                    color: selected ? "#fff" : day.inMonth ? "#333" : "#B5BAC6",
                    borderRadius: 6,
                    padding: "6px 0",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  {day.day}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={small} onMouseDown={(e) => e.preventDefault()} onClick={() => commit({ date: today, notApplicable: false })}>
              Today
            </button>
            <button type="button" style={small} onMouseDown={(e) => e.preventDefault()} onClick={() => commit({ date: null, notApplicable: false })}>
              Clear
            </button>
            {allowNotApplicable && (
              <button type="button" style={small} onMouseDown={(e) => e.preventDefault()} onClick={() => commit({ date: null, notApplicable: true })}>
                N/A
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function viewFor(value: string | null) {
  const iso = value ?? toDateInputValue(todayInAppTz());
  const [year, month] = iso.split("-").map(Number);
  return { year, month: month - 1 };
}

function shiftMonth(view: { year: number; month: number }, delta: number) {
  const index = view.year * 12 + view.month + delta;
  return { year: Math.min(2100, Math.max(2000, Math.floor(index / 12))), month: ((index % 12) + 12) % 12 };
}
