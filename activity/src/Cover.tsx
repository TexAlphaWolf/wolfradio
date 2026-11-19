import type { TrackKind } from "../../src/activity/protocol";

/** Album art, or a monogram tinted by the source when there's no image. */
export function Cover({ art, title, kind, className = "" }: { art: string | null; title: string; kind: TrackKind; className?: string }) {
  if (art) return <img className={`cover ${className}`} src={art} alt="" draggable={false} />;
  const initials = title.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "♪";
  return (
    <div className={`cover cover-empty tint-${kind} ${className}`} aria-hidden="true">
      <span>{initials}</span>
    </div>
  );
}
