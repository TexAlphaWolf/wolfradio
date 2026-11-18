import type { Message, RepliableInteraction } from "discord.js";
import { config } from "../config.js";

/**
 * Keeps channels tidy: bot messages disappear after AUTO_DELETE_SECONDS (default 3 minutes).
 * The live "Now playing" and party cards are not passed here — they are replaced or removed on their own.
 */

export function autoDeleteMessage(message: Message | null | undefined, ms = config.autoDeleteMs): void {
  if (!message || ms <= 0) return;
  setTimeout(() => void message.delete().catch(() => {}), ms).unref();
}

/** Deletes the interaction's original reply. Interaction tokens last 15 minutes, so ms must stay below that. */
export function autoDeleteReply(interaction: RepliableInteraction, ms = config.autoDeleteMs): void {
  if (ms <= 0 || !(interaction.replied || interaction.deferred)) return;
  setTimeout(() => void interaction.deleteReply().catch(() => {}), Math.min(ms, 14 * 60 * 1000)).unref();
}
