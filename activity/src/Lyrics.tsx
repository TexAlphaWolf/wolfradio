import { useEffect, useMemo, useRef } from "react";
import type { ActivityState } from "../../src/activity/protocol";

/** Karaoke view: the sung line is lit and centred, the rest fades with distance. */
export function Lyrics({ lines, position }: { lines: ActivityState["lyrics"]["lines"]; position: number }) {
  const active = useMemo(() => {
    let index = -1;
    for (let i = 0; i < lines.length && lines[i]!.t <= position; i++) index = i;
    return index;
  }, [lines, position]);

  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current?.children[Math.max(0, active)] as HTMLElement | undefined;
    if (!el || !list.current) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const parent = list.current.parentElement!;
    parent.scrollTo({ top: el.offsetTop - parent.clientHeight / 2 + el.clientHeight / 2, behavior: reduce ? "auto" : "smooth" });
  }, [active]);

  return (
    <div className="lyrics" aria-live="off">
      <ol ref={list}>
        {lines.map((line, i) => {
          const distance = active < 0 ? i + 1 : Math.abs(i - active);
          return (
            <li key={`${line.t}-${i}`} className={`line${line.text ? "" : " rest"}${i === active ? " now" : i < active ? " past" : ""}`} data-d={Math.min(distance, 4)} aria-current={i === active ? "true" : undefined}>
              {line.text || "• • •"}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The single line shown in the tiny picture-in-picture window. */
export function currentLine(lines: ActivityState["lyrics"]["lines"], position: number): string | null {
  let text: string | null = null;
  for (const line of lines) {
    if (line.t > position) break;
    text = line.text || "♪";
  }
  return text;
}
