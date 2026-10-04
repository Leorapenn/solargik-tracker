import type { ReactNode } from "react";
import Link from "next/link";
import { BORDER, NAVY, TEXT_MUTED } from "@/lib/theme";

export function StatCard({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  href?: string;
}) {
  const card = (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        padding: 20,
        height: "100%",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
          color: TEXT_MUTED,
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 34, fontWeight: 700, lineHeight: "38px", color: accent ?? NAVY }}>
        {value}
      </div>
    </div>
  );

  return href ? (
    <Link href={href} style={{ display: "block" }}>
      {card}
    </Link>
  ) : (
    card
  );
}
