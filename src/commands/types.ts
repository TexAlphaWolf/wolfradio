import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";

export interface Command {
  data: { name: string; toJSON(): unknown };
  /** Skips the per-user cooldown (cheap read-only commands). */
  noCooldown?: boolean;
  /** How long the reply stays before being deleted (default AUTO_DELETE_SECONDS). */
  replyLifetimeMs?: (interaction: ChatInputCommandInteraction<"cached">) => number;
  execute(interaction: ChatInputCommandInteraction<"cached">): Promise<void>;
  autocomplete?(interaction: AutocompleteInteraction<"cached">): Promise<void>;
}
