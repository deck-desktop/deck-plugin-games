// Minesweeper on screen. Mouse: left opens (on an open number, opens the rest around it once its
// flags are placed), right flags. Keyboard: arrows move a cursor, Space or Enter opens, F flags,
// N new game. The clock runs only while a game is in play and the window is visible, and the
// time is saved with the board, so a restart picks up the same game and the same time.
import { useState } from "react";
import { Flag, RotateCcw } from "lucide-react";
import { useGame } from "../store";
import { LEVELS, chord, count, minesLeft, newGame, restore, reveal, toggleFlag, type Level, type StateMines } from "./gmines";
import { Btn, Choice, Overlay, Stat, clockText as clock, foldClock, useClock, useFocusOnMount, useSpace, type Clock } from "../ui";

const ID = "minesweeper";
const NUM = ["", "#6ea8fe", "#63c174", "#ff6b6b", "#b197fc", "#ffa94d", "#3bc9db", "#e6e6ea", "#adb5bd"];
/** The game's clock, shared by every pane showing it (ui.tsx). */
const live: Clock = { live: null };

export function GameMines() {
  const [state, commit] = useGame<StateMines>(ID, restore, () => newGame());
  const [cursor, setCursor] = useState(-1);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [spaceRef, space] = useSpace<HTMLDivElement>();
  const shown = useClock(live, state.status === "playing", state, commit);

  /** An action on the board, with the clock folded in first so a win records the right time. */
  const act = (f: (s: StateMines) => StateMines) => {
    const base = foldClock(live, state);
    const next = f(base);
    if (next === base) return;
    live.live = next.status === "playing" ? Date.now() : null;
    commit(next);
  };

  const restart = (level: Level = state.level) => { live.live = null; setCursor(-1); commit(newGame(level, state.best)); };
  const open = (i: number) => act((s) => (s.open[i] ? chord(s, i) : reveal(s, i)));
  const flag = (i: number) => act((s) => toggleFlag(s, i));

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const { w, h } = state;
    const at = cursor < 0 ? Math.floor(h / 2) * w + Math.floor(w / 2) : cursor;
    const x = at % w, y = Math.floor(at / w);
    const moveTo = (nx: number, ny: number) => setCursor(Math.max(0, Math.min(h - 1, ny)) * w + Math.max(0, Math.min(w - 1, nx)));
    const k = e.key.toLowerCase();
    if (e.key === "ArrowLeft") moveTo(x - 1, y);
    else if (e.key === "ArrowRight") moveTo(x + 1, y);
    else if (e.key === "ArrowUp") moveTo(x, y - 1);
    else if (e.key === "ArrowDown") moveTo(x, y + 1);
    else if (e.key === " " || e.key === "Enter") { setCursor(at); open(at); }
    else if (k === "f") { setCursor(at); flag(at); }
    else if (k === "n") restart();
    else return;
    e.preventDefault();
  };

  const cellSize = Math.max(14, Math.floor(Math.min(space.w / state.w, space.h / state.h)));
  const best = state.best[state.level];

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Mines" value={minesLeft(state)} />
        <Stat label="Time" value={clock(shown)} />
        <Stat label="Best" value={best === undefined ? "–" : clock(best)} />
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Choice value={state.level} onPick={(l) => restart(l)}
            options={(Object.keys(LEVELS) as Level[]).map((l) => ({ value: l, label: LEVELS[l].label }))} />
          <Btn onClick={() => restart()} title="New game (N)"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={spaceRef} className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {space.w > 0 && (
          <div className="relative select-none" onContextMenu={(e) => e.preventDefault()}
            style={{ display: "grid", gridTemplateColumns: `repeat(${state.w}, ${cellSize}px)`, gap: 1 }}>
            {state.open.map((o, i) => {
              const n = o && !state.mine[i] ? count(state, i) : 0;
              const isBoom = state.boom === i;
              return (
                <div key={i}
                  onMouseUp={(e) => { setCursor(i); if (e.button === 0) open(i); else if (e.button === 1) act((s) => chord(s, i)); }}
                  onContextMenu={(e) => { e.preventDefault(); setCursor(i); flag(i); }}
                  className="flex items-center justify-center font-bold"
                  style={{
                    width: cellSize, height: cellSize, fontSize: cellSize * 0.58, borderRadius: 3,
                    background: isBoom ? "#c92a2a" : o ? "#1f2129" : "#363a48",
                    color: NUM[n] || "#e6e6ea", cursor: o ? "default" : "pointer",
                    outline: i === cursor ? "2px solid var(--accent)" : "none", outlineOffset: -2,
                  }}>
                  {o && state.mine[i] ? "✹" : n || (!o && state.flag[i] ? <Flag size={cellSize * 0.55} color="#ff8787" /> : "")}
                </div>
              );
            })}
            {state.status === "lost" && (
              <Overlay title="Boom">
                <Btn onClick={() => restart()} primary>Try again</Btn>
              </Overlay>
            )}
            {state.status === "won" && (
              <Overlay title="Cleared!">
                <div className="text-[13px] text-white/80">{clock(state.elapsed)}{best === state.elapsed ? " · a new best" : ""}</div>
                <Btn onClick={() => restart()} primary>New game</Btn>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">Click opens · right-click flags · arrows, Space and F work too · N new game</div>
    </div>
  );
}
