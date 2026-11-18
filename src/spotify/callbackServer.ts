import { createServer, type Server } from "node:http";
import { config } from "../config.js";
import { completeLink, SpotifyError } from "./api.js";

/**
 * Tiny HTTP server for the Spotify OAuth redirect.
 * With the default redirect (http://127.0.0.1:8888/callback) it only works on the machine running the bot;
 * everyone else lands on an error page and pastes that address into Discord instead.
 */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function page(title: string, message: string, ok: boolean): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>WolfRadio · ${escapeHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#151036;color:#f1f2ff;font:16px/1.5 system-ui,sans-serif}
main{max-width:420px;padding:32px;text-align:center}h1{font-size:22px;color:${ok ? "#5ff2cf" : "#ff8a8a"}}</style></head>
<body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

export function startCallbackServer(): Server {
  const callbackPath = new URL(config.spotify.redirectUri).pathname;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const send = (status: number, html: string) => {
      res.writeHead(status, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
    };

    if (req.method !== "GET" || url.pathname !== callbackPath) return send(404, page("Not found", "Nothing here.", false));

    const error = url.searchParams.get("error");
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (error) return send(400, page("Spotify not linked", `Spotify answered: ${error}. Run /party link to try again.`, false));
    if (!code || !state) return send(400, page("Spotify not linked", "The address is missing the code. Run /party link again.", false));

    try {
      await completeLink(code, state);
      send(200, page("Spotify linked ✅", "You can close this tab and go back to Discord. Use /party join to listen along.", true));
    } catch (err) {
      const message = err instanceof SpotifyError ? err.message : "Something went wrong.";
      if (!(err instanceof SpotifyError)) console.error("[spotify] callback failed:", err);
      send(400, page("Spotify not linked", message, false));
    }
  });

  server.listen(config.spotify.callbackPort, "0.0.0.0", () =>
    console.log(`[spotify] OAuth callback listening on port ${config.spotify.callbackPort} (${config.spotify.redirectUri})`),
  );
  server.on("error", (err) => console.error("[spotify] callback server error:", err.message));
  return server;
}
