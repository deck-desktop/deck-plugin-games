// 2048 on screen: arrow keys (or WASD, or a swipe/drag on the board), U to undo one move, N for a
// new game. Every turn is saved, so a restart comes back to the same board.
import { useRef, useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { useGame } from "../store";
import { newGame, play, restore, undo, SIZE, type Dir, type State2048 } from "./g2048";
import { Btn, Overlay, Stat, useFit, useFocusOnMount } from "../ui";

const ID = "2048";

/** Tile colours, by value; past 2048 they stay the last one. */
const TILE: Record<number, [string, string]> = {
  2: ["#3a3d4a", "#e6e6ea"], 4: ["#45495a", "#e6e6ea"], 8: ["#b5651d", "#fff"], 16: ["#c8552b", "#fff"],
  32: ["#d1453b", "#fff"], 64: ["#d93a2e", "#fff"], 128: ["#c9a227", "#fff"], 256: ["#cfa52a", "#fff"],
  512: ["#d6a92c", "#fff"], 1024: ["#7c5cff", "#fff"], 2048: ["#8b5cf6", "#fff"],
};
const tile = (v: number) => TILE[v] ?? TILE[2048];

const KEYS: Record<string, Dir> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

export function Game2048() {
  const [state, save] = useGame<State2048>(ID, restore, () => newGame());
  // The win card shows once, when 2048 is first reached; "keep going" plays on past it.
  const [winCard, setWinCard] = useState(false);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [boardRef, size] = useFit<HTMLDivElement>();
  const drag = useRef<{ x: number; y: number } | null>(null);

  const commit = (next: State2048) => {
    if (next === state) return;
    if (next.won && !state.won) setWinCard(true);
    save(next);
  };
  const turn = (dir: Dir) => { if (!winCard) commit(play(state, dir)); };
  const restart = () => { setWinCard(false); commit(newGame(state.best)); };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const dir = KEYS[e.key] ?? KEYS[e.key.toLowerCase()];
    if (dir) { e.preventDefault(); turn(dir); return; }
    if (e.key.toLowerCase() === "u") { e.preventDefault(); commit(undo(state)); }
    else if (e.key.toLowerCase() === "n") { e.preventDefault(); restart(); }
  };
  // A drag of 30px or more on the board is a move in its main direction.
  const onPointerUp = (e: React.PointerEvent) => {
    const from = drag.current; drag.current = null;
    if (!from) return;
    const dx = e.clientX - from.x, dy = e.clientY - from.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 30) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  };

  const gap = Math.max(4, Math.round(size / 60));
  const cell = (size - gap * (SIZE + 1)) / SIZE;

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Score" value={state.score} />
        <Stat label="Best" value={state.best} />
        <span className="ml-auto flex gap-1.5">
          <Btn onClick={() => commit(undo(state))} disabled={!state.undo} title="Undo one move (U)"><Undo2 size={12} /> Undo</Btn>
          <Btn onClick={restart} title="New game (N)"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={boardRef} className="flex min-h-0 flex-1 items-center justify-center">
        {size > 0 && (
          <div className="relative select-none rounded-lg bg-[#1c1e26] touch-none" style={{ width: size, height: size }}
            onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY }; }} onPointerUp={onPointerUp}>
            {state.board.map((v, i) => {
              const [bg, fg] = v ? tile(v) : ["#262934", ""];
              return (
                <div key={i} className="absolute flex items-center justify-center rounded-md font-bold"
                  style={{
                    left: gap + (i % SIZE) * (cell + gap), top: gap + Math.floor(i / SIZE) * (cell + gap), width: cell, height: cell,
                    background: bg, color: fg, fontSize: cell * (v >= 1000 ? 0.3 : v >= 100 ? 0.36 : 0.42),
                    transition: "background 120ms",
                  }}>
                  {v || ""}
                </div>
              );
            })}
            {state.over && (
              <Overlay title="Game over">
                <div className="text-[13px] text-white/80">Score {state.score}</div>
                <Btn onClick={restart}>New game</Btn>
              </Overlay>
            )}
            {winCard && !state.over && (
              <Overlay title="2048!">
                <div className="flex gap-2">
                  <Btn onClick={() => { setWinCard(false); focusRef.current?.focus(); }}>Keep going</Btn>
                  <Btn onClick={restart}>New game</Btn>
                </div>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">Arrows or WASD to move · drag on the board · U undo · N new game</div>
    </div>
  );
}
