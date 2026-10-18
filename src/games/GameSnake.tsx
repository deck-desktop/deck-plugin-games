// Snake on screen: arrows or WASD to steer (and to start), Space or P to pause, N for a new game.
//
// It runs only while its pane has focus and the window is visible: clicking elsewhere, hiding
// Deck or closing the pane pauses it, and a saved game always comes back paused. One clock per
// game (the focused pane drives it), so two Snake panes never run it twice as fast.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useGame } from "../store";
import { H, W, newGame, restore, speed, step, turn, type Dir, type StateSnake } from "./gsnake";
import { Btn, Overlay, Stat, useFit, useFocusOnMount } from "../ui";

const ID = "snake";
const KEYS: Record<string, Dir> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  a: "left", d: "right", w: "up", s: "down",
};

export function GameSnake() {
  const [state, save] = useGame<StateSnake>(ID, restore, () => newGame());
  const [focused, setFocused] = useState(false);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [boardRef, size] = useFit<HTMLDivElement>();
  const latest = useRef(state);
  latest.current = state;

  const pause = () => { if (latest.current.status === "playing") save({ ...latest.current, status: "paused" }); };
  const restart = () => save(newGame(state.best));

  // One step per tick, while playing in the focused pane. A timeout per step rather than an
  // interval, so the speed follows the snake's length as it grows.
  useEffect(() => {
    if (state.status !== "playing" || !focused) return;
    const t = setTimeout(() => save(step(latest.current)), speed(state));
    return () => clearTimeout(t);
  }, [state, focused]); // eslint-disable-line react-hooks/exhaustive-deps

  // Away is paused: the window hidden, or the pane closed.
  useEffect(() => {
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const dir = KEYS[e.key] ?? KEYS[k];
    if (dir) {
      e.preventDefault();
      if (state.status === "over") return;
      const t = turn(state, dir);
      save(state.status === "playing" ? t : { ...t, status: "playing" });
    } else if (k === " " || k === "p") {
      e.preventDefault();
      if (state.status === "playing") pause();
      else if (state.status !== "over") save({ ...state, status: "playing" });
    } else if (k === "n") { e.preventDefault(); restart(); }
  };

  const cell = size / W;
  const at = (i: number) => ({ left: (i % W) * cell, top: Math.floor(i / W) * cell, width: cell, height: cell });

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      // Focus moving to a button inside the game is not leaving it.
      onBlur={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; setFocused(false); pause(); }}
      onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Score" value={state.score} />
        <Stat label="Best" value={state.best} />
        <span className="ml-auto flex gap-1.5">
          {state.status === "playing"
            ? <Btn onClick={pause} title="Pause (Space)"><Pause size={12} /> Pause</Btn>
            : <Btn onClick={() => { if (state.status !== "over") save({ ...state, status: "playing" }); focusRef.current?.focus(); }} disabled={state.status === "over"} title="Play (Space)"><Play size={12} /> Play</Btn>}
          <Btn onClick={restart} title="New game (N)"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={boardRef} className="flex min-h-0 flex-1 items-center justify-center">
        {size > 0 && (
          <div className="relative overflow-hidden rounded-lg" style={{ width: size, height: size, background: "#1c1e26",
            backgroundImage: `linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)`,
            backgroundSize: `${cell}px ${cell}px` }}>
            <div className="absolute rounded-full" style={{ ...at(state.food), background: "#ff6b6b", transform: "scale(0.7)" }} />
            {state.snake.map((c, i) => (
              <div key={i} className="absolute" style={{ ...at(c), borderRadius: cell * 0.25, transform: "scale(0.92)",
                background: i === 0 ? "var(--accent)" : "#8f7bd8", opacity: i === 0 ? 1 : Math.max(0.45, 1 - i / (state.snake.length * 1.4)) }} />
            ))}
            {state.status === "ready" && <Overlay title="Snake"><div className="text-[13px] text-white/80">Press an arrow key to start</div></Overlay>}
            {state.status === "paused" && <Overlay title="Paused"><div className="text-[13px] text-white/80">Space or an arrow key to go on</div></Overlay>}
            {state.status === "over" && (
              <Overlay title="Game over">
                <div className="text-[13px] text-white/80">Score {state.score}{state.score > 0 && state.score === state.best ? " · a new best" : ""}</div>
                <Btn onClick={restart} primary>New game</Btn>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">Arrows or WASD to steer · Space pauses · N new game · {H}x{W}</div>
    </div>
  );
}
