"use client";

// A read-only text box that selects everything when clicked, so it is easy to copy.
export function CopyBox({ value, rows = 12, label }: { value: string; rows?: number; label: string }) {
  return (
    <textarea
      aria-label={label}
      readOnly
      rows={rows}
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: 10, border: "1px solid #E4E6EC", borderRadius: 6 }}
    />
  );
}
