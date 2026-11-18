import path from "node:path";

function str(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got "${raw}"`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}


export const config = {
  token: str("DISCORD_TOKEN"),
  clientId: str("CLIENT_ID"),
  devGuildId: str("DEV_GUILD_ID") || null,

  lavalink: {
    host: str("LAVALINK_HOST", "localhost"),
    port: num("LAVALINK_PORT", 2333),
    password: str("LAVALINK_PASSWORD", "change-me"),
    secure: bool("LAVALINK_SECURE", false),
  },

  previews: { enabled: bool("ENABLE_PREVIEWS", true) },
  jamendo: {
    enabled: bool("ENABLE_JAMENDO", false),
    clientId: str("JAMENDO_CLIENT_ID"),
  },
  library: {
    enabled: bool("ENABLE_LIBRARY", false),
    url: str("NAVIDROME_URL").replace(/\/+$/, ""),
    user: str("NAVIDROME_USER"),
    password: str("NAVIDROME_PASSWORD"),
  },
  radio: { enabled: bool("ENABLE_RADIO", false) },
  requestChannel: { enabled: bool("ENABLE_REQUEST_CHANNEL", false) },

  /**
   * Shows the song (and the current lyric line, if lyrics are on) as the voice channel status,
   * under the channel name. Needs the "Set Voice Channel Status" permission.
   */
  voiceStatus: bool("VOICE_CHANNEL_STATUS", true),
  lyrics: {
    enabled: bool("ENABLE_LYRICS", false),
    /** Also show the current lyric line as the voice channel status (instead of just the song). */
    inVoiceStatus: bool("LYRICS_IN_VOICE_STATUS", false),
    /** Lyrics block inside the Now Playing card. */
    inNowPlaying: bool("LYRICS_IN_NOW_PLAYING", true),
    /** Shift lyrics earlier (+) or later (-) in milliseconds, to compensate Discord's delay. */
    offsetMs: num("LYRICS_OFFSET_MS", 400),
  },

  spotify: {
    enabled: bool("ENABLE_SPOTIFY_PARTY", false),
    clientId: str("SPOTIFY_CLIENT_ID"),
    clientSecret: str("SPOTIFY_CLIENT_SECRET"),
    redirectUri: str("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:8888/callback"),
    callbackPort: num("SPOTIFY_CALLBACK_PORT", 8888),
    /** Used to encrypt stored Spotify tokens (data/spotify-tokens.json). Any long random string. */
    tokenKey: str("TOKEN_ENCRYPTION_KEY"),
  },

  defaultVolume: num("DEFAULT_VOLUME", 60),
  maxQueuePerUser: num("MAX_QUEUE_PER_USER", 15),
  cooldownMs: num("COMMAND_COOLDOWN_SECONDS", 3) * 1000,
  idleLeaveMs: num("IDLE_LEAVE_SECONDS", 120) * 1000,
  voteSkipRatio: Math.min(1, Math.max(0.1, num("VOTE_SKIP_RATIO", 0.5))),
  /** Bot messages are deleted after this many seconds (0 = never). Live cards are handled separately. */
  autoDeleteMs: num("AUTO_DELETE_SECONDS", 180) * 1000,
  dataDir: path.resolve(str("DATA_DIR", "./data")),
} as const;

export function validateConfig(): string[] {
  const problems: string[] = [];
  if (!config.token) problems.push("DISCORD_TOKEN is missing");
  if (!config.clientId) problems.push("CLIENT_ID is missing");
  if (config.jamendo.enabled && !config.jamendo.clientId) {
    problems.push("ENABLE_JAMENDO is on but JAMENDO_CLIENT_ID is empty");
  }
  if (config.library.enabled && (!config.library.url || !config.library.user || !config.library.password)) {
    problems.push("ENABLE_LIBRARY is on but NAVIDROME_URL / NAVIDROME_USER / NAVIDROME_PASSWORD are incomplete");
  }
  if (!config.previews.enabled && !config.jamendo.enabled && !config.library.enabled && !config.radio.enabled) {
    problems.push("Every source is disabled — enable at least one of previews, Jamendo, library or radio");
  }
  if (config.spotify.enabled) {
    if (!config.spotify.clientId || !config.spotify.clientSecret) {
      problems.push("ENABLE_SPOTIFY_PARTY is on but SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET are empty");
    }
    if (config.spotify.tokenKey.length < 32) {
      problems.push("ENABLE_SPOTIFY_PARTY needs TOKEN_ENCRYPTION_KEY with at least 32 characters");
    }
  }
  return problems;
}
