import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { config } from "./config.js";

/**
 * Registers the slash commands with Discord.
 * With DEV_GUILD_ID set they appear instantly in that server; otherwise globally (can take a few minutes).
 */
if (!config.token || !config.clientId) {
  console.error("DISCORD_TOKEN and CLIENT_ID are required");
  process.exit(1);
}

const body = [...commands.values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token);

const route = config.devGuildId
  ? Routes.applicationGuildCommands(config.clientId, config.devGuildId)
  : Routes.applicationCommands(config.clientId);

await rest.put(route, { body });
console.log(`Registered ${body.length} commands ${config.devGuildId ? `in guild ${config.devGuildId}` : "globally"}.`);
