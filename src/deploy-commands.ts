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

const PRIMARY_ENTRY_POINT = 4;
const body: unknown[] = [...commands.values()].map((c) => c.data.toJSON());
const rest = new REST().setToken(config.token);

/**
 * The Activity's "Launch" button is an Entry Point command. Discord usually creates it when Activities
 * are enabled; if it's missing we create it. Entry points can only be global, and handler 2
 * (DISCORD_LAUNCH_ACTIVITY) means Discord opens the Activity itself — the bot gets no interaction.
 */
const ENTRY_POINT = {
  name: "launch",
  description: "Open WolfRadio in this voice channel",
  type: PRIMARY_ENTRY_POINT,
  handler: 2,
  integration_types: [0, 1],
  contexts: [0, 1, 2],
};

const existing = (await rest.get(Routes.applicationCommands(config.clientId))) as { type: number }[];
let entryPoints = existing.filter((c) => c.type === PRIMARY_ENTRY_POINT);

if (config.devGuildId) {
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.devGuildId), { body });
  console.log(`Registered ${body.length} commands in guild ${config.devGuildId}.`);
  if (config.activity.enabled && entryPoints.length === 0) {
    await rest.post(Routes.applicationCommands(config.clientId), { body: ENTRY_POINT });
    console.log("Created the Activity Launch command (global).");
  }
} else {
  // A bulk overwrite of global commands must keep the entry point
  if (config.activity.enabled && entryPoints.length === 0) entryPoints = [ENTRY_POINT as unknown as { type: number }];
  await rest.put(Routes.applicationCommands(config.clientId), { body: [...body, ...entryPoints] });
  console.log(`Registered ${body.length} commands globally${entryPoints.length ? " + the Activity Launch command" : ""}.`);
}
