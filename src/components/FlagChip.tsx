import { FLAG_COLOR_LABELS, FLAG_COLOR_STYLES, type FlagColor } from "@/lib/flags";

const NEUTRAL = { bg: "#EFF1F6", text: "#142A5C", border: "#D5D9E3", dot: "#142A5C" };

// A flag label. Customer flags are green, yellow or red; with onCycleColor the colored dot is a button that
// switches color, and with onRemove the chip carries a small x (both client use). Without them it is plain text.
export function FlagChip({
  label,
  color,
  onCycleColor,
  onRemove,
  disabled,
}: {
  label: string;
  // null = a plain label with no color (project flags)
  color: FlagColor | null;
  onCycleColor?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const style = color ? FLAG_COLOR_STYLES[color] : NEUTRAL;
  const dot = { width: 9, height: 9, borderRadius: "50%", background: style.dot, display: "inline-block", flexShrink: 0 } as const;
  return (
    <span
      title={color ? `${FLAG_COLOR_LABELS[color]} flag` : "Flag"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {!color ? null : onCycleColor ? (
        <button
          type="button"
          onClick={onCycleColor}
          disabled={disabled}
          aria-label={`Change the color of flag ${label} (now ${FLAG_COLOR_LABELS[color].toLowerCase()})`}
          title={`${FLAG_COLOR_LABELS[color]}. Click to change the color.`}
          style={{ border: "none", background: "transparent", padding: 2, margin: -2, cursor: "pointer", display: "inline-flex" }}
        >
          <span style={dot} />
        </button>
      ) : (
        <span style={dot} aria-hidden="true" />
      )}
      <span>
        {label}
        {color && (
          <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}> ({FLAG_COLOR_LABELS[color]})</span>
        )}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove flag ${label}`}
          title="Remove this flag"
          style={{ border: "none", background: "transparent", color: style.text, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}
