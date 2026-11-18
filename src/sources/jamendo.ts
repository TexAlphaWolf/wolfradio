import { config } from "../config.js";
import { getJson } from "../util/http.js";

/** Jamendo: full-length Creative Commons tracks. Free client id from https://devportal.jamendo.com */
const API = "https://api.jamendo.com/v3.0";

interface RawTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  duration: number;
  audio: string;
  shareurl: string;
  image: string;
  license_ccurl: string;
}

export interface JamendoTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  audioUrl: string;
  link: string;
  imageUrl: string | null;
  license: { name: string; url: string };
}

/** Turns https://creativecommons.org/licenses/by-sa/3.0/ into "CC BY-SA 3.0". */
function licenseName(url: string): string {
  const match = url.match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  return match ? `CC ${match[1]!.toUpperCase()} ${match[2]}` : "Creative Commons";
}

export async function searchJamendo(query: string, limit = 10): Promise<JamendoTrack[]> {
  if (!config.jamendo.enabled) return [];
  const url = new URL(`${API}/tracks/`);
  url.searchParams.set("client_id", config.jamendo.clientId);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("search", query);
  url.searchParams.set("audioformat", "mp32");
  url.searchParams.set("order", "relevance");
  const body = await getJson<{ headers: { status: string; error_message?: string }; results: RawTrack[] }>(url);
  if (body.headers.status !== "success") throw new Error(`Jamendo: ${body.headers.error_message ?? "request failed"}`);
  return body.results
    .filter((t) => t.audio)
    .map((t) => ({
      id: t.id,
      title: t.name,
      artist: t.artist_name,
      album: t.album_name,
      durationMs: t.duration * 1000,
      audioUrl: t.audio,
      link: t.shareurl,
      imageUrl: t.image || null,
      license: { name: licenseName(t.license_ccurl), url: t.license_ccurl },
    }));
}
