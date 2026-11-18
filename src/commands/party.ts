import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { config } from "../config.js";
import { createChoiceMenu } from "../interactions/choice.js";
import { COLOR, COLOR_ERR, COLOR_OK, simpleEmbed } from "../music/embeds.js";
import { isDJ } from "../music/permissions.js";
import { UserError } from "../music/player.js";
import { authUrl, completeLink, searchTracks, SpotifyError } from "../spotify/api.js";
import {
  addTrack,
  createParty,
  endParty,
  getParty,
  joinParty,
  leaveParty,
  OUTCOME_TEXT,
  playNext,
  resync,
  showParty,
  togglePartyPause,
  type Party,
} from "../spotify/party.js";
import { deleteTokens, isLinked } from "../spotify/tokens.js";
import { send } from "../util/reply.js";
import { formatDuration, truncate } from "../util/text.js";
import type { Command } from "./types.js";

function requireParty(guildId: string): Party {
  const party = getParty(guildId);
  if (!party) throw new UserError("There's no listening party right now — start one with `/party start`.");
  return party;
}

function assertHost(member: GuildMember, party: Party): void {
  if (member.id !== party.hostId && !isDJ(member)) throw new UserError("Only the party host or a DJ can do that.");
}

function outcomeMessage(outcome: string): string {
  return outcome === "ok" ? "✅ You're in sync." : `⚠️ Joined, but: ${OUTCOME_TEXT[outcome as keyof typeof OUTCOME_TEXT]}`;
}

export const party: Command = {
  // The Spotify login can take a while: keep the "Connect Spotify" buttons for 14 minutes
  replyLifetimeMs: (i) => (i.options.getSubcommand() === "link" ? 14 * 60 * 1000 : config.autoDeleteMs),
  data: new SlashCommandBuilder()
    .setName("party")
    .setDescription("Spotify listening party: everyone hears the same song on their own Spotify")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) => s.setName("start").setDescription("Start a party in this channel"))
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a song from Spotify")
        .addStringOption((o) => o.setName("query").setDescription("Title, artist…").setRequired(true).setMaxLength(200)),
    )
    .addSubcommand((s) => s.setName("join").setDescription("Listen along on your Spotify"))
    .addSubcommand((s) => s.setName("leave").setDescription("Stop listening along"))
    .addSubcommand((s) => s.setName("sync").setDescription("Re-sync your Spotify with the party"))
    .addSubcommand((s) => s.setName("queue").setDescription("Show the party queue"))
    .addSubcommand((s) => s.setName("pause").setDescription("Pause or resume for everyone (host/DJ)"))
    .addSubcommand((s) => s.setName("skip").setDescription("Skip to the next song (host/DJ)"))
    .addSubcommand((s) => s.setName("end").setDescription("End the party (host/DJ)"))
    .addSubcommand((s) => s.setName("link").setDescription("Connect your Spotify account"))
    .addSubcommand((s) => s.setName("unlink").setDescription("Disconnect your Spotify account and delete its tokens")),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const { guildId, member } = interaction;

    switch (sub) {
      case "link":
        return void (await interaction.reply(linkReply(interaction.user.id)));

      case "unlink": {
        const removed = deleteTokens(interaction.user.id);
        const p = getParty(guildId);
        if (p?.members.has(interaction.user.id)) await leaveParty(p, interaction.user.id);
        return send(interaction, removed ? "🔌 Spotify disconnected and tokens deleted." : "Your Spotify isn't linked.", {
          ephemeral: true,
        });
      }

      case "start": {
        if (getParty(guildId)) throw new UserError("A party is already running. Join it with `/party join`.");
        const p = createParty(guildId, interaction.channelId, interaction.user.id);
        await interaction.reply({
          embeds: [
            simpleEmbed(
              `🎧 ${member} started a listening party!\nPress **Join** below or use \`/party join\` — you need Spotify (Premium) linked with \`/party link\`.`,
              COLOR_OK,
            ),
          ],
        });
        await showParty(p, true);
        if (!isLinked(interaction.user.id)) await interaction.followUp({ ...linkReply(interaction.user.id) });
        return;
      }

      case "add": {
        const p = requireParty(guildId);
        const query = interaction.options.getString("query", true);
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const tracks = await searchTracks(query);
        if (!tracks.length) return void (await interaction.editReply({ embeds: [simpleEmbed(`No results for **${query}**.`, COLOR_ERR)] }));
        await interaction.editReply(
          createChoiceMenu({
            userId: interaction.user.id,
            title: `Spotify results for "${query}"`,
            description: "Pick a song for the party queue.",
            options: tracks.map((t) => ({
              emoji: "🟢",
              label: `${t.name} — ${t.artists}`,
              description: `${t.album} · ${formatDuration(t.durationMs)}`,
            })),
            onChoose: async (choice, index) => {
              const track = tracks[index];
              if (!track) return;
              const live = getParty(guildId);
              if (live !== p) {
                await choice.update({ embeds: [simpleEmbed("The party has ended.", COLOR_ERR)], components: [] });
                return;
              }
              await choice.deferUpdate();
              const position = await addTrack(p, track, choice.user.id);
              const where = position === 0 ? "▶️ Playing now" : `➕ Added at **#${position}**`;
              await choice.editReply({ embeds: [simpleEmbed(`${where}: **${truncate(track.name, 80)}** — ${truncate(track.artists, 60)}`, COLOR_OK)], components: [] });
            },
          }),
        );
        return;
      }

      case "join": {
        const outcome = await joinParty(requireParty(guildId), interaction.user.id);
        return send(interaction, outcomeMessage(outcome), { ephemeral: true });
      }

      case "leave": {
        await leaveParty(requireParty(guildId), interaction.user.id);
        return send(interaction, "👋 You left the party (your Spotify was paused).", { ephemeral: true });
      }

      case "sync": {
        const outcome = await resync(requireParty(guildId), interaction.user.id);
        return send(interaction, outcomeMessage(outcome), { ephemeral: true });
      }

      case "queue": {
        const p = requireParty(guildId);
        const lines = p.queue.slice(0, 15).map((t, i) => `\`${i + 1}.\` ${truncate(t.track.name, 60)} — ${truncate(t.track.artists, 40)} · <@${t.requestedBy}>`);
        const embed = new EmbedBuilder()
          .setColor(COLOR)
          .setTitle("🎧 Party queue")
          .setDescription(
            `${p.current ? `**Now:** ${truncate(p.current.track.name, 80)}` : "**Now:** nothing"}\n\n${lines.join("\n") || "_Empty — add songs with `/party add`._"}`,
          )
          .setFooter({ text: `${p.queue.length} songs · ${p.members.size} listening` });
        return void (await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }));
      }

      case "pause": {
        const p = requireParty(guildId);
        assertHost(member, p);
        if (!p.current) throw new UserError("Nothing is playing.");
        const playing = await togglePartyPause(p);
        return send(interaction, playing ? "▶️ Resumed for everyone" : "⏸️ Paused for everyone");
      }

      case "skip": {
        const p = requireParty(guildId);
        assertHost(member, p);
        if (!p.current) throw new UserError("Nothing to skip.");
        const skipped = p.current.track.name;
        await interaction.deferReply();
        await playNext(p);
        return send(interaction, `⏭️ Skipped **${truncate(skipped, 80)}**`);
      }

      case "end": {
        const p = requireParty(guildId);
        assertHost(member, p);
        await interaction.deferReply();
        await endParty(p);
        return send(interaction, "🎧 Party ended — thanks for listening!");
      }
    }
  },
};

/** Ephemeral message with the Spotify login button and the "paste the address" fallback. */
function linkReply(userId: string) {
  const embed = new EmbedBuilder()
    .setColor(0x1db954)
    .setTitle("Connect Spotify")
    .setDescription(
      [
        "1. Press **Connect Spotify** and log in.",
        "2. If you end up on a page that **doesn't load** (normal unless you're on the bot's computer), copy its address from the browser bar.",
        "3. Press **Paste address** and paste it.",
        "",
        "WolfRadio can only start, pause and sync songs on your Spotify. You can disconnect anytime with `/party unlink`.",
      ].join("\n"),
    );
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setURL(authUrl(userId)).setLabel("Connect Spotify").setStyle(ButtonStyle.Link),
    new ButtonBuilder().setCustomId("splink:paste").setLabel("Paste address").setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row], flags: MessageFlags.Ephemeral as const };
}

export async function handlePartyButton(interaction: ButtonInteraction<"cached">): Promise<void> {
  const action = interaction.customId.slice("party:".length);
  if (action === "join" || action === "sync") {
    const p = requireParty(interaction.guildId);
    const outcome = action === "join" ? await joinParty(p, interaction.user.id) : await resync(p, interaction.user.id);
    return send(interaction, outcomeMessage(outcome), { ephemeral: true });
  }
  const p = requireParty(interaction.guildId);
  assertHost(interaction.member, p);
  if (action === "pause") {
    await interaction.deferUpdate();
    await togglePartyPause(p);
  } else if (action === "skip") {
    await interaction.deferUpdate();
    await playNext(p);
  }
}

export async function showLinkModal(interaction: ButtonInteraction<"cached">): Promise<void> {
  const modal = new ModalBuilder()
    .setCustomId("splink:modal")
    .setTitle("Finish connecting Spotify")
    .addLabelComponents((label) =>
      label
        .setLabel("Address of the page you landed on")
        .setDescription("It starts with http://127.0.0.1 and contains code=…")
        .setTextInputComponent(
          new TextInputBuilder().setCustomId("url").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(2000),
        ),
    );
  await interaction.showModal(modal);
}

export async function handleLinkModal(interaction: ModalSubmitInteraction<"cached">): Promise<void> {
  const raw = interaction.fields.getTextInputValue("url").trim();
  let code: string | null = null;
  let state: string | null = null;
  try {
    const url = new URL(raw);
    code = url.searchParams.get("code");
    state = url.searchParams.get("state");
  } catch {
    // not a URL
  }
  if (!code || !state) throw new UserError("That doesn't look like the right address — it must contain `code=` and `state=`.");
  try {
    await completeLink(code, state, interaction.user.id);
  } catch (err) {
    if (err instanceof SpotifyError) throw new UserError(`Spotify linking failed: ${err.message}`);
    throw err;
  }
  await send(interaction, "✅ Spotify connected! Use `/party join` (or the Join button) to listen along.", { ephemeral: true });
}
