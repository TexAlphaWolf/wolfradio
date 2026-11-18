const NOISE = /feat\.?|ft\.|with |remaster|explicit|clean|album version|single version|radio edit|mono|stereo/i;

/**
 * Lowercase, strip accents, "(feat. …)", "- Remastered …" and punctuation, for fuzzy title matching.
 * Version info such as "(Live)" or "(Acoustic)" is kept, so a live take never matches the studio one.
 */
export function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[([](.*?)[)\]]\s*/g, (_m, inner: string) => (NOISE.test(inner) ? " " : ` ${inner} `))
    .replace(/\s+-\s+(.*)$/, (m, tail: string) => (NOISE.test(tail) ? "" : m))
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sameSong(a: { title: string; artist: string }, b: { title: string; artist: string }): boolean {
  const titleA = normalize(a.title);
  const titleB = normalize(b.title);
  if (!titleA || titleA !== titleB) return false;
  const artistA = normalize(a.artist);
  const artistB = normalize(b.artist);
  return artistA === artistB || artistA.includes(artistB) || artistB.includes(artistA);
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms <= 0) return "LIVE";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function flagEmoji(countryCode: string | null | undefined): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "🌍";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
