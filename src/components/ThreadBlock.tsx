import type { ReactNode } from "react";
import type { Thread, ThreadRow } from "@/lib/threads";
import { formatDate, parseDateInput } from "@/lib/dates";
import { NAVY, ORANGE, ROW_DIVIDER, TEXT_MUTED } from "@/lib/theme";

// The proposals that came from one email chain, shown together: the subject, how many proposals from how many emails, and
// each email of the chain once (sender, day, link). It folds with the arrow.
export function ThreadBlock<T extends ThreadRow>({ thread, children }: { thread: Thread<T>; children: ReactNode }) {
  const emails = thread.emails.length;
  const first = thread.emails[0]?.day;
  const last = thread.emails[emails - 1]?.day;
  const fmt = (d: string) => formatDate(parseDateInput(d));
  const range = first && last ? (first === last ? ` · ${fmt(first)}` : ` · ${fmt(first)} to ${fmt(last)}`) : "";
  return (
    <details open style={{ border: `1px solid ${ROW_DIVIDER}`, borderLeft: `4px solid ${ORANGE}`, borderRadius: 12, background: "#F6F7FB", padding: "10px 14px 14px" }}>
      <summary style={{ cursor: "pointer", color: NAVY, fontWeight: 700, fontSize: 14.5 }}>
        Email chain: {thread.subject}{" "}
        <span style={{ fontWeight: 400, color: TEXT_MUTED, fontSize: 13 }}>
          {thread.rows.length} proposals from {emails} email{emails === 1 ? "" : "s"}
          {range}
        </span>
      </summary>
      <div style={{ fontSize: 12.5, color: TEXT_MUTED, margin: "6px 0 10px", display: "flex", gap: "2px 14px", flexWrap: "wrap" }}>
        {thread.emails.map((e, i) => (
          <span key={i}>
            {e.day ? fmt(e.day) : "undated"}
            {e.from ? ` · ${e.from}` : ""}
            {e.link && (
              <>
                {" · "}
                <a href={e.link} target="_blank" rel="noopener noreferrer" style={{ color: NAVY, fontWeight: 700 }}>
                  Open
                </a>
              </>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
    </details>
  );
}