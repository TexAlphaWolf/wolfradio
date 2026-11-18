import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { COLOR, COLOR_ERR, simpleEmbed } from "../music/embeds.js";
import { truncate } from "../util/text.js";

/**
 * Generic "pick one of these" select menu, used by /play, /radio and /party.
 * The callback runs when the owner picks an option; sessions expire after 2 minutes.
 */

export interface ChoiceOption {
  label: string;
  description: string;
  emoji: string;
}

export type ChoiceHandler = (interaction: StringSelectMenuInteraction<"cached">, index: number) => Promise<void>;

interface ChoiceSession {
  userId: string;
  expiresAt: number;
  onChoose: ChoiceHandler;
}

const TTL_MS = 2 * 60 * 1000;
const sessions = new Map<string, ChoiceSession>();

setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) if (s.expiresAt < now) sessions.delete(id);
}, 60_000).unref();

export function createChoiceMenu(params: {
  userId: string;
  title: string;
  description: string;
  footer?: string;
  options: ChoiceOption[];
  onChoose: ChoiceHandler;
}) {
  const id = randomUUID();
  const options = params.options.slice(0, 25);
  sessions.set(id, { userId: params.userId, expiresAt: Date.now() + TTL_MS, onChoose: params.onChoose });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`pick:${id}`)
    .setPlaceholder("Choose the right one…")
    .addOptions(
      options.map((o, index) => ({
        label: truncate(o.label, 100),
        description: truncate(o.description, 100),
        emoji: o.emoji,
        value: String(index),
      })),
    );
  const cancel = new ButtonBuilder().setCustomId(`pickcancel:${id}`).setLabel("Cancel").setStyle(ButtonStyle.Secondary);

  const embed = new EmbedBuilder().setColor(COLOR).setTitle(truncate(params.title, 256)).setDescription(params.description);
  if (params.footer) embed.setFooter({ text: params.footer });

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(cancel),
    ],
  };
}

export async function handleChoice(interaction: StringSelectMenuInteraction<"cached">): Promise<void> {
  const id = interaction.customId.slice("pick:".length);
  const session = sessions.get(id);
  if (!session) {
    await interaction.update({ embeds: [simpleEmbed("This menu expired — search again.", COLOR_ERR)], components: [] });
    return;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      embeds: [simpleEmbed("This menu belongs to someone else.", COLOR_ERR)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  sessions.delete(id);
  await session.onChoose(interaction, Number(interaction.values[0]));
}

export async function handleChoiceCancel(interaction: ButtonInteraction<"cached">): Promise<void> {
  const id = interaction.customId.slice("pickcancel:".length);
  const session = sessions.get(id);
  if (session && session.userId !== interaction.user.id) {
    await interaction.reply({
      embeds: [simpleEmbed("This menu belongs to someone else.", COLOR_ERR)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  sessions.delete(id);
  await interaction.update({ embeds: [simpleEmbed("Search cancelled.")], components: [] });
}
