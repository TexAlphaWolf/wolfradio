import type { Guild, GuildMember } from "discord.js";
import type { Player, Track } from "lavalink-client";
import { config } from "../config.js";
import { autoplayInfo } from "../music/autoplay.js";
import { mainInstance } from "../music/instances.js";
import { lyricsData } from "../music/lyrics.js";
import { metaOf, requesterOf } from "../music/meta.js";
import { isDJ } from "../music/permissions.js";
import { getSettings } from "../store.js";
import { artPath } from "./art.js";
import type { ActivityState, ActivityTrack } from "./protocol.js";

/** What the Activity shows, built from the bot's live player. Position is sent separately. */

function trackOf(track: Track, viewerId: string): ActivityTrack {
  const meta = metaOf(track);
  const external = track.info.artworkUrl?.startsWith("http") ? track.info.artworkUrl : null;
  return {
    title: track.info.title,
    artist: track.info.author,
    kind: meta?.kind ?? "library",
    art: artPath(meta?.coverId ? { nd: meta.coverId } : external ? { url: external } : null),
    durationMs: track.info.isStream ? 0 : track.info.duration ?? 0,
    isStream: track.info.isStream,
    requestedBy: requesterOf(track)?.username ?? null,
    mine: requesterOf(track)?.id === viewerId,
    license: meta?.licenseName ?? null,
  };
}

export function playerOf(guildId: string): Player | undefined {
  return mainInstance().manager.getPlayer(guildId);
}

export function buildState(guild: Guild, member: GuildMember): ActivityState {
  const settings = getSettings(guild.id);
  const channel = settings.musicChannelId ? guild.channels.cache.get(settings.musicChannelId) : null;
  const player = playerOf(guild.id);
  const current = player?.queue.current ?? null;
  const lyrics = player && current ? lyricsData(player) : { status: "off" as const, lines: [] };

  return {
    guildName: guild.name,
    channel: channel ? { id: channel.id, name: channel.name } : null,
    me: {
      id: member.id,
      name: member.displayName,
      dj: isDJ(member, player),
      inChannel: !!channel && member.voice.channelId === channel.id,
    },
    connected: !!player?.connected,
    current: current
      ? { ...trackOf(current, member.id), positionMs: player?.position ?? 0, paused: !!player?.paused }
      : null,
    queue: (player?.queue.tracks ?? []).slice(0, 50).map((t) => trackOf(t as Track, member.id)),
    queueTotal: player?.queue.tracks.length ?? 0,
    loop: player?.repeatMode ?? "off",
    endless: !!(player && autoplayInfo(player)),
    volume: player?.volume ?? settings.volume,
    lyrics: { status: lyrics.status, lines: lyrics.lines.map((l) => ({ t: l.timeMs, text: l.text })) },
    features: { library: config.library.enabled, radio: config.radio.enabled },
    at: Date.now(),
  };
}

/** Everything except the moving parts, to detect real changes cheaply. */
export function stateKey(state: ActivityState): string {
  const { at: _at, current, ...rest } = state;
  return JSON.stringify({ ...rest, current: current ? { ...current, positionMs: 0, art: current.art ? 1 : 0 } : null, queue: rest.queue.map((q) => [q.title, q.artist, q.requestedBy]) });
}
