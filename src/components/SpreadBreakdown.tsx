"use client";

import { useState } from "react";
import Link from "next/link";
import type { PhaseName, StageStatus } from "@prisma/client";
import type { PhaseBreakdown, SpreadSegment } from "@/lib/phaseSpread";
import { phaseLabel } from "@/lib/phases";
import { STATUS_LABELS, STATUS_PILL_STYLES } from "@/lib/statusColors";
import { NAVY, TEXT_MUTED } from "@/lib/theme";

const STATUS_ORDER: StageStatus[] = ["BLOCKED", "IN_PROGRESS", "NOT_STARTED", "DONE"];

// The phase spread bar of a customer. Click a phase to see which of the customer's projects are in which state
// for it (the bar itself only shows the worst case); click it again to close.
export function SpreadBreakdown({ segments, breakdown, customer }: { segments: SpreadSegment[]; breakdown: PhaseBreakdown; customer: string }) {
  const [open, setOpen] = useState<PhaseName | null>(null);
  const projects = open ? breakdown[open] : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 3, width: "100%" }}>
        {segments.map((segment) => (
          <button
            key={segment.phase}
            type="button"
            title={segment.title}
            aria-label={`${phaseLabel(segment.phase)} for ${customer}: show projects`}
            aria-expanded={open === segment.phase}
            onClick={() => setOpen(open === segment.phase ? null : segment.phase)}
            style={{
              flexGrow: 1,
              height: 14,
              padding: 0,
              border: "none",
              borderRadius: 3,
              background: segment.color,
              cursor: "pointer",
              outline: open === segment.phase ? `2px solid ${NAVY}` : "none",
              outlineOffset: 1,
            }}
          />
        ))}
      </div>

      {open && (
        <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ fontWeight: 700, color: NAVY }}>{phaseLabel(open)}</div>
          {STATUS_ORDER.map((status) => {
            const list = projects.filter((p) => p.status === status);
            if (list.length === 0) return null;
            const { bg, text } = STATUS_PILL_STYLES[status];
            return (
              <div key={status} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ alignSelf: "flex-start", background: bg, color: text, borderRadius: 999, padding: "1px 8px", fontSize: 11.5, fontWeight: 700 }}>
                  {STATUS_LABELS[status]} · {list.length}
                </span>
                <span style={{ lineHeight: 1.5 }}>
                  {list.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && <span style={{ color: TEXT_MUTED }}>, </span>}
                      <Link href={`/projects/${p.id}`} style={{ color: NAVY, fontWeight: 600 }}>
                        {p.name}
                      </Link>
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
          {projects.length === 0 && <span style={{ color: TEXT_MUTED }}>No projects.</span>}
        </div>
      )}
    </div>
  );
}
