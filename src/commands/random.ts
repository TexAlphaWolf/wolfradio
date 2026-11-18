import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { resolveVoiceChannel } from "../interactions/picker.js";
import { enableAutoplay } from "../music/autoplay.js";
import { COLOR_OK, simpleEmbed } from "../music/embeds.js";
import { isDJ } from "../music/permissions.js";
import { enqueue, QueueLimitError, UserError } from "../music/player.js";
import { fromLibrary } from "../sources/catalog.js";
import { libraryGenres, randomLibrarySongs } from "../sources/navidrome.js";
import { truncate } from "../util/text.js";
import type { Command } from "./types.js";

export const random: Command = {
  data: new SlashCommandBuilder()
    .setName("random")
    .setDescription("Shuffle: play random songs from your library")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName("count").setDescription("How many songs (default 20)").setMinValue(1).setMaxValue(50))
    .addStringOption((o) => o.setName("genre").setDescription("Only this genre").setAutocomplete(true).setMaxLength(100))
    .addIntegerOption((o) => o.setName("from_year").setDescription("Only songs from this year on").setMinValue(1900).setMaxValue(2100))
    .addIntegerOption((o) => o.setName("to_year").setDescription("Only songs up to this year").setMinValue(1900).setMaxValue(2100))
    .addBooleanOption((o) =>
      o.setName("endless").setDescription("Keep adding random songs until /stop (DJ)"),
    ),

  async execute(interaction) {
    const count = interaction.options.getInteger("count") ?? 20;
    const genre = interaction.options.getString("genre");
    const fromYear = interaction.options.getInteger("from_year");
    const toYear = interaction.options.getInteger("to_year");
    const endless = interaction.options.getBoolean("endless") ?? false;

    const voice = resolveVoiceChannel(interaction.guild, interaction.member);
    if (endless && !isDJ(interaction.member)) throw new UserError("Only DJs can start the endless shuffle.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const filter = { genre, fromYear, toYear };
    const songs = await randomLibrarySongs(count, filter);
    if (songs.length === 0) {
      throw new UserError(genre || fromYear || toYear ? "No songs in your library match those filters." : "Your library is empty.");
    }

    const ctx = {
      guild: interaction.guild,
      member: interaction.member,
      voiceChannelId: voice.id,
      textChannelId: voice.id,
    };
    let added = 0;
    let limitHit = false;
    let lastPlayer = null;
    for (const song of songs) {
      try {
        const { player } = await enqueue(ctx, fromLibrary(song));
        lastPlayer = player;
        added++;
      } catch (err) {
        if (err instanceof QueueLimitError) {
          limitHit = true;
          break;
        }
        if (added === 0) throw err; // the first one failing means something is wrong (busy bots, Lavalink down…)
      }
    }
    if (added === 0) throw new UserError("Couldn't queue any song from your library.");

    if (endless && lastPlayer) {
      enableAutoplay(lastPlayer, filter, { id: interaction.user.id, username: interaction.user.username }, songs.map((s) => s.id));
    }

    const filters = [genre && `genre **${truncate(genre, 40)}**`, fromYear && `from ${fromYear}`, toYear && `to ${toYear}`]
      .filter(Boolean)
      .join(", ");
    const lines = [
      `🔀 Added **${added}** random song${added === 1 ? "" : "s"} from your library${filters ? ` (${filters})` : ""} in <#${voice.id}>.`,
      endless ? "♾️ Endless shuffle is on — new songs keep coming until `/stop`." : "",
      limitHit ? "Some were skipped: you reached your queue limit." : "",
    ].filter(Boolean);
    await interaction.editReply({ embeds: [simpleEmbed(lines.join("\n"), COLOR_OK)] });
  },

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const genres = await libraryGenres().catch(() => []);
    await interaction.respond(
      genres
        .filter((g) => g.name.toLowerCase().includes(typed))
        .slice(0, 25)
        .map((g) => ({ name: truncate(`${g.name} (${g.songs})`, 100), value: g.name.slice(0, 100) })),
    );
  },
};
