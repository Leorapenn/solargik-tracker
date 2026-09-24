import type { ReactNode } from "react";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

export function StatCard({ label, value, accent }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: "1rem 1.25rem",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: TEXT_MUTED,
          marginBottom: "0.4rem",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "1.75rem", fontWeight: 700, color: accent ?? NAVY }}>{value}</div>
    </div>
  );
}
