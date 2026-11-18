import { getJson } from "../util/http.js";

/** LRCLIB (lrclib.net): free, community-run database of time-synced lyrics. No key required. */
const API = "https://lrclib.net/api";

interface RawLyrics {
  id: number;
  trackName: string;
  artistName: string;
  duration: number;
  instrumental: boolean;
  syncedLyrics: string | null;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

export type LyricsResult = { kind: "synced"; lines: LyricLine[] } | { kind: "instrumental" } | { kind: "none" };

/** Parses "[01:23.45]text" lines; one line can carry several timestamps. Metadata tags are ignored. */
export function parseLrc(lrc: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
    if (stamps.length === 0) continue;
    const text = raw.replace(/\[[^\]]*\]/g, "").trim();
    for (const s of stamps) {
      const ms = Math.round((Number(s[1]) * 60 + Number(s[2])) * 1000);
      if (Number.isFinite(ms)) lines.push({ timeMs: ms, text });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/** "Titanium (feat. Sia) - Radio Edit" → "Titanium" — LRCLIB matches better on the bare title. */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[([](feat\.?|ft\.|with|remaster|radio edit|explicit)[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+(remaster|radio edit|single version|explicit).*$/i, "")
    .trim();
}

const cache = new Map<string, LyricsResult>();

export async function findLyrics(title: string, artist: string, durationMs: number | null): Promise<LyricsResult> {
  const key = `${artist}\u0000${title}`.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  const url = new URL(`${API}/search`);
  url.searchParams.set("track_name", cleanTitle(title));
  url.searchParams.set("artist_name", artist.split(/,|&| feat\.? | x /i)[0]!.trim());
  const results = await getJson<RawLyrics[]>(url, 6000);

  const seconds = durationMs ? durationMs / 1000 : null;
  const candidates = results
    .filter((r) => r.instrumental || r.syncedLyrics)
    // Different edits of a song have different lengths: stay within 4 s of what's playing
    .filter((r) => seconds === null || Math.abs(r.duration - seconds) <= 4)
    .sort((a, b) => (seconds === null ? 0 : Math.abs(a.duration - seconds) - Math.abs(b.duration - seconds)));

  const best = candidates[0];
  let result: LyricsResult = { kind: "none" };
  if (best?.instrumental) result = { kind: "instrumental" };
  else if (best?.syncedLyrics) {
    const lines = parseLrc(best.syncedLyrics);
    if (lines.length) result = { kind: "synced", lines };
  }

  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
