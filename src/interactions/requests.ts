import type { Client, Message } from "discord.js";
import { buildSearchPicker } from "../commands/play.js";
import { config } from "../config.js";
import { COLOR_ERR, simpleEmbed } from "../music/embeds.js";
import { UserError } from "../music/player.js";
import { getSettings } from "../store.js";
import { resolveVoiceChannel } from "./picker.js";

/** Song-request channel: any message there is treated as a /play search by its author. */
export function registerRequestChannel(client: Client): void {
  if (!config.requestChannel.enabled) return;

  const lastRequest = new Map<string, number>();

  client.on("messageCreate", async (message: Message) => {
    if (!message.inGuild() || message.author.bot || !message.member) return;
    const { requestChannelId } = getSettings(message.guildId);
    if (message.channelId !== requestChannelId) return;

    const query = message.content.trim().slice(0, 200);
    if (!query) return;

    const now = Date.now();
    if ((lastRequest.get(message.author.id) ?? 0) + config.cooldownMs > now) return;
    lastRequest.set(message.author.id, now);

    try {
      const voice = resolveVoiceChannel(message.guild, message.member);
      await message.channel.sendTyping().catch(() => {});
      const picker = await buildSearchPicker(query, "auto", message.member, voice.id);
      const reply = await message.reply({ ...picker, allowedMentions: { repliedUser: false } });
      // Keep the request channel clean
      setTimeout(() => void reply.delete().catch(() => {}), 3 * 60 * 1000).unref();
    } catch (err) {
      const text = err instanceof UserError ? err.message : "Something went wrong with that request.";
      if (!(err instanceof UserError)) console.error("[requests]", err);
      const reply = await message.reply({ embeds: [simpleEmbed(text, COLOR_ERR)], allowedMentions: { repliedUser: false } }).catch(() => null);
      if (reply) setTimeout(() => void reply.delete().catch(() => {}), 15_000).unref();
    }
  });
}
