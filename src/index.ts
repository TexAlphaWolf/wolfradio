import { ActivityType, Client, EmbedBuilder, Events, GatewayIntentBits, PermissionFlagsBits, type Guild } from "discord.js";
import { config, validateConfig } from "./config.js";
import { registerInteractions } from "./interactions/router.js";
import { registerRequestChannel } from "./interactions/requests.js";
import { destroyPlayer, IDLE_ACTIVITY, registerPlayerEvents } from "./music/events.js";
import { addInstance, allInstances, type Instance } from "./music/instances.js";
import { createLavalink } from "./music/lavalink.js";
import { startActivityServer } from "./activity/server.js";
import { startCallbackServer } from "./spotify/callbackServer.js";
import { pingLibrary } from "./sources/navidrome.js";
import { flushStore, loadStore } from "./store.js";

const problems = validateConfig();
if (problems.length) {
  console.error("Configuration problems:\n - " + problems.join("\n - "));
  process.exit(1);
}

loadStore();

/** First steps message when WolfRadio joins a server: the music channel must be chosen before anything plays. */
async function welcome(guild: Guild): Promise<void> {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🐺 Thanks for adding WolfRadio!")
    .setDescription(
      [
        "WolfRadio plays in **one voice channel** of this server. An admin chooses it with:",
        "`/setup channel channel:#your-voice-channel`",
        "",
        "Then join it and try `/play` or `/help`.",
      ].join("\n"),
    );
  const me = guild.members.me;
  const target =
    (guild.systemChannel && me && guild.systemChannel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)
      ? guild.systemChannel
      : null) ?? null;
  if (target) {
    await target.send({ embeds: [embed] }).catch(() => {});
  } else {
    const owner = await guild.fetchOwner().catch(() => null);
    await owner?.send({ embeds: [embed] }).catch(() => {});
  }
}

async function startInstance(id: number, token: string): Promise<Instance> {
  const isMain = id === 0;
  const label = `bot #${id + 1}`;
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates];
  if (isMain && config.requestChannel.enabled) {
    // Privileged: enable "Message Content Intent" in the Developer Portal
    intents.push(GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent);
  }

  const client = new Client({ intents });
  const manager = createLavalink(client, label);
  const instance: Instance = { id, client, manager };
  addInstance(instance);

  registerPlayerEvents(instance);
  registerInteractions(client); // buttons on a message reach the bot that sent it
  if (isMain) {
    registerRequestChannel(client);
    client.on(Events.GuildCreate, (guild) => {
      console.log(`[discord] added to server "${guild.name}"`);
      void welcome(guild);
    });
  }

  client.once(Events.ClientReady, async (ready) => {
    console.log(`[discord] ${label} logged in as ${ready.user.tag} in ${ready.guilds.cache.size} server(s)`);
    ready.user.setActivity({ name: IDLE_ACTIVITY, type: ActivityType.Listening });
    await manager.init({ id: ready.user.id, username: ready.user.username });
  });

  await client.login(token);
  return instance;
}

await startInstance(0, config.token);

if (config.library.enabled) {
  // Navidrome may still be starting when the bot boots (they start together in Docker): retry for ~30 s
  void (async () => {
    for (let attempt = 1; attempt <= 6; attempt++) {
      if (await pingLibrary()) return console.log("[library] Navidrome reachable");
      await new Promise((r) => setTimeout(r, 5000));
    }
    console.warn("[library] Navidrome NOT reachable — check NAVIDROME_* settings and that the navidrome container is running");
  })();
}
const callbackServer = config.spotify.enabled ? startCallbackServer() : null;
const activityServer = config.activity.enabled ? startActivityServer() : null;

const features = [
  config.library.enabled && "library",
  config.jamendo.enabled && "jamendo",
  config.previews.enabled && "previews",
  config.radio.enabled && "radio",
  config.lyrics.enabled && "lyrics",
  config.spotify.enabled && "spotify-party",
  config.activity.enabled && "activity",
].filter(Boolean);
console.log(`[sources] enabled: ${features.join(", ")}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`[shutdown] ${signal} received`);
  try {
    flushStore();
    callbackServer?.close();
    activityServer?.close();
    const players = allInstances().flatMap((i) => [...i.manager.players.values()]);
    await Promise.allSettled(players.map((p) => destroyPlayer(p, "bot shutting down")));
  } finally {
    await Promise.allSettled(allInstances().map((i) => i.client.destroy()));
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => console.error("[unhandledRejection]", reason));
