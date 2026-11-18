import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { config } from "../config.js";
import { createPicker, queuedEmbed, resolveVoiceChannel } from "../interactions/picker.js";
import { COLOR_ERR, simpleEmbed } from "../music/embeds.js";
import { enqueue, UserError } from "../music/player.js";
import { findCandidates, resolveDirectLink, type SearchSource } from "../sources/catalog.js";
import type { Command } from "./types.js";

const sourceChoices = [
  { name: "Auto (library + catalog)", value: "auto" },
  ...(config.library.enabled ? [{ name: "Only my library", value: "library" }] : []),
  ...(config.jamendo.enabled ? [{ name: "Only Creative Commons (Jamendo)", value: "jamendo" }] : []),
];

export const play: Command = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Search a song, pick the right result and play it")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o.setName("query").setDescription("Title, artist… or a Deezer track link").setRequired(true).setMaxLength(200),
    )
    .addStringOption((o) => o.setName("source").setDescription("Where to search").addChoices(...sourceChoices)),

  async execute(interaction: ChatInputCommandInteraction<"cached">) {
    const query = interaction.options.getString("query", true).trim();
    const source = (interaction.options.getString("source") ?? "auto") as SearchSource;
    const voice = resolveVoiceChannel(interaction.guild, interaction.member);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const direct = await resolveDirectLink(query);
    if (direct === null) throw new UserError("I couldn't find a playable version of that link.");
    if (direct) {
      const { position } = await enqueue(
        { guild: interaction.guild, member: interaction.member, voiceChannelId: voice.id, textChannelId: voice.id },
        direct,
      );
      await interaction.editReply({ embeds: [queuedEmbed(direct, position, voice.id)] });
      return;
    }

    const picker = await buildSearchPicker(query, source, interaction.member, voice.id);
    await interaction.editReply(picker);
  },
};

/** Shared with the song-request channel. */
export async function buildSearchPicker(
  query: string,
  source: SearchSource,
  member: GuildMember,
  voiceChannelId: string,
) {
  const candidates = await findCandidates(query, source);
  if (candidates.length === 0) {
    return { embeds: [simpleEmbed(`No results for **${query}**.`, COLOR_ERR)], components: [] };
  }
  return createPicker(
    { userId: member.id, voiceChannelId, textChannelId: voiceChannelId, candidates },
    `Results for "${query}"`,
  );
}
