import {
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { createPicker, queuedEmbed, resolveVoiceChannel } from "../interactions/picker.js";
import { assertDJ, getActivePlayer } from "../music/controls.js";
import { COLOR_ERR, simpleEmbed } from "../music/embeds.js";
import { metaOf } from "../music/meta.js";
import { isDJ } from "../music/permissions.js";
import { enqueue, UserError } from "../music/player.js";
import { fromStation, searchStations, stationCandidate } from "../sources/catalog.js";
import { getStation, type Station } from "../sources/radiobrowser.js";
import { getSettings, updateSettings, type FavoriteStation } from "../store.js";
import { truncate } from "../util/text.js";
import type { Command } from "./types.js";

function favoriteToStation(f: FavoriteStation): Station {
  return { ...f, codec: "", bitrate: 0 };
}

export const radio: Command = {
  data: new SlashCommandBuilder()
    .setName("radio")
    .setDescription("Free web radios from all over the world")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
        s
          .setName("search")
          .setDescription("Find a station by name, country or genre")
          .addStringOption((o) => o.setName("name").setDescription("Station name, e.g. Radio Deejay").setMaxLength(100))
          .addStringOption((o) =>
            o.setName("country").setDescription("Country name or 2-letter code, e.g. Japan or JP").setMaxLength(60),
          )
          .addStringOption((o) => o.setName("genre").setDescription("Genre/tag, e.g. jazz, lofi, rock").setMaxLength(60)),
    )
    .addSubcommand((s) =>
        s
          .setName("random")
          .setDescription("Play a random station")
          .addStringOption((o) => o.setName("genre").setDescription("Genre/tag, e.g. jazz").setMaxLength(60))
          .addStringOption((o) => o.setName("country").setDescription("Country name or 2-letter code").setMaxLength(60)),
    )
    .addSubcommand((s) => s.setName("favorites").setDescription("Pick one of the server's saved stations"))
    .addSubcommand((s) => s.setName("save").setDescription("Save the station that's playing now to the favorites (DJ)"))
    .addSubcommand((s) =>
      s
        .setName("unsave")
        .setDescription("Remove a station from the favorites (DJ)")
        .addStringOption((o) => o.setName("station").setDescription("Station").setRequired(true).setAutocomplete(true)),
    ),

  async execute(interaction: ChatInputCommandInteraction<"cached">) {
    const sub = interaction.options.getSubcommand();

    if (sub === "save") return save(interaction);
    if (sub === "unsave") return unsave(interaction);

    const voice = resolveVoiceChannel(interaction.guild, interaction.member);
    const country = interaction.options.getString("country");
    const genre = interaction.options.getString("genre");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let stations: Station[];
    let title: string;
    if (sub === "favorites") {
      stations = getSettings(interaction.guildId).favorites.map(favoriteToStation);
      title = "⭐ Favorite stations";
      if (stations.length === 0) throw new UserError("No favorites yet — play a station and use `/radio save`.");
    } else if (sub === "random") {
      const [station] = await searchStations({ tag: genre, country, random: true, limit: 1 });
      if (!station) throw new UserError("No station found with those filters.");
      const playable = fromStation(station);
      const { position } = await enqueue(
        { guild: interaction.guild, member: interaction.member, voiceChannelId: voice.id, textChannelId: voice.id },
        playable,
      );
      await interaction.editReply({ embeds: [queuedEmbed(playable, position, voice.id)] });
      return;
    } else {
      const name = interaction.options.getString("name");
      if (!name && !country && !genre) throw new UserError("Give me at least a name, a country or a genre.");
      stations = await searchStations({ name, country, tag: genre, limit: 25 });
      title = `📻 ${[name, genre, country].filter(Boolean).join(" · ")}`;
    }

    if (stations.length === 0) {
      await interaction.editReply({ embeds: [simpleEmbed("No stations found.", COLOR_ERR)] });
      return;
    }
    await interaction.editReply(
      createPicker(
        {
          userId: interaction.user.id,
          voiceChannelId: voice.id,
          textChannelId: voice.id,
          candidates: stations.map(stationCandidate),
        },
        title,
      ),
    );
  },

  async autocomplete(interaction) {
    const typed = interaction.options.getFocused().toLowerCase();
    const choices = getSettings(interaction.guildId)
      .favorites.filter((f) => f.name.toLowerCase().includes(typed))
      .slice(0, 25)
      .map((f) => ({ name: truncate(f.name, 100), value: f.uuid }));
    await interaction.respond(choices);
  },
};

async function save(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
  const player = getActivePlayer(interaction.member);
  assertDJ(interaction.member, player);
  const track = player.queue.current;
  const meta = metaOf(track);
  if (!track || meta?.kind !== "radio" || !meta.stationUuid) throw new UserError("The current track isn't a radio station.");

  // Look the station up again so we store its real stream URL, never anything user-supplied
  const station = await getStation(meta.stationUuid);
  if (!station) throw new UserError("Couldn't find that station in the directory anymore.");

  const settings = updateSettings(interaction.guildId, (s) => {
    if (s.favorites.some((f) => f.uuid === station.uuid)) return;
    s.favorites = [
      ...s.favorites,
      {
        uuid: station.uuid,
        name: station.name,
        streamUrl: station.streamUrl,
        homepage: station.homepage,
        favicon: station.favicon,
        country: station.country,
        countryCode: station.countryCode,
        tags: station.tags,
      },
    ].slice(-25);
  });
  await interaction.reply({
    embeds: [simpleEmbed(`⭐ Saved **${station.name}** (${settings.favorites.length}/25 favorites)`)],
  });
}

async function unsave(interaction: ChatInputCommandInteraction<"cached">): Promise<void> {
  const uuid = interaction.options.getString("station", true);
  if (!isDJ(interaction.member)) throw new UserError("Only DJs can edit the favorites.");
  let removed: string | null = null;
  updateSettings(interaction.guildId, (s) => {
    removed = s.favorites.find((f) => f.uuid === uuid)?.name ?? null;
    s.favorites = s.favorites.filter((f) => f.uuid !== uuid);
  });
  if (!removed) throw new UserError("That station isn't in the favorites.");
  await interaction.reply({ embeds: [simpleEmbed(`🗑️ Removed **${removed}** from the favorites.`)] });
}
