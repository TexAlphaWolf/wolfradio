import type { TrackKind } from "../../src/activity/protocol";

export function time(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

export const KIND_LABEL: Record<TrackKind, string> = {
  library: "Your library",
  jamendo: "Creative Commons",
  preview: "30 s preview",
  radio: "Live radio",
};
