"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DateField } from "@/components/DateField";
import { NAVY, TEXT_MUTED, secondaryButton } from "@/lib/theme";

// A custom from / to range for the updates page; "Show" puts it in the URL.
export function UpdatesRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [start, setStart] = useState<string | null>(from);
  const [end, setEnd] = useState<string | null>(to);
  const ready = start !== null && end !== null && start <= end;

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Custom</span>
      <DateField ariaLabel="From date" value={start} onCommit={(c) => setStart(c.date)} />
      <span style={{ color: TEXT_MUTED }}>to</span>
      <DateField ariaLabel="To date" value={end} onCommit={(c) => setEnd(c.date)} />
      <button type="button" style={secondaryButton} disabled={!ready} onClick={() => router.push(`/updates?from=${start}&to=${end}`)}>
        Show
      </button>
    </div>
  );
}
