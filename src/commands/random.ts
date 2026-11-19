import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { resolveVoiceChannel } from "../interactions/picker.js";
import { COLOR_OK, simpleEmbed } from "../music/embeds.js";
import { queueRandom } from "../music/randomPlay.js";
import { libraryGenres } from "../sources/navidrome.js";
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ctx = { guild: interaction.guild, member: interaction.member, voiceChannelId: voice.id, textChannelId: voice.id };
    const { added, limitHit } = await queueRandom(ctx, { count, filter: { genre, fromYear, toYear }, endless });

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
