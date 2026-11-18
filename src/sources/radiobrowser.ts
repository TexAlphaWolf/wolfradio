import { getJson, ping } from "../util/http.js";

/**
 * radio-browser.info: free, community-run directory of web radios worldwide.
 * The API asks clients to pick a server from the mirror list rather than hard-coding one.
 */

export interface Station {
  uuid: string;
  name: string;
  streamUrl: string;
  homepage: string | null;
  favicon: string | null;
  country: string;
  countryCode: string;
  tags: string;
  codec: string;
  bitrate: number;
}

interface RawStation {
  stationuuid: string;
  name: string;
  url_resolved: string;
  url: string;
  homepage: string;
  favicon: string;
  country: string;
  countrycode: string;
  tags: string;
  codec: string;
  bitrate: number;
}

const FALLBACK_SERVER = "https://de1.api.radio-browser.info";
let server: string | null = null;
let serverPickedAt = 0;

async function baseUrl(): Promise<string> {
  if (server && Date.now() - serverPickedAt < 6 * 60 * 60 * 1000) return server;
  try {
    const list = await getJson<{ name: string }[]>("https://all.api.radio-browser.info/json/servers", 5000);
    const names = [...new Set(list.map((s) => s.name))];
    const pick = names[Math.floor(Math.random() * names.length)];
    server = pick ? `https://${pick}` : FALLBACK_SERVER;
  } catch {
    server = FALLBACK_SERVER;
  }
  serverPickedAt = Date.now();
  return server;
}

function map(raw: RawStation): Station {
  return {
    uuid: raw.stationuuid,
    name: raw.name.trim() || "Unnamed station",
    streamUrl: raw.url_resolved || raw.url,
    homepage: raw.homepage || null,
    favicon: raw.favicon || null,
    country: raw.country || "Unknown",
    countryCode: raw.countrycode || "",
    tags: raw.tags || "",
    codec: raw.codec || "",
    bitrate: raw.bitrate || 0,
  };
}

export interface StationQuery {
  name?: string | null;
  country?: string | null;
  tag?: string | null;
  limit?: number;
  random?: boolean;
}

export async function searchStations(q: StationQuery): Promise<Station[]> {
  const url = new URL(`${await baseUrl()}/json/stations/search`);
  if (q.name) url.searchParams.set("name", q.name);
  if (q.tag) url.searchParams.set("tag", q.tag.toLowerCase());
  if (q.country) {
    // Two letters → exact ISO code (IT, JP, BR…), otherwise fuzzy country name
    if (/^[a-z]{2}$/i.test(q.country)) url.searchParams.set("countrycode", q.country.toUpperCase());
    else url.searchParams.set("country", q.country);
  }
  url.searchParams.set("hidebroken", "true");
  url.searchParams.set("limit", String(q.limit ?? 25));
  if (q.random) {
    url.searchParams.set("order", "random");
  } else {
    url.searchParams.set("order", "clickcount");
    url.searchParams.set("reverse", "true");
  }
  const raw = await getJson<RawStation[]>(url);
  return raw.filter((s) => s.url_resolved || s.url).map(map);
}

export async function getStation(uuid: string): Promise<Station | null> {
  const raw = await getJson<RawStation[]>(`${await baseUrl()}/json/stations/byuuid/${encodeURIComponent(uuid)}`);
  const first = raw[0];
  return first ? map(first) : null;
}

/** Tells radio-browser a station was played — keeps its popularity ranking useful for everyone. */
export async function registerClick(uuid: string): Promise<void> {
  ping(`${await baseUrl()}/json/url/${encodeURIComponent(uuid)}`);
}
