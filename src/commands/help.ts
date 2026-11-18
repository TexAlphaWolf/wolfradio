import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { COLOR } from "../music/embeds.js";
import type { Command } from "./types.js";

export const help: Command = {
  noCooldown: true,
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("How to use WolfRadio")
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle("🐺 WolfRadio")
      .setDescription("Type a song, pick the right result, listen together.")
      .addFields(
        {
          name: "Music",
          value: [
            "`/play` search and pick a song (optional `channel` and `source`)",
            ...(config.library.enabled ? ["`/random` shuffle your library (genre, years, `endless`)"] : []),
            "`/queue` · `/nowplaying` · `/remove` · `/clear`",
            "`/skip` (vote) · `/pause` · `/stop` · `/leave`",
            "`/loop` · `/shuffle` · `/volume` · `/filter`",
          ].join("\n"),
        },
        ...(config.radio.enabled
          ? [{ name: "Radio", value: "`/radio search` · `/radio random` · `/radio favorites` · `/radio save`" }]
          : []),
        ...(config.spotify.enabled
          ? [
              {
                name: "Spotify listening party",
                value: "`/party link` once · `/party start` · `/party add` · `/party join` · `/party sync` · `/party end`",
              },
            ]
          : []),
        { name: "Admin", value: "`/setup show` · `channel` · `djrole` · `requests` · `stay247`" },
        {
          name: "Sources",
          value: "📀 your library · 🌿 Creative Commons (Jamendo) · ⏱️ official 30s previews · 📻 web radio",
        },
        {
          name: "Where it plays",
          value: "WolfRadio plays in the voice channel chosen with `/setup channel`; the Now Playing card is in that channel's chat.",
        },
      );
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
