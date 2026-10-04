"use client";

import { useTransition } from "react";
import type { CustomerImportance } from "@prisma/client";
import { NAVY } from "@/lib/theme";

const OPTIONS: { value: CustomerImportance; label: string }[] = [
  { value: "NORMAL", label: "Normal" },
  { value: "SEMI_STRATEGIC", label: "Semi-Strategic" },
  { value: "STRATEGIC", label: "Strategic" },
];

const STYLES: Record<CustomerImportance, { bg: string; text: string }> = {
  NORMAL: { bg: "#EFF1F6", text: "#333333" },
  SEMI_STRATEGIC: { bg: "#E4E6EC", text: NAVY },
  STRATEGIC: { bg: NAVY, text: "#FFFFFF" },
};

export function ImportanceSelect({
  value,
  onChange,
  label,
}: {
  value: CustomerImportance;
  onChange: (importance: CustomerImportance) => Promise<void>;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { bg, text } = STYLES[value];
  const arrow = value === "STRATEGIC" ? "%23fff" : "%23000";

  return (
    <select
      aria-label={`Importance for ${label}`}
      value={value}
      disabled={isPending}
      onChange={(e) => {
        const next = e.target.value as CustomerImportance;
        startTransition(() => {
          onChange(next);
        });
      }}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        border: "none",
        borderRadius: 20,
        padding: "5px 28px 5px 12px",
        fontSize: 13,
        fontWeight: 600,
        cursor: isPending ? "default" : "pointer",
        opacity: isPending ? 0.6 : 1,
        backgroundColor: bg,
        color: text,
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='${arrow}' stroke-opacity='0.5' fill='none' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
        backgroundSize: "9px 6px",
      }}
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value} style={{ color: "#333", background: "#fff" }}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
