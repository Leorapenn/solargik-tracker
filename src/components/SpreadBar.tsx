import type { SpreadSegment } from "@/lib/phaseSpread";

export function SpreadBar({ segments }: { segments: SpreadSegment[] }) {
  return (
    <div style={{ display: "flex", gap: 3, width: "100%" }}>
      {segments.map((segment) => (
        <div
          key={segment.phase}
          title={segment.title}
          style={{ flexGrow: 1, height: 14, borderRadius: 3, background: segment.color }}
        />
      ))}
    </div>
  );
}
