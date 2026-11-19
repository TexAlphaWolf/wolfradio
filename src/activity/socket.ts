import type { Guild, GuildMember } from "discord.js";
import type { WebSocket } from "ws";
import { setLoop, shuffle, skip, stop, togglePause } from "../music/controls.js";
import { refreshNowPlaying } from "../music/events.js";
import { mainInstance } from "../music/instances.js";
import { requesterOf } from "../music/meta.js";
import { isDJ } from "../music/permissions.js";
import { enqueue, UserError } from "../music/player.js";
import { queueRandom } from "../music/randomPlay.js";
import { resolveVoiceChannel } from "../interactions/picker.js";
import { findCandidates } from "../sources/catalog.js";
import type { Candidate } from "../types.js";
import { buildState, playerOf, stateKey } from "./snapshot.js";
import { CLOSE_NOT_MEMBER, CLOSE_UNAUTHORIZED, type ClientMessage, type ServerMessage } from "./protocol.js";
import type { Session } from "./sessions.js";

/**
 * One connection = one person with the Activity open. Every action goes through the same
 * functions as the slash commands, so DJ rules, vote-skip and queue limits are identical.
 */

const TICK_MS = 1000;
const POSITION_SYNC_MS = 5000;
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 20;

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function parse(raw: unknown): ClientMessage | null {
  try {
    const msg = JSON.parse(String(raw)) as ClientMessage;
    return msg && typeof msg === "object" && typeof msg.t === "string" ? msg : null;
  } catch {
    return null;
  }
}

function requirePlayer(guildId: string) {
  const player = playerOf(guildId);
  if (!player?.connected || !player.queue.current) throw new UserError("Nothing is playing right now.");
  return player;
}

async function act(msg: ClientMessage, guild: Guild, member: GuildMember, searches: Map<number, Candidate[]>, ws: WebSocket): Promise<string | null> {
  switch (msg.t) {
    case "ping":
      send(ws, { t: "pong" });
      return null;
    case "pause": {
      const player = requirePlayer(guild.id);
      const text = await togglePause(member, player);
      await refreshNowPlaying(player);
      return text;
    }
    case "skip":
      return skip(member, requirePlayer(guild.id));
    case "stop":
      return stop(member, requirePlayer(guild.id));
    case "loop": {
      const player = requirePlayer(guild.id);
      const text = await setLoop(member, player);
      await refreshNowPlaying(player);
      return text;
    }
    case "shuffle":
      return shuffle(member, requirePlayer(guild.id));
    case "remove": {
      const player = requirePlayer(guild.id);
      const track = Number.isInteger(msg.index) ? player.queue.tracks[msg.index] : undefined;
      if (!track) throw new UserError("That song isn't in the queue anymore.");
      if (requesterOf(track)?.id !== member.id && !isDJ(member, player)) throw new UserError("You can only remove songs you added.");
      await player.queue.splice(msg.index, 1);
      return `🗑️ Removed ${track.info.title}`;
    }
    case "search": {
      const query = String(msg.query ?? "").trim().slice(0, 200);
      if (!query) return null;
      const candidates = await findCandidates(query, "auto");
      searches.set(msg.id, candidates);
      for (const id of searches.keys()) if (searches.size > 3 && id !== msg.id) searches.delete(id);
      send(ws, {
        t: "results",
        id: msg.id,
        items: candidates.map((c) => ({ emoji: c.emoji, label: c.label, description: c.description })),
      });
      return null;
    }
    case "add": {
      const candidate = searches.get(msg.id)?.[msg.index];
      if (!candidate) throw new UserError("Those results expired — search again.");
      const voice = resolveVoiceChannel(guild, member);
      const playable = await candidate.resolve();
      if (!playable) throw new UserError("No playable version found for that song.");
      const { position } = await enqueue({ guild, member, voiceChannelId: voice.id, textChannelId: voice.id }, playable);
      return position === 0 ? `▶️ Playing ${playable.title}` : `➕ ${playable.title} added at #${position}`;
    }
    case "random": {
      const voice = resolveVoiceChannel(guild, member);
      const { added } = await queueRandom(
        { guild, member, voiceChannelId: voice.id, textChannelId: voice.id },
        { count: 15, filter: {}, endless: !!msg.endless },
      );
      return `🔀 Added ${added} random songs${msg.endless ? " · endless shuffle on" : ""}`;
    }
    default:
      return null;
  }
}

export async function handleSocket(ws: WebSocket, session: Session | null, guildId: string): Promise<void> {
  if (!session) return ws.close(CLOSE_UNAUTHORIZED, "sign in again");
  const guild = mainInstance().client.guilds.cache.get(guildId);
  const member = guild ? await guild.members.fetch(session.userId).catch(() => null) : null;
  if (!guild || !member) return ws.close(CLOSE_NOT_MEMBER, "WolfRadio isn't in this server, or you aren't a member");

  const searches = new Map<number, Candidate[]>();
  let lastKey = "";
  let lastSent = 0;
  let alive = true;
  const hits: number[] = [];

  const push = (force = false) => {
    const fresh = guild.members.cache.get(member.id) ?? member;
    const state = buildState(guild, fresh);
    const key = stateKey(state);
    if (force || key !== lastKey) {
      lastKey = key;
      lastSent = Date.now();
      send(ws, { t: "state", state });
    } else if (Date.now() - lastSent >= POSITION_SYNC_MS && state.current) {
      lastSent = Date.now();
      send(ws, { t: "pos", positionMs: state.current.positionMs, paused: state.current.paused, at: state.at });
    }
  };

  const tick = setInterval(() => push(), TICK_MS);
  const heartbeat = setInterval(() => {
    if (!alive) return ws.terminate();
    alive = false;
    ws.ping();
  }, 25_000);
  ws.on("pong", () => (alive = true));
  ws.on("close", () => {
    clearInterval(tick);
    clearInterval(heartbeat);
  });

  ws.on("message", async (raw) => {
    const now = Date.now();
    while (hits.length && hits[0]! < now - RATE_WINDOW_MS) hits.shift();
    if (hits.length >= RATE_MAX) return send(ws, { t: "toast", text: "Slow down a little 🙂", error: true });
    hits.push(now);

    const msg = parse(raw);
    if (!msg) return;
    const fresh = guild.members.cache.get(member.id) ?? member;
    try {
      const text = await act(msg, guild, fresh, searches, ws);
      if (text) send(ws, { t: "toast", text });
      if (msg.t !== "ping" && msg.t !== "search") push(true);
    } catch (err) {
      if (!(err instanceof UserError)) console.error("[activity] action failed:", err);
      send(ws, { t: "toast", text: err instanceof UserError ? err.message : "Something went wrong.", error: true });
    }
  });

  console.log(`[activity] ${session.name} opened WolfRadio in ${guild.name}`);
  push(true);
}
