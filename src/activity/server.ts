import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { config } from "../config.js";
import { handleArt } from "./art.js";
import { handleSocket } from "./socket.js";
import { newSession, readSession } from "./sessions.js";

/**
 * WolfRadio V2 — the Activity's web server, running inside the bot process.
 *   GET  /            the web app (built by Vite into dist/activity-web)
 *   GET  /api/config  public client id
 *   POST /api/token   OAuth code → access token + WolfRadio session
 *   GET  /api/art     signed artwork proxy
 *   WS   /api/ws      live state and controls
 * Discord reaches it through a tunnel (URL Mapping "/" → this server).
 */

const webRoot = fileURLToPath(new URL("../activity-web/", import.meta.url));
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit = 8 * 1024): Promise<string> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Exchanges the code from discordSdk.commands.authorize() and identifies the user. */
async function handleToken(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let code: unknown;
  try {
    code = (JSON.parse(await readBody(req)) as { code?: unknown }).code;
  } catch {
    return json(res, 400, { error: "bad request" });
  }
  if (typeof code !== "string" || code.length > 200) return json(res, 400, { error: "missing code" });

  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.activity.clientSecret,
      grant_type: "authorization_code",
      code,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!tokenRes.ok) return json(res, 401, { error: "Discord refused the authorization" });
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch("https://discord.com/api/v10/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!meRes.ok) return json(res, 401, { error: "Could not identify the user" });
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };

  json(res, 200, { access_token, session: newSession({ userId: me.id, name: me.global_name ?? me.username }) });
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const urlPath = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = path.normalize(path.join(webRoot, urlPath));
  if (!file.startsWith(webRoot)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = path.join(webRoot, "index.html"); // SPA fallback
  if (!existsSync(file)) {
    res.writeHead(503, { "Content-Type": "text/plain" }).end("Activity not built — run `npm run build:activity`.");
    return;
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    "Content-Type": MIME[ext] ?? "application/octet-stream",
    // Vite puts a content hash in asset names: cache those forever, never the HTML
    "Cache-Control": file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  createReadStream(file).pipe(res);
}

export function startActivityServer(): Server {
  const server = createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    try {
      if (req.method === "GET" && pathname === "/api/config") return json(res, 200, { clientId: config.clientId });
      if (req.method === "GET" && pathname === "/api/health") return json(res, 200, { ok: true });
      if (req.method === "POST" && pathname === "/api/token") return await handleToken(req, res);
      if (req.method === "GET" && pathname === "/api/art") return await handleArt(req, res);
      if (pathname.startsWith("/api/")) return json(res, 404, { error: "not found" });
      if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res);
      res.writeHead(405).end();
    } catch (err) {
      console.error("[activity] request failed:", (err as Error).message);
      if (!res.headersSent) json(res, 500, { error: "internal error" });
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname !== "/api/ws") return socket.destroy();
    const session = readSession(url.searchParams.get("session"));
    const guildId = url.searchParams.get("guild") ?? "";
    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => void handleSocket(ws, session, guildId));
  });

  server.listen(config.activity.port, "0.0.0.0", () =>
    console.log(`[activity] web app and API on port ${config.activity.port}`),
  );
  server.on("error", (err) => console.error("[activity] server error:", err.message));
  return server;
}
