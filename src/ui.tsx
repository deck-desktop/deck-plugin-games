// What every game screen shares: fitting a square board into whatever size the pane is, and the
// row of numbers and buttons above it.
import { useEffect, useRef, useState } from "react";

/**
 * The space a board has, for sizing it to a pane of any shape. A ResizeObserver rather than
 * CSS: Deck's Tailwind has no container queries, and a pane resizes by dragging a split, not by
 * the window resizing.
 */
export function useSpace<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [space, setSpace] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSpace({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, space];
}

/** The largest square that fits: for a board that must stay square. */
export function useFit<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const [ref, { w, h }] = useSpace<T>();
  return [ref, Math.min(w, h)];
}

/** A labelled number in a game's header (score, best, mines left, time). */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-[56px] flex-col items-center rounded-lg border border-subtle bg-elev px-2.5 py-1 leading-tight">
      <span className="text-[10.5px] text-text-muted">{label}</span>
      <span className="font-mono text-[14px] font-semibold text-text-primary">{value}</span>
    </div>
  );
}

/**
 * A button in a game's chrome. Secondary by default; `primary` is the one filled action a screen
 * offers (New game on a game-over card), and `on` lights a toggle that is switched on.
 */
export function Btn({ children, onClick, title, disabled, primary, on }: {
  children: React.ReactNode; onClick: () => void; title?: string; disabled?: boolean; primary?: boolean; on?: boolean;
}) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} aria-pressed={on}
      className={"inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] transition-colors disabled:opacity-40 "
        + (primary ? "font-medium text-white hover:brightness-110"
          : on ? "border border-subtle text-text-primary"
          : "border border-subtle text-text-secondary hover:border-strong hover:text-text-primary disabled:hover:border-subtle")}
      style={primary ? { background: "var(--accent)" }
        : on ? { background: "var(--accent-soft)", boxShadow: "inset 0 0 0 1px var(--accent)" }
        : { background: "var(--bg-elev)" }}>
      {children}
    </button>
  );
}

/**
 * One of a few choices (a level, a difficulty, a mode), as one group with the chosen one lit.
 * Picking the one already chosen still calls `onPick`: for most games that starts it again.
 */
export function Choice<T extends string | number>({ options, value, onPick }: {
  options: { value: T; label: React.ReactNode; title?: string }[]; value: T; onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-subtle bg-elev p-0.5">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} onClick={() => onPick(o.value)} title={o.title} aria-pressed={on}
            className={"inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] transition-colors "
              + (on ? "text-text-primary" : "text-text-muted hover:bg-white/5 hover:text-text-primary")}
            style={on ? { background: "var(--accent-soft)" } : undefined}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A card over the board: game over, a win, a pause. */
export function Overlay({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/60 text-center backdrop-blur-[2px]">
      <div className="text-[20px] font-semibold text-white">{title}</div>
      {children}
    </div>
  );
}

/**
 * A game clock: when it last started, or null while stopped. One per game at module scope, so
 * two panes on the same game run one clock rather than each counting the same seconds.
 */
export interface Clock { live: number | null }

/** The state with the time since the clock started added to its `elapsed`. */
export const foldClock = <S extends { elapsed: number }>(c: Clock, s: S): S =>
  (c.live === null ? s : { ...s, elapsed: s.elapsed + Date.now() - c.live });

/**
 * Run a game's clock while `running` and the window is visible, folding the time into the state
 * when the window hides and when the game leaves the screen, so what is saved is the time played.
 * Returns the time to show. An action on the board folds the clock in first (foldClock), so a win
 * records the right time, then sets `live` again if the game goes on.
 */
export function useClock<S extends { elapsed: number }>(c: Clock, running: boolean, state: S, commit: (s: S) => void): number {
  const [, setNow] = useState(0);
  const latest = useRef(state);
  latest.current = state;
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (!running) { c.live = null; return; }
    if (c.live === null && !document.hidden) c.live = Date.now();
    const tick = setInterval(() => setNow(Date.now()), 500);
    const onVis = () => {
      if (document.hidden) { const f = foldClock(c, latest.current); c.live = null; commitRef.current(f); }
      else if (c.live === null) c.live = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVis);
      if (c.live !== null) { commitRef.current(foldClock(c, latest.current)); c.live = null; }
    };
  }, [running, c]);
  return state.elapsed + (c.live !== null ? Date.now() - c.live : 0);
}

export const clockText = (ms: number) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * A game's keyboard: the screen takes focus when it mounts and when clicked, and keys reach it
 * only while it has focus, so a terminal beside it never loses an arrow key to a game.
 */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => { ref.current?.focus({ preventScroll: true }); }, []);
  return ref;
}
