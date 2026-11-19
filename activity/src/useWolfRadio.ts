import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityState, ClientMessage, SearchItem, ServerMessage } from "../../src/activity/protocol";
import { CLOSE_NOT_MEMBER, CLOSE_UNAUTHORIZED } from "../../src/activity/protocol";
import { connectDiscord, NotInDiscordError } from "./discord";
import { demoState } from "./demo";

export type Phase = { kind: "connecting" } | { kind: "ready" } | { kind: "error"; message: string };
export interface Toast {
  id: number;
  text: string;
  error?: boolean;
}

/** Live connection to the bot: state, position sync, search results, toasts and actions. */
export function useWolfRadio() {
  const [phase, setPhase] = useState<Phase>({ kind: "connecting" });
  const [state, setState] = useState<ActivityState | null>(null);
  const [results, setResults] = useState<{ id: number; items: SearchItem[] } | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const ws = useRef<WebSocket | null>(null);
  const searchId = useRef(0);
  const toastId = useRef(0);

  const toast = useCallback((text: string, error?: boolean) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  useEffect(() => {
    // ?demo shows sample data outside Discord (design work, README screenshots)
    if (new URLSearchParams(location.search).has("demo") && !location.search.includes("frame_id")) {
      setState(demoState());
      setPhase({ kind: "ready" });
      return;
    }

    let stopped = false;
    let retry = 0;

    const open = async () => {
      try {
        const { session, guildId } = await connectDiscord();
        if (stopped) return;
        const proto = location.protocol === "https:" ? "wss" : "ws";
        const socket = new WebSocket(`${proto}://${location.host}/api/ws?session=${encodeURIComponent(session)}&guild=${guildId}`);
        ws.current = socket;

        socket.onopen = () => {
          retry = 0;
          setPhase({ kind: "ready" });
        };
        socket.onmessage = (event) => {
          const msg = JSON.parse(String(event.data)) as ServerMessage;
          if (msg.t === "state") setState(msg.state);
          else if (msg.t === "pos")
            setState((s) => (s?.current ? { ...s, at: msg.at, current: { ...s.current, positionMs: msg.positionMs, paused: msg.paused } } : s));
          else if (msg.t === "results") {
            if (msg.id === searchId.current) setResults({ id: msg.id, items: msg.items });
          } else if (msg.t === "toast") toast(msg.text, msg.error);
        };
        socket.onclose = (event) => {
          if (stopped) return;
          if (event.code === CLOSE_NOT_MEMBER) return setPhase({ kind: "error", message: event.reason || "WolfRadio isn't in this server." });
          // Bot restarted (4001) or network hiccup: sign in again with backoff
          const wait = event.code === CLOSE_UNAUTHORIZED ? 500 : Math.min(15_000, 1000 * 2 ** retry++);
          setPhase({ kind: "connecting" });
          setTimeout(() => void open(), wait);
        };
      } catch (err) {
        if (stopped) return;
        if (err instanceof NotInDiscordError) return setPhase({ kind: "error", message: err.message });
        setPhase({ kind: "connecting" });
        setTimeout(() => void open(), Math.min(15_000, 1000 * 2 ** retry++));
      }
    };

    void open();
    return () => {
      stopped = true;
      ws.current?.close();
    };
  }, [toast]);

  const send = useCallback(
    (msg: ClientMessage) => {
      if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
      else toast("Reconnecting to WolfRadio…", true);
    },
    [toast],
  );

  const search = useCallback(
    (query: string) => {
      const id = ++searchId.current;
      setResults(null);
      send({ t: "search", query, id });
      return id;
    },
    [send],
  );

  return { phase, state, results, toasts, send, search, searchId };
}

/** Extrapolates the playback position between server syncs, so the progress bar and lyrics move smoothly. */
export function usePosition(state: ActivityState | null): number {
  const [now, setNow] = useState(() => Date.now());
  const playing = !!state?.current && !state.current.paused;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [playing]);
  if (!state?.current) return 0;
  if (state.current.paused) return state.current.positionMs;
  const pos = state.current.positionMs + Math.max(0, now - state.at);
  return state.current.durationMs ? Math.min(pos, state.current.durationMs) : pos;
}
