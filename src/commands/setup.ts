import {
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { config } from "../config.js";
import { cancelLeave, scheduleLeave } from "../music/idle.js";
import { COLOR } from "../music/embeds.js";
import { playersInGuild } from "../music/instances.js";
import { UserError } from "../music/player.js";
import { getSettings, updateSettings } from "../store.js";
import { send } from "../util/reply.js";
import type { Command } from "./types.js";

export const setup: Command = {
  noCooldown: true,
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Configure WolfRadio for this server")
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName("show").setDescription("Show the current settings"))
    .addSubcommand((s) =>
      s
        .setName("djrole")
        .setDescription("Set the DJ role (leave empty to let everyone be DJ)")
        .addRoleOption((o) => o.setName("role").setDescription("DJ role")),
    )
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("The voice channel WolfRadio plays in (its chat also gets the Now Playing card)")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Voice channel")
            .setRequired(true)
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("requests")
        .setDescription("Song-request channel: type a title there to get the picker (empty = off)")
        .addChannelOption((o) =>
          o.setName("channel").setDescription("Text channel").addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("stay247")
        .setDescription("Stay in the voice channel even when idle")
        .addBooleanOption((o) => o.setName("enabled").setDescription("On or off").setRequired(true)),
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "show") {
      const s = getSettings(guildId);
      const embed = new EmbedBuilder()
        .setColor(COLOR)
        .setTitle("WolfRadio settings")
        .addFields(
          { name: "DJ role", value: s.djRoleId ? `<@&${s.djRoleId}>` : "None (everyone is DJ)", inline: true },
          { name: "24/7", value: s.stay247 ? "On" : "Off", inline: true },
          { name: "Volume", value: `${s.volume}%`, inline: true },
          {
            name: "Music channel",
            value: s.musicChannelId ? `<#${s.musicChannelId}>` : "⚠️ Not set — use `/setup channel`",
          },
          {
            name: "Request channel",
            value: s.requestChannelId
              ? `<#${s.requestChannelId}>${config.requestChannel.enabled ? "" : " (disabled in the bot config)"}`
              : "Off",
            inline: true,
          },
          {
            name: "Extras",
            value:
              [
                config.lyrics.enabled && "🎤 Lyrics",
                config.voiceStatus && "🏷️ Voice status",
                config.spotify.enabled && "🎧 Spotify party",
              ]
                .filter(Boolean)
                .join(" · ") || "None",
            inline: true,
          },
          {
            name: "Sources",
            value:
              [
                config.library.enabled && "📀 Library",
                config.jamendo.enabled && "🌿 Jamendo",
                config.previews.enabled && "⏱️ Previews",
                config.radio.enabled && "📻 Radio",
              ]
                .filter(Boolean)
                .join(" · ") || "None",
            inline: true,
          },
        );
      await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "djrole") {
      const role = interaction.options.getRole("role");
      updateSettings(guildId, (s) => {
        s.djRoleId = role?.id ?? null;
      });
      await send(interaction, role ? `🎧 DJ role set to ${role}` : "🎧 DJ role removed — everyone can control the music", { ephemeral: true });
      return;
    }

    if (sub === "channel") {
      const channel = interaction.options.getChannel("channel", true);
      const me = interaction.guild.members.me;
      if (!channel.isVoiceBased() || !me) throw new UserError("Choose a voice channel.");
      const missing = channel
        .permissionsFor(me)
        .missing([
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ]);
      updateSettings(guildId, (s) => {
        s.musicChannelId = channel.id;
      });
      // Already playing somewhere else? Move there.
      for (const player of playersInGuild(guildId)) {
        if (player.voiceChannelId !== channel.id) {
          await player.changeVoiceState({ voiceChannelId: channel.id, selfDeaf: true });
          player.textChannelId = channel.id;
        }
      }
      const warning = missing.length ? `
⚠️ I'm missing these permissions there: ${missing.join(", ")}` : "";
      await send(interaction, `🔊 WolfRadio now plays in ${channel}.${warning}`, { ephemeral: true });
      return;
    }

    if (sub === "requests") {
      const channel = interaction.options.getChannel("channel");
      if (channel && !config.requestChannel.enabled) {
        throw new UserError("The request channel is disabled in the bot config (`ENABLE_REQUEST_CHANNEL`).");
      }
      updateSettings(guildId, (s) => {
        s.requestChannelId = channel?.id ?? null;
      });
      await send(interaction, channel ? `📝 Song requests: type a title in ${channel}` : "📝 Request channel turned off", {
        ephemeral: true,
      });
      return;
    }

    if (sub === "stay247") {
      const enabled = interaction.options.getBoolean("enabled", true);
      updateSettings(guildId, (s) => {
        s.stay247 = enabled;
      });
      for (const player of playersInGuild(guildId)) {
        if (enabled) cancelLeave(player);
        else if (!player.playing) scheduleLeave(player, "24/7 turned off");
      }
      await send(interaction, enabled ? "🌙 24/7 mode on" : "🌙 24/7 mode off", { ephemeral: true });
    }
  },
};
