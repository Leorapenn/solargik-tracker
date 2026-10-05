// A flag label. With onRemove it carries a small x button (client use); without, it is plain text.
export function FlagChip({ label, onRemove, disabled }: { label: string; onRemove?: () => void; disabled?: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: "#FEF6E7",
        color: "#7A4E00",
        border: "1px solid #F0C069",
        borderRadius: 999,
        padding: "2px 10px",
        fontSize: 12.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove flag ${label}`}
          title="Remove this flag"
          style={{ border: "none", background: "transparent", color: "#7A4E00", cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </span>
  );
}
