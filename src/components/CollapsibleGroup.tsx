"use client";

import type { ReactNode } from "react";
import { useFolded } from "@/components/useFolded";
import { NAVY } from "@/lib/theme";

// A customer's group of tasks with an arrow beside the heading that folds the list away and opens it again.
// Everything starts open; the heading (name, count, Close all) stays visible when folded. The choice is remembered per
// browser under `id`.
export function CollapsibleGroup({ id, label, title, children }: { id: string; label: string; title: ReactNode; children: ReactNode }) {
  const [folded, setFolded] = useFolded(`group:${id}`);
  const open = !folded;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} the tasks of ${label}`}
          title={open ? "Hide these tasks" : "Show these tasks"}
          onClick={() => setFolded(open)}
          style={{ width: 28, height: 28, borderRadius: 6, border: "1px solid #E4E6EC", background: "#fff", color: NAVY, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, flex: "none" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {title}
      </div>
      {open && children}
    </section>
  );
}