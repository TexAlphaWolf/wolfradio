import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";

/**
 * Spotify tokens of linked users, encrypted at rest with AES-256-GCM.
 * The key comes from TOKEN_ENCRYPTION_KEY, so a leaked data/ folder alone is useless.
 */

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface Sealed {
  iv: string;
  tag: string;
  data: string;
}

const file = () => path.join(config.dataDir, "spotify-tokens.json");
let key: Buffer | null = null;
let store: Record<string, Sealed> | null = null;

function getKey(): Buffer {
  key ??= scryptSync(config.spotify.tokenKey, "wolfradio/spotify-tokens/v1", 32);
  return key;
}

function load(): Record<string, Sealed> {
  if (store) return store;
  try {
    store = JSON.parse(readFileSync(file(), "utf8")) as Record<string, Sealed>;
  } catch {
    store = {};
  }
  return store;
}

function save(): void {
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(store ?? {}, null, 2), { mode: 0o600 });
  renameSync(tmp, file());
}

function seal(tokens: SpotifyTokens): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64") };
}

function open(sealed: Sealed): SpotifyTokens | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    const plain = Buffer.concat([decipher.update(Buffer.from(sealed.data, "base64")), decipher.final()]);
    return JSON.parse(plain.toString("utf8")) as SpotifyTokens;
  } catch {
    return null; // wrong key or tampered file
  }
}

export function getTokens(userId: string): SpotifyTokens | null {
  const sealed = load()[userId];
  return sealed ? open(sealed) : null;
}

export function saveTokens(userId: string, tokens: SpotifyTokens): void {
  load()[userId] = seal(tokens);
  save();
}

export function deleteTokens(userId: string): boolean {
  const data = load();
  if (!data[userId]) return false;
  delete data[userId];
  save();
  return true;
}

export function isLinked(userId: string): boolean {
  return !!load()[userId];
}
