import {
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { assertDJ, getActivePlayer } from "../music/controls.js";
import { COLOR, controlRow, nowPlayingEmbed } from "../music/embeds.js";
import { KIND_BADGE, metaOf, requesterOf } from "../music/meta.js";
import { isDJ } from "../music/permissions.js";
import { UserError } from "../music/player.js";
import { send } from "../util/reply.js";
import { formatDuration, truncate } from "../util/text.js";
import type { Command } from "./types.js";

const PAGE_SIZE = 10;

export const queue: Command = {
  noCooldown: true,
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the queue")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName("page").setDescription("Page number").setMinValue(1)),
  async execute(interaction) {
    const player = getActivePlayer(interaction.member);
    const tracks = player.queue.tracks;
    const pages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
    const page = Math.min(pages, interaction.options.getInteger("page") ?? 1);
    const start = (page - 1) * PAGE_SIZE;

    const current = player.queue.current;
    const lines = tracks.slice(start, start + PAGE_SIZE).map((t, idx) => {
      const meta = metaOf(t);
      const badge = meta ? KIND_BADGE[meta.kind].split(" ")[0] : "🎵";
      const who = requesterOf(t);
      return `\`${start + idx + 1}.\` ${badge} ${truncate(t.info.title, 60)} · ${formatDuration(t.info.duration)}${who ? ` · <@${who.id}>` : ""}`;
    });

    const total = tracks.reduce((sum, t) => sum + (t.info.isStream ? 0 : t.info.duration ?? 0), 0);
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("Queue")
      .setDescription(
        [
          current ? `**Now:** ${truncate(current.info.title, 80)}` : "**Now:** nothing",
          "",
          lines.length ? lines.join("\n") : "_The queue is empty — add songs with `/play`._",
        ].join("\n"),
      )
      .setFooter({
        text: `Page ${page}/${pages} · ${tracks.length} songs · ${formatDuration(total)} · loop: ${player.repeatMode}`,
      });
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};

export const nowplaying: Command = {
  noCooldown: true,
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the song that's playing")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const player = getActivePlayer(interaction.member);
    const track = player.queue.current;
    if (!track) throw new UserError("Nothing is playing right now.");
    await interaction.reply({ embeds: [nowPlayingEmbed(player, track)], components: [controlRow(player)] });
  },
};

export const remove: Command = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove a song from the queue")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName("position").setDescription("Position from /queue").setRequired(true).setMinValue(1)),
  async execute(interaction) {
    const player = getActivePlayer(interaction.member);
    const index = interaction.options.getInteger("position", true) - 1;
    const track = player.queue.tracks[index];
    if (!track) throw new UserError("There's no song at that position.");
    // Members can remove their own songs, DJs anything
    if (requesterOf(track)?.id !== interaction.user.id && !isDJ(interaction.member, player)) {
      throw new UserError("You can only remove songs you added.");
    }
    await player.queue.splice(index, 1);
    await send(interaction, `🗑️ Removed **${truncate(track.info.title, 80)}**`);
  },
};

export const clear: Command = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Clear the queue but keep the current song (DJ)")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const player = getActivePlayer(interaction.member);
    assertDJ(interaction.member, player);
    const count = player.queue.tracks.length;
    await player.queue.splice(0, count);
    await send(interaction, `🧹 Cleared ${count} songs from the queue`);
  },
};
