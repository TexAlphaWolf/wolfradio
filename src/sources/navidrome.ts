import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import { getJson } from "../util/http.js";

/**
 * Your own music library, served by Navidrome through the (Open)Subsonic API.
 * Stream URLs carry an auth token, so they are only ever handed to Lavalink, never shown in Discord.
 */

export interface LibrarySong {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  isrc: string[];
}

interface RawSong {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  isrc?: string | string[];
}

interface SubsonicResponse<T> {
  "subsonic-response": { status: "ok" | "failed"; error?: { message: string } } & T;
}

function authParams(): URLSearchParams {
  const salt = randomBytes(8).toString("hex");
  const token = createHash("md5").update(config.library.password + salt).digest("hex");
  return new URLSearchParams({
    u: config.library.user,
    t: token,
    s: salt,
    v: "1.16.1",
    c: "wolfradio",
    f: "json",
  });
}

function endpoint(method: string, params: Record<string, string> = {}): URL {
  const url = new URL(`${config.library.url}/rest/${method}`);
  for (const [k, v] of authParams()) url.searchParams.set(k, v);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url;
}

export async function searchLibrary(query: string, count = 10): Promise<LibrarySong[]> {
  if (!config.library.enabled) return [];
  const url = endpoint("search3", { query, songCount: String(count), artistCount: "0", albumCount: "0" });
  const body = await getJson<SubsonicResponse<{ searchResult3?: { song?: RawSong[] } }>>(url);
  const res = body["subsonic-response"];
  if (res.status !== "ok") throw new Error(`Navidrome: ${res.error?.message ?? "request failed"}`);
  return (res.searchResult3?.song ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist ?? "Unknown artist",
    album: s.album ?? "",
    durationMs: (s.duration ?? 0) * 1000,
    isrc: Array.isArray(s.isrc) ? s.isrc : s.isrc ? [s.isrc] : [],
  }));
}

export function libraryStreamUrl(id: string): string {
  return endpoint("stream", { id }).toString();
}

export async function pingLibrary(): Promise<boolean> {
  try {
    const body = await getJson<SubsonicResponse<object>>(endpoint("ping"), 5000);
    return body["subsonic-response"].status === "ok";
  } catch {
    return false;
  }
}

export interface RandomFilter {
  genre?: string | null;
  fromYear?: number | null;
  toYear?: number | null;
}

/** Random songs from the library (Subsonic getRandomSongs), optionally filtered by genre or years. */
export async function randomLibrarySongs(count: number, filter: RandomFilter = {}): Promise<LibrarySong[]> {
  if (!config.library.enabled) return [];
  const params: Record<string, string> = { size: String(Math.min(500, Math.max(1, count))) };
  if (filter.genre) params.genre = filter.genre;
  if (filter.fromYear) params.fromYear = String(filter.fromYear);
  if (filter.toYear) params.toYear = String(filter.toYear);
  const body = await getJson<SubsonicResponse<{ randomSongs?: { song?: RawSong[] } }>>(endpoint("getRandomSongs", params));
  const res = body["subsonic-response"];
  if (res.status !== "ok") throw new Error(`Navidrome: ${res.error?.message ?? "request failed"}`);
  return (res.randomSongs?.song ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist ?? "Unknown artist",
    album: s.album ?? "",
    durationMs: (s.duration ?? 0) * 1000,
    isrc: Array.isArray(s.isrc) ? s.isrc : s.isrc ? [s.isrc] : [],
  }));
}

let genresCache: { at: number; list: { name: string; songs: number }[] } | null = null;

/** Genres in the library, cached for 10 minutes (used for autocomplete). */
export async function libraryGenres(): Promise<{ name: string; songs: number }[]> {
  if (!config.library.enabled) return [];
  if (genresCache && Date.now() - genresCache.at < 10 * 60 * 1000) return genresCache.list;
  const body = await getJson<SubsonicResponse<{ genres?: { genre?: { value: string; songCount: number }[] } }>>(
    endpoint("getGenres"),
  );
  const list = (body["subsonic-response"].genres?.genre ?? [])
    .filter((g) => g.value && g.songCount > 0)
    .map((g) => ({ name: g.value, songs: g.songCount }))
    .sort((a, b) => b.songs - a.songs);
  genresCache = { at: Date.now(), list };
  return list;
}
