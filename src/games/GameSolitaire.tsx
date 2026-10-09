// Klondike on screen. Click the stock to draw. Click a card (or the top of a run) to pick it up,
// then click where it goes; double-click sends a card to a foundation if it can go, otherwise to
// the first column that takes it. U or Ctrl+Z undoes. Finish plays out the end once every card is
// face up. The deal, the moves and the time are saved.
import { useState } from "react";
import { Flag, RotateCcw, Undo2 } from "lucide-react";
import { useGame } from "../store";
import {
  autoMove, canFinish, deal, drawCards, finishAll, move, rank, red, restore, suit,
  type Dst, type Src, type StateSolitaire,
} from "./gsolitaire";
import { Btn, Overlay, Stat, clockText, foldClock, useClock, useFocusOnMount, useSpace, type Clock } from "../ui";

const ID = "solitaire";
const live: Clock = { live: null };
let history: StateSolitaire[] = [];
const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["♠", "♥", "♦", "♣"];

function Card({ c, w, faceDown, selected, onClick, onDoubleClick, style }: {
  c?: number; w: number; faceDown?: boolean; selected?: boolean;
  onClick?: () => void; onDoubleClick?: () => void; style?: React.CSSProperties;
}) {
  const h = w * 1.4;
  const empty = c === undefined;
  return (
    <div onClick={onClick} onDoubleClick={onDoubleClick}
      className="absolute select-none rounded-[5px]"
      style={{
        width: w, height: h, cursor: onClick ? "pointer" : "default",
        background: empty ? "transparent" : faceDown ? "repeating-linear-gradient(45deg, #5b4bb7 0 4px, #4a3c9c 4px 8px)" : "#f1f1f4",
        border: empty ? "1.5px dashed #4b4f60" : "1px solid #00000055",
        outline: selected ? "2px solid var(--accent)" : "none", outlineOffset: 1,
        boxShadow: empty ? "none" : "0 1px 2px #0006", ...style,
      }}>
      {!empty && !faceDown && (
        <div className="flex justify-between px-[3px] font-bold leading-none" style={{ color: red(c) ? "#d6336c" : "#1f2129", fontSize: Math.max(10, w * 0.24), paddingTop: 2 }}>
          <span>{RANKS[rank(c)]}</span><span>{SUITS[suit(c)]}</span>
        </div>
      )}
      {!empty && !faceDown && (
        <div className="absolute inset-x-0 bottom-0 text-center" style={{ color: red(c) ? "#d6336c" : "#1f2129", fontSize: w * 0.42, lineHeight: 1.2 }}>{SUITS[suit(c)]}</div>
      )}
    </div>
  );
}

export function GameSolitaire() {
  const [state, commit] = useGame<StateSolitaire>(ID, restore, () => deal());
  const [sel, setSel] = useState<Src | null>(null);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [spaceRef, space] = useSpace<HTMLDivElement>();
  // The clock starts with the first move, not when the cards are dealt.
  const shown = useClock(live, state.status === "playing" && state.moves > 0, state, commit);

  const act = (f: (s: StateSolitaire) => StateSolitaire) => {
    const base = foldClock(live, state);
    const next = f(base);
    setSel(null);
    if (next === base) return false;
    history = [...history.slice(-299), base];
    live.live = next.status === "playing" ? Date.now() : null;
    commit(next);
    return true;
  };
  const undo = () => {
    const prev = history.pop();
    if (!prev) return;
    history = [...history];
    setSel(null);
    commit({ ...prev, elapsed: foldClock(live, state).elapsed });
    if (live.live !== null) live.live = Date.now();
  };
  const restart = (draw: 1 | 3 = state.draw) => { live.live = null; history = []; setSel(null); commit(deal(draw, state.best)); };

  /** A click on something that can be picked up: move the held cards there, or pick these up. */
  const tap = (here: Src, asDst: Dst | null) => {
    if (sel && asDst && act((s) => move(s, sel, asDst))) return;
    setSel(sel && JSON.stringify(sel) === JSON.stringify(here) ? null : here);
  };
  const tapDst = (dst: Dst) => { if (sel) act((s) => move(s, sel, dst)); };

  const onKey = (e: React.KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); }
    else if (!e.ctrlKey && !e.altKey && !e.metaKey && k === "u") { e.preventDefault(); undo(); }
    else if (e.key === "Escape" && sel) { e.preventDefault(); setSel(null); }
  };

  const gap = 6;
  const w = Math.max(28, Math.min(96, Math.floor((space.w - gap * 6) / 7)));
  const h = w * 1.4;
  const x = (i: number) => i * (w + gap);
  // Fan the columns, closer together when a column would run off the bottom.
  const tallest = Math.max(...state.tableau.map((col, i) => state.down[i] * 0.14 + (col.length - state.down[i]) * 0.28));
  const room = Math.max(1, space.h - h * 2 - gap * 2);
  const squeeze = Math.min(1, room / Math.max(1, tallest * h));
  const isSel = (src: Src) => !!sel && JSON.stringify(sel) === JSON.stringify(src);
  const inSelRun = (col: number, i: number) => !!sel && sel.pile === "tab" && sel.col === col && i >= sel.index;
  const best = state.best[String(state.draw) as "1" | "3"];
  const wasteShown = state.waste.slice(-(state.draw === 3 ? 3 : 1));

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Moves" value={state.moves} />
        <Stat label="Time" value={clockText(shown)} />
        <Stat label="Best" value={best === undefined ? "–" : clockText(best)} />
        <span className="ml-auto flex flex-wrap gap-1">
          {([1, 3] as const).map((d) => (
            <button key={d} onClick={() => restart(d)} title={`New deal, drawing ${d}`}
              className={`rounded-md px-2 py-1 text-[12px] transition ${d === state.draw ? "bg-accent-soft text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
              Draw {d}
            </button>
          ))}
          {canFinish(state) && <Btn onClick={() => act(finishAll)} title="Play every card to the foundations"><Flag size={12} /> Finish</Btn>}
          <Btn onClick={undo} disabled={!history.length} title="Undo (U)"><Undo2 size={12} /> Undo</Btn>
          <Btn onClick={() => restart()} title="New deal"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={spaceRef} className="relative min-h-0 flex-1">
        {space.w > 0 && (
          <div className="relative mx-auto" style={{ width: x(7) - gap, height: "100%" }}>
            {/* The stock: a click draws, or turns the waste back over. */}
            <Card w={w} faceDown={state.stock.length > 0} c={state.stock.length ? state.stock[0] : undefined}
              onClick={() => act(drawCards)} style={{ left: 0, top: 0 }} />
            {/* The waste: only its top card can be played. */}
            {wasteShown.map((c, i) => {
              const top = i === wasteShown.length - 1;
              return (
                <Card key={c} c={c} w={w} selected={top && isSel({ pile: "waste" })}
                  onClick={top ? () => tap({ pile: "waste" }, null) : undefined}
                  onDoubleClick={top ? () => act((s) => autoMove(s, { pile: "waste" })) : undefined}
                  style={{ left: x(1) + i * w * 0.22, top: 0 }} />
              );
            })}
            {state.foundations.map((f, i) => (
              <Card key={`f${i}`} c={f[f.length - 1]} w={w} selected={isSel({ pile: "found", f: i })}
                onClick={() => (f.length ? tap({ pile: "found", f: i }, { pile: "found", f: i }) : tapDst({ pile: "found", f: i }))}
                style={{ left: x(3 + i), top: 0 }} />
            ))}
            {state.tableau.map((col, ci) => {
              let y = h + gap * 2;
              return (
                <div key={`t${ci}`}>
                  {!col.length && <Card w={w} onClick={() => tapDst({ pile: "tab", col: ci })} style={{ left: x(ci), top: y }} />}
                  {col.map((c, i) => {
                    const down = i < state.down[ci];
                    const top = y;
                    y += h * (down ? 0.14 : 0.28) * squeeze;
                    return (
                      <Card key={c} c={c} w={w} faceDown={down} selected={inSelRun(ci, i)}
                        onClick={down ? undefined : () => tap({ pile: "tab", col: ci, index: i }, { pile: "tab", col: ci })}
                        onDoubleClick={down ? undefined : () => act((s) => autoMove(s, { pile: "tab", col: ci, index: i }))}
                        style={{ left: x(ci), top }} />
                    );
                  })}
                </div>
              );
            })}
            {state.status === "won" && (
              <Overlay title="You won!">
                <div className="text-[13px] text-white/80">{state.moves} moves · {clockText(state.elapsed)}{best === state.elapsed ? " · a new best" : ""}</div>
                <Btn onClick={() => restart()}>New deal</Btn>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="text-center text-[11px] text-text-muted">Click a card, then where it goes · double-click sends it home · U undo</div>
    </div>
  );
}
