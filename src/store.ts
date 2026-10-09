// Every game's saved state, and which game the pane shows.
//
// One config file, `plugin-games`, which Deck keeps on this machine (plugin configs never sync).
// Each game keeps its whole state here as plain JSON: the board, the score, the timer, its best
// scores. A game reads its save once when it mounts and hands back every change; this store
// writes them out at most once a second, and only when something changed (rule 3: a write wakes
// every config listener in Deck, and a game changes state on every key press).
//
// Module scope, shared by every Games pane: two panes showing the same game show the same game.
import { useMemo, useState, useSyncExternalStore } from "react";
import { configRead, configWrite } from "../shim/bridge.js";

const CFG = "plugin-games";

interface Saved {
  /** The game the pane shows, or null for the picker. */
  current: string | null;
  /** Each game's state, by game id, as the game wrote it. */
  games: Record<string, unknown>;
}

let saved: Saved = { current: null, games: {} };
let loaded = false;
let loading: Promise<void> | null = null;
/** The JSON last read or written: a save that matches it is skipped. */
let lastText = "";

let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; listeners.forEach((f) => f()); };
export const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const getVersion = () => version;

/** Read the saves once. Every pane waits on the same read. */
export function load(): Promise<void> {
  loading ??= configRead(CFG)
    .then((text: string) => {
      if (text.trim()) {
        const v = JSON.parse(text) as Partial<Saved>;
        saved = { current: typeof v.current === "string" ? v.current : null, games: v.games && typeof v.games === "object" ? v.games : {} };
        lastText = text;
      }
    })
    .catch(() => { /* no file yet, or unreadable: start fresh */ })
    .finally(() => { loaded = true; emit(); });
  return loading;
}
export const isLoaded = () => loaded;

export const current = () => saved.current;
export function setCurrent(id: string | null) {
  if (saved.current === id) return;
  saved = { ...saved, current: id };
  emit();
  schedule();
}

/** States a game set in this session, as opposed to ones read from disk (see useGame). */
const live = new WeakSet<object>();

/** A game's saved state, or undefined when it has none (a first game). */
export const gameSave = <T,>(id: string): T | undefined => saved.games[id] as T | undefined;
/** Keep a game's state. Every pane showing the game redraws; written within a second, or at once by flush(). */
export function setGameSave(id: string, state: unknown) {
  if (saved.games[id] === state) return;
  if (state && typeof state === "object") live.add(state);
  saved = { ...saved, games: { ...saved.games, [id]: state } };
  emit();
  schedule();
}

/**
 * A game's live state, shared by every pane showing it: the store is the one copy, so two panes
 * on the same game show the same board and a move in either is a move in both (each holding its
 * own copy, they drifted apart and wrote over each other's saves).
 *
 * `restore` checks what is on disk (null for anything malformed); `fresh` starts a new game when
 * there is none.
 */
export function useGame<T>(id: string, restore: (v: unknown) => T | null, fresh: () => T): [T, (next: T) => void] {
  useSyncExternalStore(subscribe, getVersion);
  const raw = saved.games[id];
  // Only what came off disk goes through `restore`. A state a game set itself is used as it is:
  // restore also turns a running game into a paused one (right for a save, wrong for a game in
  // play), and Snake paused itself on every step.
  const restored = useMemo(() => (raw === undefined ? null : live.has(raw as object) ? (raw as T) : restore(raw)), [raw]); // eslint-disable-line react-hooks/exhaustive-deps
  const [first] = useState(fresh);
  return [restored ?? first, (next) => setGameSave(id, next)];
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  if (!loaded) return; // nothing is written over a save that has not been read yet
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), 1000);
}

/** Write now, if anything changed. Called when a pane closes and when the window hides. */
export async function flush(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  if (!loaded) return;
  const text = JSON.stringify(saved);
  if (text === lastText) return;
  lastText = text;
  await configWrite(CFG, text).catch(() => { lastText = ""; });
}

// The last second of play is not lost to a window being hidden or closed: write it then.
const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
const onUnload = () => void flush();
document.addEventListener("visibilitychange", onHide);
window.addEventListener("beforeunload", onUnload);

/** Stop what module scope started; Deck calls it before a reload re-imports the plugin. */
export function dispose() {
  void flush();
  document.removeEventListener("visibilitychange", onHide);
  window.removeEventListener("beforeunload", onUnload);
}
