/** Small inline icons (no icon font: external resources are blocked inside Discord). */
type P = { size?: number };
const svg = (d: string, { size = 20 }: P = {}, fill = true) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"
    fill={fill ? "currentColor" : "none"} stroke={fill ? "none" : "currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
export const Play = (p: P) => svg("M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z", p);
export const Pause = (p: P) => svg("M6 4h4v16H6zM14 4h4v16h-4z", p);
export const Next = (p: P) => svg("M5 5.5v13a1 1 0 0 0 1.55.83L15 13.6V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.4L6.55 4.67A1 1 0 0 0 5 5.5Z", p);
export const Stop = (p: P) => svg("M6 6h12v12H6z", p);
export const Loop = (p: P) => svg("M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3", p, false);
export const Shuffle = (p: P) => svg("M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5", p, false);
export const Search = (p: P) => svg("M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM21 21l-4.35-4.35", p, false);
export const Plus = (p: P) => svg("M12 5v14M5 12h14", p, false);
export const Close = (p: P) => svg("M6 6l12 12M18 6 6 18", p, false);
export const Dice = (p: P) => svg("M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01", p, false);
export const Infinity = (p: P) => svg("M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z", p, false);
