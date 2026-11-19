import { lookup } from "node:dns/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { fetchCoverArt } from "../sources/navidrome.js";
import { seal, unseal } from "./sessions.js";

/**
 * Inside Discord, an Activity can't load images from other sites (CSP), so the bot serves them.
 * Only URLs the bot signed itself are fetched: no open proxy, no way to make the bot request
 * arbitrary addresses (SSRF). Library covers come from Navidrome with the bot's own credentials.
 */

type ArtRef = { url: string } | { nd: string };
const MAX_BYTES = 5 * 1024 * 1024;

/** Radio favicons come from a public directory anyone can edit: never let them point into the LAN. */
function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a = 0, b = 0] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function isPublicUrl(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    return addresses.length > 0 && !addresses.some(isPrivateAddress);
  } catch {
    return false;
  }
}

const DAY = 24 * 60 * 60 * 1000;
const memo = new Map<string, { path: string; until: number }>();

/** Stable signed path per image (reused for a day), so browsers can cache it. */
export function artPath(ref: ArtRef | null): string | null {
  if (!ref) return null;
  if ("url" in ref && !/^https?:\/\//i.test(ref.url)) return null;
  const key = JSON.stringify(ref);
  const cached = memo.get(key);
  if (cached && cached.until > Date.now()) return cached.path;
  const path = `/api/art?k=${encodeURIComponent(seal(ref, 2 * DAY))}`;
  if (memo.size > 2000) memo.clear();
  memo.set(key, { path, until: Date.now() + DAY });
  return path;
}

export async function handleArt(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const k = new URL(req.url ?? "/", "http://x").searchParams.get("k");
  const ref = unseal<ArtRef & Record<string, unknown>>(k);
  if (!ref) {
    res.writeHead(404).end();
    return;
  }
  try {
    let upstream: Response;
    if ("nd" in ref && typeof ref.nd === "string") {
      upstream = await fetchCoverArt(ref.nd);
    } else {
      const url = String(ref.url);
      if (!(await isPublicUrl(url))) {
        res.writeHead(404).end();
        return;
      }
      // No redirects: a public URL could otherwise bounce the request to a private address
      upstream = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "error" });
    }
    const type = upstream.headers.get("content-type") ?? "";
    const length = Number(upstream.headers.get("content-length") ?? 0);
    if (!upstream.ok || !type.startsWith("image/") || length > MAX_BYTES) {
      res.writeHead(404).end();
      return;
    }
    const body = Buffer.from(await upstream.arrayBuffer());
    if (body.length > MAX_BYTES) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": body.length,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
  } catch {
    res.writeHead(502).end();
  }
}
