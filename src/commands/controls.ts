import { InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import type { RepeatMode } from "lavalink-client";
import { assertDJ, getActivePlayer, leave as doLeave, setLoop, shuffle as doShuffle, skip as doSkip, stop as doStop, togglePause } from "../music/controls.js";
import { refreshNowPlaying } from "../music/events.js";
import { UserError } from "../music/player.js";
import { updateSettings } from "../store.js";
import { send } from "../util/reply.js";
import type { Command } from "./types.js";

type Action = (i: ChatInputCommandInteraction<"cached">) => Promise<string>;

function simple(name: string, description: string, action: Action): Command {
  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild),
    async execute(interaction) {
      const text = await action(interaction);
      await send(interaction, text);
    },
  };
}

const player = (i: ChatInputCommandInteraction<"cached">) => getActivePlayer(i.member);

export const skip = simple("skip", "Skip the current song (or vote to skip)", (i) => doSkip(i.member, player(i)));
export const stop = simple("stop", "Stop the music and clear the queue (DJ)", (i) => doStop(i.member, player(i)));
export const leave = simple("leave", "Disconnect from the voice channel (DJ)", (i) => doLeave(i.member, player(i)));
export const shuffle = simple("shuffle", "Shuffle the queue (DJ)", (i) => doShuffle(i.member, player(i)));

export const pause = simple("pause", "Pause or resume the music (DJ)", async (i) => {
  const p = player(i);
  const text = await togglePause(i.member, p);
  await refreshNowPlaying(p);
  return text;
});

export const loop: Command = {
  data: new SlashCommandBuilder()
    .setName("loop")
    .setDescription("Loop the track or the queue (DJ)")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("mode")
        .setDescription("Loop mode")
        .setRequired(true)
        .addChoices({ name: "Off", value: "off" }, { name: "Track", value: "track" }, { name: "Queue", value: "queue" }),
    ),
  async execute(interaction) {
    const p = player(interaction);
    const text = await setLoop(interaction.member, p, interaction.options.getString("mode", true) as RepeatMode);
    await refreshNowPlaying(p);
    await send(interaction, text);
  },
};

export const volume: Command = {
  data: new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set the volume (DJ)")
    .setContexts(InteractionContextType.Guild)
    .addIntegerOption((o) => o.setName("level").setDescription("0-150").setRequired(true).setMinValue(0).setMaxValue(150)),
  async execute(interaction) {
    const p = player(interaction);
    assertDJ(interaction.member, p);
    const level = interaction.options.getInteger("level", true);
    await p.setVolume(level);
    updateSettings(interaction.guildId, (s) => {
      s.volume = level;
    });
    await send(interaction, `🔊 Volume set to **${level}%**`);
  },
};

const FILTERS = {
  off: "Off",
  bassboost: "Bass boost",
  nightcore: "Nightcore",
  vaporwave: "Vaporwave",
  "8d": "8D audio",
  karaoke: "Karaoke",
  lowpass: "Low pass",
  pop: "EQ: Pop",
  rock: "EQ: Rock",
  electronic: "EQ: Electronic",
} as const;
type FilterName = keyof typeof FILTERS;

export const filter: Command = {
  data: new SlashCommandBuilder()
    .setName("filter")
    .setDescription("Apply an audio filter (DJ)")
    .setContexts(InteractionContextType.Guild)
    .addStringOption((o) =>
      o
        .setName("preset")
        .setDescription("Filter")
        .setRequired(true)
        .addChoices(...Object.entries(FILTERS).map(([value, name]) => ({ name, value }))),
    ),
  async execute(interaction) {
    const p = player(interaction);
    assertDJ(interaction.member, p);
    const preset = interaction.options.getString("preset", true) as FilterName;
    const fm = p.filterManager;
    await fm.resetFilters();
    await fm.clearEQ();
    switch (preset) {
      case "bassboost":
        await fm.setEQPreset("BassboostMedium");
        break;
      case "nightcore":
        await fm.toggleNightcore();
        break;
      case "vaporwave":
        await fm.toggleVaporwave();
        break;
      case "8d":
        await fm.toggleRotation(0.2);
        break;
      case "karaoke":
        await fm.toggleKaraoke();
        break;
      case "lowpass":
        await fm.toggleLowPass(20);
        break;
      case "pop":
        await fm.setEQPreset("Pop");
        break;
      case "rock":
        await fm.setEQPreset("Rock");
        break;
      case "electronic":
        await fm.setEQPreset("Electronic");
        break;
      case "off":
        break;
      default:
        throw new UserError("Unknown filter.");
    }
    await send(interaction, preset === "off" ? "🎛️ Filters cleared" : `🎛️ Filter: **${FILTERS[preset]}**`);
  },
};
