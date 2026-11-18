import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";

/** Per-server settings, kept in a small JSON file (data/guilds.json). */

export interface FavoriteStation {
  uuid: string;
  name: string;
  streamUrl: string;
  homepage: string | null;
  favicon: string | null;
  country: string;
  countryCode: string;
  tags: string;
}

export interface GuildSettings {
  djRoleId: string | null;
  /** The one voice channel WolfRadio plays in on this server (chosen with /setup channel). */
  musicChannelId: string | null;
  requestChannelId: string | null;
  stay247: boolean;
  volume: number;
  favorites: FavoriteStation[];
}

const defaults = (): GuildSettings => ({
  djRoleId: null,
  musicChannelId: null,
  requestChannelId: null,
  stay247: false,
  volume: config.defaultVolume,
  favorites: [],
});

const file = path.join(config.dataDir, "guilds.json");
let data: Record<string, GuildSettings> = {};
let saveTimer: NodeJS.Timeout | null = null;

export function loadStore(): void {
  mkdirSync(config.dataDir, { recursive: true });
  try {
    data = JSON.parse(readFileSync(file, "utf8")) as Record<string, GuildSettings>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.error("[store] could not read guilds.json, starting empty:", err);
    }
    data = {};
  }
}

function flush(): void {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, file); // atomic replace, no half-written file on crash
}

function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      flush();
    } catch (err) {
      console.error("[store] save failed:", err);
    }
  }, 500);
}

export function flushStore(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  flush();
}

export function getSettings(guildId: string): GuildSettings {
  return { ...defaults(), ...data[guildId] };
}

export function updateSettings(guildId: string, change: (s: GuildSettings) => void): GuildSettings {
  const settings = getSettings(guildId);
  change(settings);
  data[guildId] = settings;
  scheduleSave();
  return settings;
}
