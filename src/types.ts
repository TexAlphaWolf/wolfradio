export type PlayableKind = "library" | "jamendo" | "preview" | "radio";

/** Something Lavalink can stream, plus the metadata we show in Discord. */
export interface Playable {
  kind: PlayableKind;
  /** Direct audio URL handed to Lavalink — never shown to users. */
  streamUrl: string;
  title: string;
  artist: string;
  durationMs?: number | null;
  artworkUrl?: string | null;
  /** Public page for the song or station, safe to show. */
  link?: string | null;
  license?: { name: string; url: string } | null;
  radio?: { uuid: string; country: string; countryCode: string; tags: string };
}

/** One entry in a "pick the right result" menu. */
export interface Candidate {
  label: string;
  description: string;
  emoji: string;
  resolve: () => Promise<Playable | null>;
}
