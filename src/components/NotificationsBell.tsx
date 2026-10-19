"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { TaskReminder } from "@/server/services/tasks";
import { NAVY, ROW_DIVIDER, TEXT_MUTED } from "@/lib/theme";

const COLORS = { overdue: "#8C1D18", today: "#8A5300", quiet: "#4A4F5C" } as const;

// The bell in the top bar: how many tasks need attention (a follow-up is due or overdue, or nothing has happened for a
// week), and the list when it is opened.
export function NotificationsBell({ items }: { items: TaskReminder[] }) {
  // open only on the page where it was opened, so going to another page closes it
  const pathname = usePathname();
  const [openPath, setOpenPath] = useState<string | null>(null);
  const open = openPath === pathname;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpenPath(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenPath(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = items.length;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={count === 0 ? "Notifications: nothing needs attention" : `Notifications: ${count} task${count === 1 ? " needs" : "s need"} attention`}
        aria-expanded={open}
        title="Tasks that need attention"
        onClick={() => setOpenPath(open ? null : pathname)}
        style={{ position: "relative", width: 44, height: 44, borderRadius: 8, border: "1px solid #3D558C", background: "#1D3872", color: "#FFFFFF", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {count > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 20, height: 20, borderRadius: 10, background: "#D93025", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 5px", boxSizing: "border-box" }}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Tasks that need attention" style={{ position: "absolute", right: 0, top: 52, width: 400, maxWidth: "90vw", background: "#fff", border: "1px solid #E4E6EC", borderRadius: 10, boxShadow: "0 8px 24px rgba(20,42,92,0.18)", zIndex: 50, overflow: "hidden" }}>
          <div style={{ padding: "12px 16px", fontWeight: 700, color: NAVY, borderBottom: `1px solid ${ROW_DIVIDER}` }}>{count === 0 ? "Nothing needs attention" : `${count} task${count === 1 ? " needs" : "s need"} attention`}</div>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {items.map((r) => (
              <Link key={r.id} href={`/tasks#${r.id}`} style={{ display: "block", padding: "10px 16px", borderBottom: `1px solid ${ROW_DIVIDER}`, color: "#1A1A1A" }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: NAVY, overflowWrap: "anywhere" }}>{r.topic}</div>
                <div style={{ fontSize: 12.5, color: TEXT_MUTED }}>
                  {r.customerName}
                  {r.projectName ? ` · ${r.projectName}` : ""}
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS[r.attention.level] }}>{r.attention.text}</div>
              </Link>
            ))}
          </div>
          <Link href="/tasks" style={{ display: "block", padding: "10px 16px", fontSize: 13.5, fontWeight: 700, color: NAVY, background: "#F6F7FB" }}>
            Open Tasks
          </Link>
        </div>
      )}
    </div>
  );
}
