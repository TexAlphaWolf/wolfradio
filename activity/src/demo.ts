import type { ActivityState } from "../../src/activity/protocol";

/** Sample data for ?demo (outside Discord). The lyrics are placeholder lines, not a real song. */
export function demoState(): ActivityState {
  const lines = [
    "Lights low on the highway",
    "Engines humming in the dark",
    "Every mile a little louder",
    "Every sign a little far",
    "",
    "Howl with me under the streetlights",
    "Turn the radio up to the moon",
    "Nobody sleeps in this city tonight",
    "We'll be gone by the afternoon",
    "",
    "Cold wind on the overpass",
    "Static singing in the speakers",
  ];
  return {
    guildName: "BotsTest",
    channel: { id: "1", name: "DJSet" },
    me: { id: "1", name: "WerewolfTex", dj: true, inChannel: true },
    connected: true,
    current: {
      title: "Midnight Static",
      artist: "The Northern Pack",
      kind: "library",
      art: null,
      durationMs: 214_000,
      isStream: false,
      requestedBy: "texwerewolf",
      mine: true,
      license: null,
      positionMs: 51_500,
      paused: false,
    },
    queue: [
      { title: "Silver Lining Run", artist: "Moon Harbor", kind: "library", art: null, durationMs: 198_000, isStream: false, requestedBy: "texwerewolf", mine: true, license: null },
      { title: "Paper Satellites", artist: "Lowlight", kind: "jamendo", art: null, durationMs: 241_000, isStream: false, requestedBy: "fr4nky", mine: false, license: "CC BY 4.0" },
      { title: "Coastline (Live)", artist: "Hollow Pines", kind: "preview", art: null, durationMs: 30_000, isStream: false, requestedBy: "fr4nky", mine: false, license: null },
      { title: "Radio Nordlicht", artist: "Germany", kind: "radio", art: null, durationMs: 0, isStream: true, requestedBy: "texwerewolf", mine: true, license: null },
    ],
    queueTotal: 4,
    loop: "off",
    endless: true,
    volume: 60,
    lyrics: { status: "synced", lines: lines.map((text, i) => ({ t: 30_000 + i * 4_000, text })) },
    features: { library: true, radio: true },
    at: Date.now(),
  };
}
