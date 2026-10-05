"use client";

import { useEffect, useRef, useState } from "react";
import type { Choice } from "@/lib/projectProfile";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

// A dropdown whose options are colored pills (a native <select> can't color its options). Blank is the
// default and is shown as an empty box, never as a word.
export function ColorSelect({
  value,
  options,
  onChange,
  ariaLabel,
  disabled,
}: {
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (event.target instanceof Node && (button.current?.contains(event.target) || list.current?.contains(event.target))) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function toggle() {
    if (open) return setOpen(false);
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)) });
    setOpen(true);
  }

  const pill = (choice: Choice) => ({
    display: "inline-block",
    background: choice.bg,
    color: choice.text,
    borderRadius: 999,
    padding: "4px 12px",
    fontSize: 13,
    fontWeight: 700,
    whiteSpace: "nowrap",
  }) as const;

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={`${ariaLabel}: ${current ? current.label : "no value"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minWidth: 150,
          minHeight: 32,
          justifyContent: "space-between",
          background: current ? current.bg : "#fff",
          color: current ? current.text : NAVY,
          border: `1px solid ${current ? "transparent" : BORDER}`,
          borderRadius: 999,
          padding: "3px 10px 3px 12px",
          fontSize: 13,
          fontWeight: 700,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        <span>{current ? current.label : ""}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeOpacity="0.55" fill="none" strokeWidth="1.5" />
        </svg>
      </button>
      {open && position && (
        <div
          ref={list}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 60,
            minWidth: 210,
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(20,42,92,0.18)",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={{ ...pill(option), border: option.value === value ? `2px solid ${option.text}` : "2px solid transparent", cursor: "pointer", textAlign: "left" }}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            aria-label="No value (blank)"
            title="Clear"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            style={{ border: `1px dashed ${BORDER}`, background: "#fff", color: TEXT_MUTED, borderRadius: 999, padding: "4px 12px", fontSize: 13, cursor: "pointer", textAlign: "left", minHeight: 28 }}
          >
            {" "}
          </button>
        </div>
      )}
    </>
  );
}

// The read-only look of a dropdown value: the colored pill, or a dash when blank.
export function ChoicePill({ choice }: { choice: Choice | null }) {
  if (!choice) return <span style={{ color: TEXT_MUTED }}>—</span>;
  return (
    <span style={{ display: "inline-block", background: choice.bg, color: choice.text, borderRadius: 999, padding: "4px 12px", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
      {choice.label}
    </span>
  );
}
