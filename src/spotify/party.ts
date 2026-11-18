import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import { COLOR } from "../music/embeds.js";
import { mainInstance } from "../music/instances.js";
import { autoDeleteMessage } from "../util/autodelete.js";
import { formatDuration, truncate } from "../util/text.js";
import { pauseFor, playFor, type PlayOutcome, type SpotifyTrack } from "./api.js";

/**
 * Listening party: WolfRadio keeps a shared queue and a clock, and starts the same track at the
 * same position on every member's own Spotify app. Nothing is streamed through Discord, so each
 * listener's own Spotify subscription covers the rights.
 */

export interface PartyTrack {
  track: SpotifyTrack;
  requestedBy: string;
}

export interface Party {
  guildId: string;
  textChannelId: string;
  hostId: string;
  members: Set<string>;
  queue: PartyTrack[];
  current: PartyTrack | null;
  startedAt: number;
  pausedAt: number | null;
  timer: NodeJS.Timeout | null;
  message: Message | null;
  problems: Map<string, PlayOutcome>;
}

const parties = new Map<string, Party>();

export const OUTCOME_TEXT: Record<Exclude<PlayOutcome, "ok">, string> = {
  "not-linked": "Spotify not linked — use `/party link`",
  "no-device": "no Spotify app open — open Spotify on any device, then `/party sync`",
  premium: "needs Spotify Premium (and to be on the app's user list)",
  error: "Spotify didn't respond — try `/party sync`",
};

export function getParty(guildId: string): Party | undefined {
  return parties.get(guildId);
}

export function createParty(guildId: string, textChannelId: string, hostId: string): Party {
  const party: Party = {
    guildId,
    textChannelId,
    hostId,
    members: new Set([hostId]),
    queue: [],
    current: null,
    startedAt: 0,
    pausedAt: null,
    timer: null,
    message: null,
    problems: new Map(),
  };
  parties.set(guildId, party);
  return party;
}

export function elapsed(party: Party): number {
  if (!party.current) return 0;
  return (party.pausedAt ?? Date.now()) - party.startedAt;
}

function channel(party: Party): GuildTextBasedChannel | null {
  const ch = mainInstance().client.channels.cache.get(party.textChannelId);
  return ch?.isTextBased() && !ch.isDMBased() ? ch : null;
}

function partyEmbed(party: Party): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(0x1db954).setAuthor({ name: "🎧 Spotify listening party" });
  const cur = party.current;
  if (!cur) {
    embed.setDescription("Nothing playing — add songs with `/party add`.");
  } else {
    embed
      .setDescription(`[${truncate(cur.track.name, 80)}](${cur.track.url})\n${truncate(cur.track.artists, 80)}`)
      .addFields(
        { name: "Duration", value: formatDuration(cur.track.durationMs), inline: true },
        { name: "Requested by", value: `<@${cur.requestedBy}>`, inline: true },
        { name: "Status", value: party.pausedAt ? "⏸️ Paused" : "▶️ Playing", inline: true },
      );
    if (cur.track.imageUrl) embed.setThumbnail(cur.track.imageUrl);
  }

  const synced = [...party.members].filter((id) => !party.problems.has(id));
  embed.addFields({ name: `Listening along (${synced.length}/${party.members.size})`, value: synced.map((id) => `<@${id}>`).join(" ") || "—" });
  if (party.problems.size) {
    embed.addFields({
      name: "Needs attention",
      value: truncate(
        [...party.problems].map(([id, outcome]) => `<@${id}>: ${OUTCOME_TEXT[outcome as Exclude<PlayOutcome, "ok">]}`).join("\n"),
        1024,
      ),
    });
  }
  const next = party.queue[0];
  embed.setFooter({
    text: `${next ? `Up next: ${truncate(next.track.name, 60)} · ` : ""}${party.queue.length} in queue · Host can /party pause, skip, end`,
  });
  return embed;
}

function partyButtons(party: Party): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("party:join").setLabel("Join").setEmoji("🎧").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("party:sync").setLabel("Sync me").setEmoji("🔄").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("party:pause")
      .setEmoji(party.pausedAt ? "▶️" : "⏸️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!party.current),
    new ButtonBuilder().setCustomId("party:skip").setEmoji("⏭️").setStyle(ButtonStyle.Secondary).setDisabled(!party.current),
  );
  if (party.current) {
    row.addComponents(new ButtonBuilder().setURL(party.current.track.url).setLabel("Open in Spotify").setStyle(ButtonStyle.Link));
  }
  return [row];
}

/** Reposts the party card at the bottom of the channel (new track) or edits it in place. */
export async function showParty(party: Party, repost = false): Promise<void> {
  const payload = { embeds: [partyEmbed(party)], components: partyButtons(party) };
  if (party.message && !repost) {
    await party.message.edit(payload).catch(() => {});
    return;
  }
  await party.message?.delete().catch(() => {});
  party.message = (await channel(party)?.send(payload).catch(() => null)) ?? null;
}

async function syncUsers(party: Party, userIds: string[]): Promise<void> {
  const cur = party.current;
  if (!cur || party.pausedAt) return;
  const position = elapsed(party);
  const results = await Promise.all(userIds.map(async (id) => [id, await playFor(id, cur.track.uri, position)] as const));
  for (const [id, outcome] of results) {
    if (outcome === "ok") party.problems.delete(id);
    else party.problems.set(id, outcome);
  }
}

function schedule(party: Party): void {
  if (party.timer) clearTimeout(party.timer);
  party.timer = null;
  if (!party.current || party.pausedAt) return;
  const remaining = party.current.track.durationMs - elapsed(party);
  party.timer = setTimeout(() => void playNext(party), Math.max(500, remaining + 300));
}

export async function playNext(party: Party): Promise<void> {
  party.current = party.queue.shift() ?? null;
  party.startedAt = Date.now();
  party.pausedAt = null;
  if (party.current) await syncUsers(party, [...party.members]);
  schedule(party);
  await showParty(party, true);
}

export async function addTrack(party: Party, track: SpotifyTrack, userId: string): Promise<number> {
  party.queue.push({ track, requestedBy: userId });
  if (!party.current) {
    await playNext(party);
    return 0;
  }
  await showParty(party);
  return party.queue.length;
}

export async function joinParty(party: Party, userId: string): Promise<PlayOutcome> {
  party.members.add(userId);
  if (!party.current || party.pausedAt) {
    party.problems.delete(userId);
    await showParty(party);
    return "ok";
  }
  await syncUsers(party, [userId]);
  await showParty(party);
  return party.problems.get(userId) ?? "ok";
}

export async function leaveParty(party: Party, userId: string): Promise<void> {
  party.members.delete(userId);
  party.problems.delete(userId);
  await pauseFor(userId);
  await showParty(party);
}

export async function resync(party: Party, userId: string): Promise<PlayOutcome> {
  if (!party.members.has(userId)) return joinParty(party, userId);
  await syncUsers(party, [userId]);
  await showParty(party);
  return party.problems.get(userId) ?? "ok";
}

export async function togglePartyPause(party: Party): Promise<boolean> {
  if (!party.current) return false;
  if (party.pausedAt) {
    party.startedAt += Date.now() - party.pausedAt; // shift the clock by the paused time
    party.pausedAt = null;
    await syncUsers(party, [...party.members]);
  } else {
    party.pausedAt = Date.now();
    await Promise.all([...party.members].map((id) => pauseFor(id)));
  }
  schedule(party);
  await showParty(party);
  return party.pausedAt === null;
}

export async function endParty(party: Party): Promise<void> {
  if (party.timer) clearTimeout(party.timer);
  parties.delete(party.guildId);
  await Promise.all([...party.members].map((id) => pauseFor(id)));
  await party.message?.edit({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription("🎧 The listening party has ended.")], components: [] }).catch(() => {});
  autoDeleteMessage(party.message);
}
