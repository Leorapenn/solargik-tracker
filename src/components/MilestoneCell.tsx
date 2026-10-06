import { MILESTONE_STATUS, type MilestoneProgress } from "@/lib/payments";
import { formatDate, parseDateInput } from "@/lib/dates";
import { ChoicePill } from "@/components/ColorSelect";
import { TEXT_MUTED } from "@/lib/theme";

// "Which milestone is this project up to, and what is its status": the first unpaid milestone with a colored
// status, "All paid" once every milestone is paid, or a dash when the project has no milestones yet.
export function MilestoneCell({ progress }: { progress: MilestoneProgress }) {
  if (progress.kind === "none") return <span style={{ color: TEXT_MUTED }}>—</span>;
  if (progress.kind === "all-paid") {
    return <ChoicePill choice={{ ...MILESTONE_STATUS.PAYMENT_RECEIVED, label: "All paid" }} />;
  }
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}
      title={progress.dueDate ? `Due ${formatDate(parseDateInput(progress.dueDate))}` : undefined}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{progress.label}</span>
      <ChoicePill choice={MILESTONE_STATUS[progress.status]} />
    </div>
  );
}
