import type { CorrespondenceItem } from "@/lib/correspondence";
import { ActionDoneToggle } from "@/components/ActionDoneToggle";
import { formatDate, parseDateInput } from "@/lib/dates";
import { NAVY, ROW_DIVIDER, TEXT_MUTED, cardStyle } from "@/lib/theme";

const BADGE = {
  Action: { bg: "#FFF1D6", text: "#9A4B00" },
  Note: { bg: "#DCE8FB", text: "#1D4F9F" },
} as const;

// The approved notes and action items for this project (see src/lib/correspondence.ts). Read-only.
export function CorrespondenceCard({ items, empty }: { items: CorrespondenceItem[]; empty?: string }) {
  return (
    <div style={{ ...cardStyle, padding: 20, maxHeight: 560, overflowY: "auto" }}>
      {items.length === 0 ? (
        <div style={{ color: TEXT_MUTED, fontSize: 14 }}>
          {empty ?? "Nothing here yet. When you approve a note or an action item from the Inbox for this project, it appears here."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {items.map((item, i) => {
            const badge = BADGE[item.kindLabel];
            return (
              <div key={item.id} style={{ padding: "12px 0", borderTop: i === 0 ? "none" : `1px solid ${ROW_DIVIDER}`, paddingTop: i === 0 ? 0 : 12, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12.5, color: TEXT_MUTED }}>
                  <span style={{ fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: badge.bg, color: badge.text }}>{item.kindLabel}</span>
                  {item.done && <span style={{ fontWeight: 700, borderRadius: 999, padding: "2px 9px", background: "#D8F5E3", color: "#047857" }}>Done{item.doneOn ? ` ${formatDate(parseDateInput(item.doneOn))}` : ""}</span>}
                  <span>{formatDate(parseDateInput(item.date))}</span>
                  {item.from && <span style={{ overflowWrap: "anywhere" }}>from {item.from}</span>}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: NAVY, overflowWrap: "anywhere", textDecoration: item.done ? "line-through" : "none", opacity: item.done ? 0.65 : 1 }}>{item.summary}</div>
                {item.text && <div style={{ fontSize: 13.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.text}</div>}
                {(item.who || item.by) && (
                  <div style={{ fontSize: 13 }}>
                    {item.who && (
                      <>
                        <span style={{ color: TEXT_MUTED }}>Who: </span>
                        {item.who}
                      </>
                    )}
                    {item.who && item.by && <span style={{ color: TEXT_MUTED }}> · </span>}
                    {item.by && (
                      <>
                        <span style={{ color: TEXT_MUTED }}>By: </span>
                        {item.by}
                      </>
                    )}
                  </div>
                )}
                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  {item.link && (
                    <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                      Open email
                    </a>
                  )}
                  {item.fileLink && (
                    <a href={item.fileLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                      Open file
                    </a>
                  )}
                  {item.kindLabel === "Action" && <ActionDoneToggle id={item.id} done={item.done} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
