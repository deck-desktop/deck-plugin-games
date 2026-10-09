// Tetris on screen: Left/Right move, Up or X rotates (Z the other way), Down drops a row, Space
// drops all the way, C holds a piece, P pauses. Like Snake it runs only while its pane has focus
// and the window is visible, and a saved game comes back paused.
import { useEffect, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useGame } from "../store";
import {
  H, W, cells, gravity, hardDrop, hold, landing, level, newGame, restore, rotate, shift, softDrop, tick,
  COLOR, type Kind, type StateTetris,
} from "./gtetris";
import { Btn, Overlay, Stat, useFocusOnMount, useSpace } from "../ui";

const ID = "tetris";
const COLORS = ["", "#3bc9db", "#fcc419", "#b197fc", "#69db7c", "#ff6b6b", "#5c7cfa", "#ffa94d"];

/** A small picture of one piece, for the next and hold boxes. */
function Mini({ kind, size, dim }: { kind: Kind | null; size: number; dim?: boolean }) {
  const c = size / 4;
  const pts = kind ? cells({ kind, rot: 0, x: 0, y: 0 }) : [];
  const minX = Math.min(...pts.map(([x]) => x)), maxX = Math.max(...pts.map(([x]) => x));
  const minY = Math.min(...pts.map(([, y]) => y)), maxY = Math.max(...pts.map(([, y]) => y));
  const ox = (4 - (maxX - minX + 1)) / 2 - minX, oy = (2 - (maxY - minY + 1)) / 2 - minY;
  return (
    <div className="relative" style={{ width: size, height: c * 2, opacity: dim ? 0.4 : 1 }}>
      {kind && pts.map(([x, y], i) => (
        <div key={i} className="absolute rounded-[2px]" style={{ left: (x + ox) * c, top: (y + oy) * c, width: c - 1, height: c - 1, background: COLORS[COLOR[kind]] }} />
      ))}
    </div>
  );
}

export function GameTetris() {
  const [state, save] = useGame<StateTetris>(ID, restore, () => newGame());
  const [focused, setFocused] = useState(false);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [spaceRef, space] = useSpace<HTMLDivElement>();
  const latest = useRef(state);
  latest.current = state;

  const pause = () => { if (latest.current.status === "playing") save({ ...latest.current, status: "paused" }); };
  const play = () => { if (latest.current.status !== "over") save({ ...latest.current, status: "playing" }); };
  const restart = () => save(newGame(state.best));

  // Gravity on its own timer, so moving the piece does not hold it in the air.
  const lvl = level(state);
  useEffect(() => {
    if (state.status !== "playing" || !focused) return;
    const t = setInterval(() => save(tick(latest.current)), gravity(state));
    return () => clearInterval(t);
  }, [state.status, focused, lvl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onVis = () => { if (document.hidden) pause(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); pause(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const s = latest.current;
    const act = (f: (s: StateTetris) => StateTetris) => { e.preventDefault(); save(f(s.status === "playing" ? s : { ...s, status: "playing" })); };
    if (s.status === "over") { if (k === "n") { e.preventDefault(); restart(); } return; }
    if (k === "p") { e.preventDefault(); if (s.status === "playing") pause(); else play(); }
    else if (e.key === "ArrowLeft") act((x) => shift(x, -1, 0));
    else if (e.key === "ArrowRight") act((x) => shift(x, 1, 0));
    else if (e.key === "ArrowDown") act((x) => softDrop(x));
    else if (e.key === "ArrowUp" || k === "x") act((x) => rotate(x, 1));
    else if (k === "z") act((x) => rotate(x, -1));
    else if (e.key === " ") act((x) => hardDrop(x));
    else if (k === "c") act((x) => hold(x));
    else if (k === "n") { e.preventDefault(); restart(); }
  };

  const side = 92;
  const cell = Math.max(8, Math.floor(Math.min(space.h / H, (space.w - side - 12) / W)));
  const ghost = state.status === "playing" || state.status === "paused" ? landing(state) : null;
  const piece = cells(state.piece);

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (e.currentTarget.contains(e.relatedTarget as Node | null)) return; setFocused(false); pause(); }}
      onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Score" value={state.score} />
        <Stat label="Lines" value={state.lines} />
        <Stat label="Level" value={lvl} />
        <Stat label="Best" value={state.best} />
        <span className="ml-auto flex gap-1.5">
          {state.status === "playing"
            ? <Btn onClick={pause} title="Pause (P)"><Pause size={12} /> Pause</Btn>
            : <Btn onClick={() => { play(); focusRef.current?.focus(); }} disabled={state.status === "over"} title="Play (P)"><Play size={12} /> Play</Btn>}
          <Btn onClick={restart} title="New game (N)"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={spaceRef} className="flex min-h-0 flex-1 items-center justify-center gap-3">
        {space.w > 0 && (
          <>
            <div className="relative overflow-hidden rounded-md" style={{ width: cell * W, height: cell * H, background: "#1c1e26",
              backgroundImage: "linear-gradient(#ffffff08 1px, transparent 1px), linear-gradient(90deg, #ffffff08 1px, transparent 1px)",
              backgroundSize: `${cell}px ${cell}px` }}>
              {state.board.map((v, i) => v ? (
                <div key={i} className="absolute rounded-[3px]" style={{ left: (i % W) * cell, top: Math.floor(i / W) * cell, width: cell - 1, height: cell - 1, background: COLORS[v] }} />
              ) : null)}
              {ghost && cells(ghost).map(([x, y], i) => y >= 0 && (
                <div key={`g${i}`} className="absolute rounded-[3px]" style={{ left: x * cell, top: y * cell, width: cell - 1, height: cell - 1, border: `1px solid ${COLORS[COLOR[state.piece.kind]]}66` }} />
              ))}
              {state.status !== "over" && piece.map(([x, y], i) => y >= 0 && (
                <div key={`p${i}`} className="absolute rounded-[3px]" style={{ left: x * cell, top: y * cell, width: cell - 1, height: cell - 1, background: COLORS[COLOR[state.piece.kind]] }} />
              ))}
              {state.status === "ready" && <Overlay title="Tetris"><div className="px-3 text-[13px] text-white/80">Press an arrow key to start</div></Overlay>}
              {state.status === "paused" && <Overlay title="Paused"><div className="px-3 text-[13px] text-white/80">P or an arrow key to go on</div></Overlay>}
              {state.status === "over" && (
                <Overlay title="Game over">
                  <div className="text-[13px] text-white/80">Score {state.score}{state.score > 0 && state.score === state.best ? " · a new best" : ""}</div>
                  <Btn onClick={restart}>New game</Btn>
                </Overlay>
              )}
            </div>
            <div className="flex flex-col gap-3" style={{ width: side }}>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Next</div>
                <div className="flex flex-col gap-2 rounded-md bg-elev p-2">
                  {state.queue.slice(0, 3).map((k, i) => <Mini key={i} kind={k} size={side - 16} />)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] uppercase tracking-wide text-text-muted">Hold (C)</div>
                <div className="rounded-md bg-elev p-2"><Mini kind={state.hold} size={side - 16} dim={!state.canHold} /></div>
              </div>
            </div>
          </>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">← → move · ↑/X rotate · ↓ soft drop · Space drop · C hold · P pause · N new</div>
    </div>
  );
}
