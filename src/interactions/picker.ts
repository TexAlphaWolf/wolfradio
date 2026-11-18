import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type VoiceBasedChannel,
} from "discord.js";
import { getSettings } from "../store.js";
import { COLOR_ERR, COLOR_OK, simpleEmbed } from "../music/embeds.js";
import { allInstances, canUse } from "../music/instances.js";
import { KIND_BADGE } from "../music/meta.js";
import { enqueue, UserError } from "../music/player.js";
import type { Candidate, Playable } from "../types.js";
import { truncate } from "../util/text.js";
import { createChoiceMenu } from "./choice.js";

/**
 * The music channel chosen with /setup channel. WolfRadio only ever plays there,
 * and posts its Now Playing cards in that channel's built-in text chat.
 */
export function resolveVoiceChannel(guild: Guild, member: GuildMember): VoiceBasedChannel {
  const { musicChannelId } = getSettings(guild.id);
  const channel = musicChannelId ? guild.channels.cache.get(musicChannelId) : null;
  if (!channel?.isVoiceBased()) {
    throw new UserError("No music channel set yet — an admin can choose it with `/setup channel`.");
  }
  if (!channel.permissionsFor(member).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
    throw new UserError(`Music plays in ${channel}, and you don't have access to it.`);
  }
  if (!allInstances().some((i) => canUse(i, guild.id, channel.id))) {
    throw new UserError(`I need the **View Channel**, **Connect** and **Speak** permissions in ${channel}.`);
  }
  return channel;
}

export function queuedEmbed(playable: Playable, position: number, voiceChannelId: string): EmbedBuilder {
  const where = position === 0 ? `▶️ Playing now in <#${voiceChannelId}>` : `➕ Added to the queue at **#${position}**`;
  const live = playable.kind === "radio" ? "\n🔴 Live stream — it plays until someone uses `/skip`." : "";
  return new EmbedBuilder()
    .setColor(COLOR_OK)
    .setDescription(
      `${where}\n**${truncate(playable.title, 100)}** — ${truncate(playable.artist, 80)}\n${KIND_BADGE[playable.kind]}${live}`,
    );
}

/** The "which one did you mean?" menu for songs and stations. */
export function createPicker(
  session: { userId: string; voiceChannelId: string; textChannelId: string; candidates: Candidate[] },
  title: string,
) {
  const candidates = session.candidates.slice(0, 25);
  return createChoiceMenu({
    userId: session.userId,
    title,
    description: `Pick a result — it will play in <#${session.voiceChannelId}>.`,
    footer: "📀 your library · 🌿 Creative Commons · 🔎 catalog (full if available, else 30s preview)",
    options: candidates,
    onChoose: async (interaction, index) => {
      const candidate = candidates[index];
      if (!candidate) return;
      await interaction.update({ embeds: [simpleEmbed(`${candidate.emoji} Loading **${candidate.label}**…`)], components: [] });
      try {
        const playable = await candidate.resolve();
        if (!playable) {
          throw new UserError("No playable version found (not in your library, no Creative Commons match and no preview).");
        }
        resolveVoiceChannel(interaction.guild, interaction.member); // settings may have changed meanwhile
        const { position } = await enqueue(
          {
            guild: interaction.guild,
            member: interaction.member,
            voiceChannelId: session.voiceChannelId,
            textChannelId: session.textChannelId,
          },
          playable,
        );
        await interaction.editReply({ embeds: [queuedEmbed(playable, position, session.voiceChannelId)], components: [] });
      } catch (err) {
        const text = err instanceof UserError ? err.message : "Something went wrong while loading that track.";
        if (!(err instanceof UserError)) console.error("[pick]", err);
        await interaction.editReply({ embeds: [simpleEmbed(text, COLOR_ERR)], components: [] }).catch(() => {});
      }
    },
  });
}
