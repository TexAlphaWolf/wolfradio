import { randomBytes } from "node:crypto";
import { config } from "../config.js";
import { deleteTokens, getTokens, saveTokens } from "./tokens.js";

/**
 * Minimal Spotify Web API client for the listening party.
 * WolfRadio never streams Spotify audio: it only tells each member's own Spotify app what to play.
 */

const ACCOUNTS = "https://accounts.spotify.com";
const API = "https://api.spotify.com/v1";
const SCOPES = ["user-read-playback-state", "user-modify-playback-state"];

export interface SpotifyTrack {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  durationMs: number;
  url: string;
  imageUrl: string | null;
}

export class SpotifyError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly reason?: string,
  ) {
    super(message);
  }
}

// ── OAuth ────────────────────────────────────────────────

const pendingStates = new Map<string, { userId: string; expiresAt: number }>();

export function authUrl(userId: string): string {
  const state = randomBytes(16).toString("hex");
  pendingStates.set(state, { userId, expiresAt: Date.now() + 15 * 60 * 1000 });
  const url = new URL(`${ACCOUNTS}/authorize`);
  url.searchParams.set("client_id", config.spotify.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.spotify.redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const basic = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString("base64");
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new SpotifyError(String(body.error_description ?? body.error ?? `HTTP ${res.status}`), res.status, String(body.error ?? ""));
  }
  return body as { access_token: string; refresh_token?: string; expires_in: number };
}

/**
 * Finishes linking after Spotify redirects back with ?code&state.
 * `expectedUserId` is set when the user pastes the address in Discord: the link must belong to them.
 */
export async function completeLink(code: string, state: string, expectedUserId?: string): Promise<string> {
  const pending = pendingStates.get(state);
  if (!pending || pending.expiresAt < Date.now()) throw new SpotifyError("This link expired — run /party link again.", 400);
  if (expectedUserId && pending.userId !== expectedUserId) throw new SpotifyError("This link was created for someone else.", 403);
  pendingStates.delete(state);

  const tokens = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: config.spotify.redirectUri });
  if (!tokens.refresh_token) throw new SpotifyError("Spotify didn't return a refresh token.", 500);
  saveTokens(pending.userId, {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  });
  return pending.userId;
}

/** Returns a valid access token, refreshing it if needed. null = not linked (or the user revoked access). */
async function userToken(userId: string): Promise<string | null> {
  const tokens = getTokens(userId);
  if (!tokens) return null;
  if (tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  try {
    const fresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refreshToken });
    saveTokens(userId, {
      accessToken: fresh.access_token,
      refreshToken: fresh.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + fresh.expires_in * 1000,
    });
    return fresh.access_token;
  } catch (err) {
    if (err instanceof SpotifyError && err.reason === "invalid_grant") {
      deleteTokens(userId); // access revoked from the Spotify account page
      return null;
    }
    throw err;
  }
}

let appToken: { token: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt - 60_000 > Date.now()) return appToken.token;
  const res = await tokenRequest({ grant_type: "client_credentials" });
  appToken = { token: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
  return appToken.token;
}

// ── Requests ─────────────────────────────────────────────

async function request<T>(token: string, method: string, path: string, body?: unknown, retry = true): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429 && retry) {
    const wait = Math.min(5, Number(res.headers.get("Retry-After") ?? 1)) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return request(token, method, path, body, false);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  if (!res.ok) {
    const error = (json?.error ?? {}) as { message?: string; reason?: string };
    throw new SpotifyError(error.message ?? `HTTP ${res.status}`, res.status, error.reason);
  }
  return json as T;
}

interface RawTrack {
  id: string;
  uri: string;
  name: string;
  duration_ms: number;
  artists: { name: string }[];
  album: { name: string; images: { url: string; width: number }[] };
  external_urls: { spotify: string };
}

export async function searchTracks(query: string): Promise<SpotifyTrack[]> {
  const params = new URLSearchParams({ q: query, type: "track", limit: "10" }); // 10 = dev-mode maximum
  const res = await request<{ tracks: { items: RawTrack[] } }>(await getAppToken(), "GET", `/search?${params}`);
  return (res?.tracks.items ?? []).map((t) => ({
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(", "),
    album: t.album.name,
    durationMs: t.duration_ms,
    url: t.external_urls.spotify,
    imageUrl: t.album.images.sort((a, b) => b.width - a.width)[0]?.url ?? null,
  }));
}

export type PlayOutcome = "ok" | "not-linked" | "no-device" | "premium" | "error";

/** Starts a track on the user's Spotify, on the active device or else the first available one. */
export async function playFor(userId: string, uri: string, positionMs: number): Promise<PlayOutcome> {
  try {
    const token = await userToken(userId);
    if (!token) return "not-linked";
    const body = { uris: [uri], position_ms: Math.max(0, Math.round(positionMs)) };
    try {
      await request(token, "PUT", "/me/player/play", body);
      return "ok";
    } catch (err) {
      if (!(err instanceof SpotifyError) || err.status !== 404) throw err;
      // No active device: wake one up
      const devices = await request<{ devices: { id: string | null; is_restricted: boolean }[] }>(token, "GET", "/me/player/devices");
      const device = devices?.devices.find((d) => d.id && !d.is_restricted);
      if (!device?.id) return "no-device";
      await request(token, "PUT", `/me/player/play?device_id=${encodeURIComponent(device.id)}`, body);
      return "ok";
    }
  } catch (err) {
    if (err instanceof SpotifyError && (err.reason === "PREMIUM_REQUIRED" || err.status === 403)) return "premium";
    if (err instanceof SpotifyError && err.reason === "NO_ACTIVE_DEVICE") return "no-device";
    console.warn(`[spotify] play failed for ${userId}:`, (err as Error).message);
    return "error";
  }
}

export async function pauseFor(userId: string): Promise<void> {
  try {
    const token = await userToken(userId);
    if (token) await request(token, "PUT", "/me/player/pause");
  } catch {
    // already paused / no device: nothing to do
  }
}
