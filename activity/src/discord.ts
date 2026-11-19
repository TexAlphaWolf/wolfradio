import { DiscordSDK } from "@discord/embedded-app-sdk";

/** Signs the user in through Discord and gets a WolfRadio session from the bot. */

export interface Connection {
  sdk: DiscordSDK;
  session: string;
  guildId: string;
}

export class NotInDiscordError extends Error {}

let sdk: DiscordSDK | null = null;

export async function connectDiscord(): Promise<Connection> {
  const { clientId } = (await (await fetch("/api/config")).json()) as { clientId: string };
  if (!sdk) {
    try {
      sdk = new DiscordSDK(clientId);
    } catch {
      throw new NotInDiscordError("Open WolfRadio from a Discord voice channel, using the Activities button.");
    }
    await sdk.ready();
  }
  if (!sdk.guildId) throw new NotInDiscordError("WolfRadio works inside a server's voice channel, not in DMs.");

  const { code } = await sdk.commands.authorize({
    client_id: clientId,
    response_type: "code",
    state: "",
    prompt: "none",
    scope: ["identify", "applications.commands"],
  });

  const res = await fetch("/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error("Signing in with Discord failed. Close and reopen the Activity.");
  const { access_token, session } = (await res.json()) as { access_token: string; session: string };
  await sdk.commands.authenticate({ access_token });
  return { sdk, session, guildId: sdk.guildId };
}
