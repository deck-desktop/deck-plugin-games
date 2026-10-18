// Sokoban on screen: arrows or WASD walk and push, U (or Ctrl+Z) undoes, R restarts the level.
// The first ten levels are hand-made; after them they are generated, for ever, getting bigger.
// Solving a level opens the next; each keeps the fewest moves it took.
// The position, the level and the undo history are saved.
import { Check, ChevronLeft, ChevronRight, RotateCcw, Undo2 } from "lucide-react";
import { useGame } from "../store";
import { isSolved, levelText, parse, restore, start, undo, walk, type Dir, type StateSokoban } from "./gsokoban";
import { Btn, Overlay, Stat, useFocusOnMount, useSpace } from "../ui";

const ID = "sokoban";
const KEYS: Record<string, Dir> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

export function GameSokoban() {
  const [state, save] = useGame<StateSokoban>(ID, restore, () => start(0));
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [spaceRef, space] = useSpace<HTMLDivElement>();
  const level = parse(levelText(state.level));
  const solved = isSolved(state);
  // Any level up to one past the furthest solved.
  const furthest = Math.max(-1, ...Object.keys(state.solved).map(Number));
  const open = (i: number) => i >= 0 && i <= furthest + 1;
  const solvedCount = Object.keys(state.solved).length;
  const goTo = (i: number) => { if (open(i)) save(start(i, state.solved)); focusRef.current?.focus(); };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); save(undo(state)); return; }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const dir = KEYS[e.key] ?? KEYS[k];
    if (dir) save(walk(state, dir));
    else if (k === "u") save(undo(state));
    else if (k === "r") save(start(state.level, state.solved));
    else if ((e.key === "Enter" || k === "n") && solved) goTo(state.level + 1);
    else return;
    e.preventDefault();
  };

  const cell = Math.max(12, Math.floor(Math.min(space.w / level.w, space.h / level.h)));
  const goals = new Set(level.goals);
  const best = state.solved[state.level];

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Solved" value={solvedCount} />
        <Stat label="Moves" value={state.moves} />
        <Stat label="Pushes" value={state.pushes} />
        <Stat label="Best" value={best ?? "–"} />
        <span className="ml-auto flex gap-1.5">
          <Btn onClick={() => save(undo(state))} disabled={!state.history.length || solved} title="Undo (U)"><Undo2 size={12} /> Undo</Btn>
          <Btn onClick={() => save(start(state.level, state.solved))} title="Restart the level (R)"><RotateCcw size={12} /> Restart</Btn>
        </span>
      </div>
      <div className="flex items-center justify-center gap-1">
        <button onClick={() => goTo(state.level - 1)} disabled={state.level === 0} title="Previous level"
          className="grid size-7 place-items-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"><ChevronLeft size={15} /></button>
        <span className="inline-flex min-w-[96px] items-center justify-center gap-1 text-[12.5px] font-medium text-text-primary">
          Level {state.level + 1}{best !== undefined && <Check size={13} className="text-accent" />}
        </span>
        <button onClick={() => goTo(state.level + 1)} disabled={!open(state.level + 1)} title={open(state.level + 1) ? "Next level" : "Solve this one first"}
          className="grid size-7 place-items-center rounded-lg text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent"><ChevronRight size={15} /></button>
        {furthest + 1 > state.level + 1 && (
          <button onClick={() => goTo(furthest + 1)} className="ml-1 flex h-7 items-center rounded-lg px-2 text-[11.5px] text-text-muted transition-colors hover:bg-white/5 hover:text-text-primary">Latest ({furthest + 2}) »</button>
        )}
      </div>
      <div ref={spaceRef} className="flex min-h-0 flex-1 items-center justify-center">
        {space.w > 0 && (
          <div className="relative" style={{ width: cell * level.w, height: cell * level.h }}>
            {level.walls.map((wall, i) => {
              const x = (i % level.w) * cell, y = Math.floor(i / level.w) * cell;
              return wall ? (
                <div key={i} className="absolute rounded-[3px]" style={{ left: x, top: y, width: cell, height: cell, background: "#4b4f60", boxShadow: "inset 0 -2px 0 #0004" }} />
              ) : goals.has(i) ? (
                <div key={i} className="absolute flex items-center justify-center" style={{ left: x, top: y, width: cell, height: cell }}>
                  <div className="rounded-full" style={{ width: cell * 0.3, height: cell * 0.3, background: "#3d9a50" }} />
                </div>
              ) : null;
            })}
            {state.boxes.map((b, i) => (
              <div key={`b${i}`} className="absolute rounded-[4px] transition-all duration-75"
                style={{ left: (b % level.w) * cell + cell * 0.08, top: Math.floor(b / level.w) * cell + cell * 0.08, width: cell * 0.84, height: cell * 0.84,
                  background: goals.has(b) ? "#3d9a50" : "#c49a1f", border: "2px solid #0005" }} />
            ))}
            <div className="absolute rounded-full transition-all duration-75"
              style={{ left: (state.player % level.w) * cell + cell * 0.15, top: Math.floor(state.player / level.w) * cell + cell * 0.15, width: cell * 0.7, height: cell * 0.7, background: "var(--accent)" }} />
            {solved && (
              <Overlay title="Solved!">
                <div className="text-[13px] text-white/80">{state.moves} moves · {state.pushes} pushes{best === state.moves ? " · your best" : ""}</div>
                <Btn onClick={() => goTo(state.level + 1)} primary>Next level</Btn>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">Arrows or WASD to push every box onto a green dot · U undo · R restart</div>
    </div>
  );
}
