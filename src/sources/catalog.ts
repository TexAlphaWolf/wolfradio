import { config } from "../config.js";
import type { Candidate, Playable } from "../types.js";
import { formatDuration, sameSong, truncate } from "../util/text.js";
import { getDeezerTrack, parseDeezerTrackLink, searchDeezer, type DeezerTrack } from "./deezer.js";
import { searchJamendo, type JamendoTrack } from "./jamendo.js";
import { libraryStreamUrl, searchLibrary, type LibrarySong } from "./navidrome.js";
import { searchStations, type Station } from "./radiobrowser.js";
import { flagEmoji } from "../util/text.js";

export { searchStations };

export type SearchSource = "auto" | "library" | "jamendo";

/*
 * How a song gets resolved — the same idea big music bots use (catalog for metadata, then find audio),
 * but every audio source here is one we are allowed to use:
 *   1. your own library (Navidrome)        → full track
 *   2. Jamendo Creative Commons catalog    → full track
 *   3. Deezer official preview             → 30 seconds
 */

export function fromLibrary(song: LibrarySong, artwork: string | null = null, link: string | null = null): Playable {
  return {
    kind: "library",
    streamUrl: libraryStreamUrl(song.id),
    title: song.title,
    artist: song.artist,
    durationMs: song.durationMs,
    artworkUrl: artwork,
    coverId: song.coverArt,
    link,
  };
}

function fromJamendo(track: JamendoTrack): Playable {
  return {
    kind: "jamendo",
    streamUrl: track.audioUrl,
    title: track.title,
    artist: track.artist,
    durationMs: track.durationMs,
    artworkUrl: track.imageUrl,
    link: track.link,
    license: track.license,
  };
}

function fromPreview(track: DeezerTrack): Playable | null {
  if (!track.previewUrl) return null;
  return {
    kind: "preview",
    streamUrl: track.previewUrl,
    title: track.title,
    artist: track.artist,
    durationMs: 30_000,
    artworkUrl: track.coverUrl,
    link: track.link,
  };
}

export function fromStation(station: Station): Playable {
  return {
    kind: "radio",
    streamUrl: station.streamUrl,
    title: station.name,
    artist: station.country,
    durationMs: null,
    artworkUrl: station.favicon,
    link: station.homepage,
    radio: { uuid: station.uuid, country: station.country, countryCode: station.countryCode, tags: station.tags },
  };
}

/** Finds the best allowed audio for a catalog (Deezer) track. */
export async function resolveCatalogTrack(track: DeezerTrack): Promise<Playable | null> {
  if (config.library.enabled) {
    const full = track.isrc ? track : ((await getDeezerTrack(track.id).catch(() => null)) ?? track);
    const songs = await searchLibrary(`${track.artist} ${track.title}`, 10).catch(() => []);
    const match =
      songs.find((s) => full.isrc && s.isrc.includes(full.isrc)) ?? songs.find((s) => sameSong(s, track));
    if (match) return fromLibrary(match, track.coverUrl, track.link);
  }
  if (config.jamendo.enabled) {
    const results = await searchJamendo(`${track.artist} ${track.title}`, 5).catch(() => []);
    const match = results.find((t) => sameSong(t, track));
    if (match) return fromJamendo(match);
  }
  return config.previews.enabled ? fromPreview(track) : null;
}

/** A pasted Deezer track link skips the menu. */
export async function resolveDirectLink(query: string): Promise<Playable | null | undefined> {
  const id = parseDeezerTrackLink(query);
  if (!id) return undefined;
  const track = await getDeezerTrack(id);
  return track ? resolveCatalogTrack(track) : null;
}

function libraryCandidate(song: LibrarySong): Candidate {
  return {
    emoji: "📀",
    label: truncate(`${song.title} — ${song.artist}`, 100),
    description: truncate(`Library · ${song.album || "Single"} · ${formatDuration(song.durationMs)}`, 100),
    resolve: async () => fromLibrary(song),
  };
}

function jamendoCandidate(track: JamendoTrack): Candidate {
  return {
    emoji: "🌿",
    label: truncate(`${track.title} — ${track.artist}`, 100),
    description: truncate(`${track.license.name} · ${track.album || "Single"} · ${formatDuration(track.durationMs)}`, 100),
    resolve: async () => fromJamendo(track),
  };
}

function catalogCandidate(track: DeezerTrack): Candidate {
  return {
    emoji: "🔎",
    label: truncate(`${track.title} — ${track.artist}`, 100),
    description: truncate(`${track.album || "Single"} · full track if available, otherwise 30s preview`, 100),
    resolve: () => resolveCatalogTrack(track),
  };
}

/** Builds the "which one did you mean?" list. Discord select menus hold at most 25 options. */
export async function findCandidates(query: string, source: SearchSource): Promise<Candidate[]> {
  if (source === "library") {
    return (await searchLibrary(query, 25)).map(libraryCandidate);
  }
  if (source === "jamendo") {
    return (await searchJamendo(query, 25)).map(jamendoCandidate);
  }

  const catalogEnabled = config.previews.enabled || config.library.enabled || config.jamendo.enabled;
  const [library, catalog] = await Promise.all([
    searchLibrary(query, 10).catch((err) => {
      console.warn("[library] search failed:", (err as Error).message);
      return [] as LibrarySong[];
    }),
    catalogEnabled
      ? searchDeezer(query, 20).catch((err) => {
          console.warn("[deezer] search failed:", (err as Error).message);
          return [] as DeezerTrack[];
        })
      : Promise.resolve([] as DeezerTrack[]),
  ]);

  const candidates = library.map(libraryCandidate);
  for (const track of catalog) {
    if (candidates.length >= 25) break;
    if (library.some((song) => sameSong(song, track))) continue; // already listed as 📀
    candidates.push(catalogCandidate(track));
  }

  // Nothing in library/catalog? Fall back to Creative Commons search
  if (candidates.length === 0 && config.jamendo.enabled) {
    return (await searchJamendo(query, 25).catch(() => [])).map(jamendoCandidate);
  }
  return candidates;
}

export function stationCandidate(station: Station): Candidate {
  const details = [station.country, station.tags.split(",").slice(0, 3).join(", "), station.bitrate ? `${station.bitrate} kbps` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    emoji: flagEmoji(station.countryCode),
    label: truncate(station.name, 100),
    description: truncate(details || "Web radio", 100),
    resolve: async () => fromStation(station),
  };
}
