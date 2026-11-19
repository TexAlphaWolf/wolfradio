import { useEffect, useRef, useState } from "react";
import type { ActivityState, ClientMessage, SearchItem } from "../../src/activity/protocol";
import { Cover } from "./Cover";
import { KIND_LABEL, time } from "./format";
import { Close, Dice, Infinity as Endless, Plus, Search as SearchIcon } from "./icons";

type Tab = "queue" | "add";

export function Side(props: {
  state: ActivityState;
  results: { id: number; items: SearchItem[] } | null;
  search: (q: string) => number;
  send: (m: ClientMessage) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
}) {
  const { state, tab, setTab } = props;
  return (
    <aside className="side">
      <div className="tabs" role="tablist" aria-label="Queue and search">
        <button role="tab" aria-selected={tab === "queue"} className={tab === "queue" ? "tab on" : "tab"} onClick={() => setTab("queue")}>
          Up next{state.queueTotal ? <span className="count">{state.queueTotal}</span> : null}
        </button>
        <button role="tab" aria-selected={tab === "add"} className={tab === "add" ? "tab on" : "tab"} onClick={() => setTab("add")}>
          Add a song
        </button>
      </div>
      {tab === "queue" ? <Queue {...props} /> : <AddSong {...props} />}
    </aside>
  );
}

function Queue({ state, send, setTab }: { state: ActivityState; send: (m: ClientMessage) => void; setTab: (t: Tab) => void }) {
  if (state.queue.length === 0) {
    return (
      <div className="side-empty">
        <p>{state.endless ? "Endless shuffle will pick the next song." : "Nothing queued after this song."}</p>
        <button className="pill" onClick={() => setTab("add")}>
          <Plus size={16} /> Add a song
        </button>
      </div>
    );
  }
  return (
    <ol className="queue">
      {state.queue.map((t, i) => {
        const mine = state.me.dj || t.mine;
        return (
          <li key={`${i}-${t.title}`} className="q-row">
            <Cover art={t.art} title={t.title} kind={t.kind} className="q-cover" />
            <div className="q-text">
              <span className="q-title">{t.title}</span>
              <span className="q-sub">
                {t.artist}
                <span className={`kind kind-${t.kind}`}>{KIND_LABEL[t.kind]}</span>
              </span>
            </div>
            <span className="q-time">{t.isStream ? "Live" : time(t.durationMs)}</span>
            {mine ? (
              <button className="icon ghost" aria-label={`Remove ${t.title}`} title="Remove from the queue" onClick={() => send({ t: "remove", index: i })}>
                <Close size={16} />
              </button>
            ) : (
              <span className="icon-spacer" />
            )}
          </li>
        );
      })}
      {state.queueTotal > state.queue.length ? <li className="q-more">and {state.queueTotal - state.queue.length} more</li> : null}
    </ol>
  );
}

function AddSong({ state, results, search, send }: { state: ActivityState; results: { id: number; items: SearchItem[] } | null; search: (q: string) => number; send: (m: ClientMessage) => void }) {
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<number | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const loading = pending !== null && results?.id !== pending;

  return (
    <div className="add">
      <form
        className="searchbox"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) setPending(search(query.trim()));
        }}
      >
        <SearchIcon size={18} />
        <input ref={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Song or artist" aria-label="Song or artist" maxLength={200} />
      </form>

      {loading ? <p className="hint">Searching…</p> : null}
      {!loading && results && results.id === pending ? (
        results.items.length ? (
          <ul className="results">
            {results.items.map((item, index) => (
              <li key={index}>
                <button className="result" onClick={() => send({ t: "add", id: results.id, index })}>
                  <span className="r-emoji" aria-hidden="true">{item.emoji}</span>
                  <span className="r-text">
                    <span className="r-label">{item.label}</span>
                    <span className="r-desc">{item.description}</span>
                  </span>
                  <Plus size={16} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">No results for that search. Try the artist's name.</p>
        )
      ) : null}

      {state.features.library && !loading && !(results && results.id === pending) ? (
        <div className="shuffle-box">
          <p>Not sure what to play?</p>
          <div className="shuffle-actions">
            <button className="pill" onClick={() => send({ t: "random", endless: false })}>
              <Dice size={16} /> Shuffle 15 songs
            </button>
            {state.me.dj ? (
              <button className="pill" onClick={() => send({ t: "random", endless: true })}>
                <Endless size={16} /> Endless shuffle
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
