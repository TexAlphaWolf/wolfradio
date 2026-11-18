import { getJson } from "../util/http.js";

/** Deezer public API: free catalog search and official 30-second previews. No key required. */
const API = "https://api.deezer.com";

interface RawTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  link: string;
  isrc?: string;
  readable?: boolean;
  artist: { name: string };
  album: { title: string; cover_medium?: string; cover_big?: string };
}

export interface DeezerTrack {
  id: number;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  previewUrl: string | null;
  link: string;
  coverUrl: string | null;
  isrc: string | null;
}

function map(raw: RawTrack): DeezerTrack {
  return {
    id: raw.id,
    title: raw.title,
    artist: raw.artist?.name ?? "Unknown artist",
    album: raw.album?.title ?? "",
    durationMs: (raw.duration ?? 0) * 1000,
    previewUrl: raw.preview || null,
    link: raw.link,
    coverUrl: raw.album?.cover_big ?? raw.album?.cover_medium ?? null,
    isrc: raw.isrc ?? null,
  };
}

export async function searchDeezer(query: string, limit = 15): Promise<DeezerTrack[]> {
  const url = new URL(`${API}/search/track`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const body = await getJson<{ data?: RawTrack[]; error?: { message: string } }>(url);
  if (body.error) throw new Error(`Deezer: ${body.error.message}`);
  return (body.data ?? []).map(map);
}

export async function getDeezerTrack(id: number | string): Promise<DeezerTrack | null> {
  const body = await getJson<RawTrack & { error?: unknown }>(`${API}/track/${id}`);
  if (body.error || !body.id) return null;
  return map(body);
}

/** Extracts the track id from links like https://www.deezer.com/it/track/3135556 */
export function parseDeezerTrackLink(input: string): string | null {
  const match = input.match(/deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?track\/(\d+)/i);
  return match?.[1] ?? null;
}
