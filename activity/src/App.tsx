import { useEffect, useState } from "react";
import type { ActivityState, ClientMessage } from "../../src/activity/protocol";
import { Cover } from "./Cover";
import { KIND_LABEL, time } from "./format";
import { Loop, Next, Pause, Play, Shuffle, Stop } from "./icons";
import { currentLine, Lyrics } from "./Lyrics";
import { Side } from "./Side";
import { usePosition, useWolfRadio } from "./useWolfRadio";

export function App() {
  const { phase, state, results, toasts, send, search } = useWolfRadio();
  const [tab, setTab] = useState<"queue" | "add">("queue");

  if (phase.kind === "error") return <Screen title="WolfRadio can't open here" text={phase.message} />;
  if (!state) return <Screen title="Tuning in…" text="Connecting to WolfRadio." />;
  return <Room state={state} send={send} search={search} results={results} toasts={toasts} tab={tab} setTab={setTab} reconnecting={phase.kind === "connecting"} />;
}

function Screen({ title, text }: { title: string; text: string }) {
  return (
    <div className="screen">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}

function Room(props: {
  state: ActivityState;
  send: (m: ClientMessage) => void;
  search: (q: string) => number;
  results: { id: number; items: import("../../src/activity/protocol").SearchItem[] } | null;
  toasts: { id: number; text: string; error?: boolean }[];
  tab: "queue" | "add";
  setTab: (t: "queue" | "add") => void;
  reconnecting: boolean;
}) {
  const { state, send, toasts, reconnecting } = props;
  const position = usePosition(state);
  const cur = state.current;
  const dj = state.me.dj;
  const djOnly = dj ? undefined : "Only DJs can do this";

  // Ambient backdrop: the room takes the colour of the cover
  useEffect(() => {
    document.documentElement.style.setProperty("--art", cur?.art ? `url("${cur.art}")` : "none");
  }, [cur?.art]);

  const progress = cur && cur.durationMs ? Math.min(1, position / cur.durationMs) : 0;
  const synced = state.lyrics.status === "synced" && state.lyrics.lines.length > 0;
  const tinyLine = synced ? currentLine(state.lyrics.lines, position) : null;

  return (
    <div className={`room${cur ? "" : " idle"}`}>
      <div className="backdrop" aria-hidden="true" />

      <header className="deck">
        {cur ? (
          <>
            <Cover art={cur.art} title={cur.title} kind={cur.kind} className="deck-cover" />
            <div className="deck-meta">
              <h1 className="title">{cur.title}</h1>
              <p className="artist">
                {cur.artist}
                <span className={`kind kind-${cur.kind}`}>{cur.license ?? KIND_LABEL[cur.kind]}</span>
              </p>
              {cur.isStream ? (
                <p className="live"><span className="dot" aria-hidden="true" /> On air</p>
              ) : (
                <div className="progress" role="progressbar" aria-label="Song progress" aria-valuemin={0} aria-valuemax={Math.round(cur.durationMs / 1000)} aria-valuenow={Math.round(position / 1000)}>
                  <span className="t">{time(position)}</span>
                  <span className="bar"><span style={{ transform: `scaleX(${progress})` }} /></span>
                  <span className="t">{time(cur.durationMs)}</span>
                </div>
              )}
            </div>
            <div className="controls" role="group" aria-label="Playback">
              <button className="icon" onClick={() => send({ t: "loop" })} disabled={!dj} title={djOnly ?? `Loop: ${state.loop}`} aria-label={`Loop (${state.loop})`} aria-pressed={state.loop !== "off"}>
                <Loop />
                {state.loop === "track" ? <span className="badge">1</span> : null}
              </button>
              <button className="icon primary" onClick={() => send({ t: "pause" })} disabled={!dj} title={djOnly ?? (cur.paused ? "Play" : "Pause")} aria-label={cur.paused ? "Play" : "Pause"}>
                {cur.paused ? <Play size={24} /> : <Pause size={24} />}
              </button>
              <button className="icon" onClick={() => send({ t: "skip" })} title={dj ? "Skip" : "Vote to skip"} aria-label={dj ? "Skip" : "Vote to skip"}>
                <Next />
              </button>
              <button className="icon" onClick={() => send({ t: "shuffle" })} disabled={!dj || state.queue.length < 2} title={djOnly ?? "Shuffle the queue"} aria-label="Shuffle the queue">
                <Shuffle />
              </button>
              <button className="icon" onClick={() => send({ t: "stop" })} disabled={!dj} title={djOnly ?? "Stop and clear the queue"} aria-label="Stop and clear the queue">
                <Stop />
              </button>
            </div>
          </>
        ) : (
          <div className="deck-meta">
            <h1 className="title">{state.channel ? `Nothing playing in ${state.channel.name}` : "No music channel yet"}</h1>
            <p className="artist">{state.channel ? "Add a song, or let WolfRadio shuffle your library." : "An admin can choose one with /setup channel."}</p>
          </div>
        )}
      </header>

      <main className="stage">
        {cur && synced ? (
          <Lyrics lines={state.lyrics.lines} position={position} />
        ) : cur ? (
          <div className="hero">
            <Cover art={cur.art} title={cur.title} kind={cur.kind} className="hero-cover" />
            <p className="hero-note">
              {cur.isStream
                ? "Live radio has no lyrics."
                : state.lyrics.status === "loading"
                  ? "Looking for lyrics…"
                  : state.lyrics.status === "instrumental"
                    ? "Instrumental"
                    : state.lyrics.status === "off"
                      ? "Lyrics show for songs from your library and Creative Commons."
                      : "No synced lyrics for this song."}
            </p>
          </div>
        ) : (
          <div className="hero">
            <button className="pill big" onClick={() => props.setTab("add")}>Add a song</button>
          </div>
        )}
        {tinyLine ? <p className="tiny-line" aria-hidden="true">{tinyLine}</p> : null}
      </main>

      <Side state={state} results={props.results} search={props.search} send={send} tab={props.tab} setTab={props.setTab} />

      {state.channel && !state.me.inChannel ? (
        <p className="notice">Join <strong>{state.channel.name}</strong> to hear the music and control it.</p>
      ) : null}
      {reconnecting ? <p className="notice">Reconnecting…</p> : null}

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={t.error ? "toast error" : "toast"}>{t.text}</p>
        ))}
      </div>
    </div>
  );
}
