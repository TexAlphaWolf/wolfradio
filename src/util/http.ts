const USER_AGENT = "WolfRadio/0.1 (+https://github.com/TexAlphaWolf/wolfradio)";

export async function getJson<T>(url: string | URL, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  }
  return (await res.json()) as T;
}

/** Fire-and-forget GET (used for radio-browser click counting). */
export function ping(url: string | URL): void {
  fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5000) }).catch(() => {});
}
