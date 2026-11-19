import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Short-lived signed tokens. The secret is random per process: after a bot restart the Activity
 * simply signs in again (silently, Discord remembers the authorization).
 */
const secret = randomBytes(32);

function sign(data: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function seal(payload: Record<string, unknown>, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function unseal<T extends Record<string, unknown>>(token: string | null | undefined): T | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp: number };
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export interface Session extends Record<string, unknown> {
  userId: string;
  name: string;
}

export const newSession = (s: Session) => seal(s, 12 * 60 * 60 * 1000);
export const readSession = (token: string | null | undefined) => unseal<Session>(token);
