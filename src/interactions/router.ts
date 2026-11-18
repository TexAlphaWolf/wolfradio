import type { ButtonInteraction, Client, Interaction } from "discord.js";
import { config } from "../config.js";
import { commands } from "../commands/index.js";
import { handleLinkModal, handlePartyButton, showLinkModal } from "../commands/party.js";
import { getPlayerByInstance, setLoop, shuffle, skip, stop, togglePause } from "../music/controls.js";
import { refreshNowPlaying } from "../music/events.js";
import { UserError } from "../music/player.js";
import { autoDeleteReply } from "../util/autodelete.js";
import { send, sendError } from "../util/reply.js";
import { handleChoice, handleChoiceCancel } from "./choice.js";

const cooldowns = new Map<string, number>();

function onCooldown(key: string): number {
  const now = Date.now();
  const until = cooldowns.get(key) ?? 0;
  if (until > now) return Math.ceil((until - now) / 1000);
  cooldowns.set(key, now + config.cooldownMs);
  return 0;
}

async function handleControlButton(interaction: ButtonInteraction<"cached">): Promise<void> {
  // ctl:<action>:<bot number>
  const [, action, instanceId] = interaction.customId.split(":");
  const player = getPlayerByInstance(Number(instanceId ?? 0), interaction.guildId);
  const member = interaction.member;
  let text: string;
  switch (action) {
    case "pause":
      text = await togglePause(member, player);
      break;
    case "skip":
      text = await skip(member, player);
      break;
    case "stop":
      text = await stop(member, player);
      break;
    case "loop":
      text = await setLoop(member, player);
      break;
    case "shuffle":
      text = await shuffle(member, player);
      break;
    default:
      return;
  }
  if (action === "pause" || action === "loop") await refreshNowPlaying(player);
  // Skips and stops are announced publicly; the rest only to the clicker
  await send(interaction, `${text} — by ${member}`, { ephemeral: !(action === "skip" || action === "stop") });
}

async function handle(interaction: Interaction): Promise<void> {
  if (!interaction.inCachedGuild()) {
    if (interaction.isRepliable()) await sendError(interaction, "WolfRadio only works inside servers.");
    return;
  }

  if (interaction.isAutocomplete()) {
    await commands.get(interaction.commandName)?.autocomplete?.(interaction);
    return;
  }

  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) return;
    if (!command.noCooldown) {
      const wait = onCooldown(`${interaction.user.id}:${interaction.commandName}`);
      if (wait) return sendError(interaction, `Slow down — try again in ${wait}s.`);
    }
    try {
      await command.execute(interaction);
    } finally {
      autoDeleteReply(interaction, command.replyLifetimeMs?.(interaction) ?? config.autoDeleteMs);
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("pick:")) {
    await handleChoice(interaction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "splink:modal") {
    try {
      await handleLinkModal(interaction);
    } finally {
      autoDeleteReply(interaction);
    }
    return;
  }

  if (interaction.isButton()) {
    const id = interaction.customId;
    if (id.startsWith("pickcancel:")) return handleChoiceCancel(interaction);
    if (id === "splink:paste") return showLinkModal(interaction);
    if (id.startsWith("ctl:") || id.startsWith("party:")) {
      const wait = onCooldown(`${interaction.user.id}:button`);
      if (wait) return sendError(interaction, `Slow down — try again in ${wait}s.`);
      try {
        return await (id.startsWith("ctl:") ? handleControlButton(interaction) : handlePartyButton(interaction));
      } finally {
        // deferUpdate() means the card itself was edited — never delete that
        if (interaction.replied && !interaction.deferred) autoDeleteReply(interaction);
      }
    }
  }
}

/** Attached to every bot account: buttons on a message reach the bot that sent it. */
export function registerInteractions(client: Client): void {
  client.on("interactionCreate", async (interaction) => {
    try {
      await handle(interaction);
    } catch (err) {
      if (!(err instanceof UserError)) console.error("[interaction]", err);
      if (interaction.isRepliable()) {
        const text = err instanceof UserError ? err.message : "Something went wrong. Please try again.";
        await sendError(interaction, text).catch(() => {});
        if (!(interaction.isMessageComponent() && interaction.deferred)) autoDeleteReply(interaction);
      }
    }
  });
}
