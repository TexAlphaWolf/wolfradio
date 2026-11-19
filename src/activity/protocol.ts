/**
 * Messages between the WolfRadio Activity (browser, inside Discord) and the bot.
 * Shared by both sides: the frontend imports these types too.
 */

export type TrackKind = "library" | "jamendo" | "preview" | "radio";

export interface ActivityTrack {
  title: string;
  artist: string;
  kind: TrackKind;
  /** Same-origin URL served by the bot's art proxy (external images are blocked inside Discord). */
  art: string | null;
  durationMs: number;
  isStream: boolean;
  requestedBy: string | null;
  /** Added by the person viewing (they may remove it). */
  mine: boolean;
  license: string | null;
}

export interface LyricLine {
  t: number; // ms from the start of the track
  text: string;
}

export interface ActivityState {
  guildName: string;
  /** The music channel set with /setup channel. */
  channel: { id: string; name: string } | null;
  me: { id: string; name: string; dj: boolean; inChannel: boolean };
  connected: boolean;
  current: (ActivityTrack & { positionMs: number; paused: boolean }) | null;
  queue: ActivityTrack[];
  queueTotal: number;
  loop: "off" | "track" | "queue";
  endless: boolean;
  volume: number;
  lyrics: { status: "off" | "loading" | "synced" | "instrumental" | "none"; lines: LyricLine[] };
  features: { library: boolean; radio: boolean };
  /** Server clock when the snapshot was taken: the client extrapolates the position from here. */
  at: number;
}

export interface SearchItem {
  emoji: string;
  label: string;
  description: string;
}

export type ClientMessage =
  | { t: "pause" }
  | { t: "skip" }
  | { t: "stop" }
  | { t: "loop" }
  | { t: "shuffle" }
  | { t: "remove"; index: number }
  | { t: "search"; query: string; id: number }
  | { t: "add"; id: number; index: number }
  | { t: "random"; endless: boolean }
  | { t: "ping" };

export type ServerMessage =
  | { t: "state"; state: ActivityState }
  | { t: "pos"; positionMs: number; paused: boolean; at: number }
  | { t: "results"; id: number; items: SearchItem[] }
  | { t: "toast"; text: string; error?: boolean }
  | { t: "pong" };

/** WebSocket close codes. */
export const CLOSE_UNAUTHORIZED = 4001;
export const CLOSE_NOT_MEMBER = 4003;
