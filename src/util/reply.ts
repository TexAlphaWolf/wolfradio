import { MessageFlags, type EmbedBuilder, type RepliableInteraction } from "discord.js";
import { COLOR, COLOR_ERR, simpleEmbed } from "../music/embeds.js";
import { autoDeleteMessage } from "./autodelete.js";

/** Replies, follows up or edits depending on the interaction state. */
export async function send(
  interaction: RepliableInteraction,
  content: string | EmbedBuilder,
  options: { ephemeral?: boolean; error?: boolean } = {},
): Promise<void> {
  const embed = typeof content === "string" ? simpleEmbed(content, options.error ? COLOR_ERR : COLOR) : content;
  const flags = options.ephemeral ? MessageFlags.Ephemeral : undefined;
  // A button that used deferUpdate() edits the card it sits on: answer with a new message instead
  const updatedCard = interaction.isMessageComponent() && interaction.deferred;
  if (interaction.deferred && !updatedCard) {
    await interaction.editReply({ embeds: [embed], components: [] });
  } else if (interaction.replied || updatedCard) {
    // Follow-ups are separate messages: they need their own timer (original replies are handled by the router)
    autoDeleteMessage(await interaction.followUp({ embeds: [embed], flags }));
  } else {
    await interaction.reply({ embeds: [embed], flags });
  }
}

export function sendError(interaction: RepliableInteraction, text: string): Promise<void> {
  return send(interaction, text, { ephemeral: true, error: true });
}
