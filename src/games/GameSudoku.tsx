// Sudoku on screen. Click a cell (or move with the arrows), type 1-9; right-click, Backspace,
// Delete or 0 clears (the number and the notes). Notes: switch on Notes (or press Space) and digits pencil in, or hold Shift with a
// digit. Hint fills the selected cell; Undo takes moves back. Everything, notes included, is
// saved, and the clock runs only while the game is on screen.
import { useState } from "react";
import { Lightbulb, Pencil, RotateCcw, Undo2 } from "lucide-react";
import { useGame } from "../store";
import { LABEL, PEERS, clearCell, conflicts, hint, newGame, restore, setValue, toggleNote, type Difficulty, type StateSudoku } from "./gsudoku";
import { Btn, Choice, Overlay, Stat, clockText, foldClock, useClock, useFit, useFocusOnMount, type Clock } from "../ui";

const ID = "sudoku";
const live: Clock = { live: null };
/** Moves to undo, newest last. Kept for this session, shared like the game; not saved. */
let history: StateSudoku[] = [];

export function GameSudoku() {
  const [state, commit] = useGame<StateSudoku>(ID, restore, () => newGame());
  const [sel, setSel] = useState(-1);
  const [notesMode, setNotesMode] = useState(false);
  const focusRef = useFocusOnMount<HTMLDivElement>();
  const [boardRef, size] = useFit<HTMLDivElement>();
  const shown = useClock(live, state.status === "playing", state, commit);

  const act = (f: (s: StateSudoku) => StateSudoku) => {
    const base = foldClock(live, state);
    const next = f(base);
    if (next === base) return;
    history = [...history.slice(-199), base];
    live.live = next.status === "playing" ? Date.now() : null;
    commit(next);
  };
  const undo = () => {
    const prev = history.pop();
    if (!prev) return;
    history = [...history];
    // The time keeps counting through an undo: only the board goes back.
    commit({ ...prev, elapsed: foldClock(live, state).elapsed });
    if (live.live !== null) live.live = Date.now();
  };
  const restart = (d: Difficulty = state.difficulty) => {
    live.live = null; history = []; setSel(-1);
    commit(newGame(d, state.best));
  };
  const put = (d: number, note: boolean) => {
    if (sel < 0) return;
    act((s) => (note && d ? toggleNote(s, sel, d) : d ? setValue(s, sel, d) : clearCell(s, sel)));
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      return;
    }
    const at = sel < 0 ? 40 : sel;
    const x = at % 9, y = Math.floor(at / 9);
    const move = (nx: number, ny: number) => setSel(((ny + 9) % 9) * 9 + ((nx + 9) % 9));
    // Shift+digit arrives as "!" "@" ... on a US layout, so the digit comes from the key code.
    const digit = /^Digit[1-9]$|^Numpad[1-9]$/.test(e.code) ? Number(e.code.slice(-1)) : 0;
    if (e.key === "ArrowLeft") move(x - 1, y);
    else if (e.key === "ArrowRight") move(x + 1, y);
    else if (e.key === "ArrowUp") move(x, y - 1);
    else if (e.key === "ArrowDown") move(x, y + 1);
    else if (digit) { if (sel < 0) setSel(at); put(digit, notesMode || e.shiftKey); }
    else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") put(0, false);
    else if (e.key === " ") setNotesMode((n) => !n);
    else return;
    e.preventDefault();
  };

  const bad = conflicts(state.values);
  const selVal = sel >= 0 ? state.values[sel] : 0;
  const related = new Set(sel >= 0 ? PEERS[sel] : []);
  const cell = size / 9;
  const best = state.best[state.difficulty];
  // How many of each digit are placed, so a finished digit greys out on the pad.
  const placed = Array.from({ length: 10 }, (_, d) => state.values.filter((v) => v === d).length);

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col gap-2 p-3 outline-none">
      <div className="flex flex-wrap items-center gap-2">
        <Stat label="Time" value={clockText(shown)} />
        <Stat label="Best" value={best === undefined ? "–" : clockText(best)} />
        <span className="ml-auto flex flex-wrap gap-1.5">
          <Choice value={state.difficulty} onPick={(d) => restart(d)}
            options={(Object.keys(LABEL) as Difficulty[]).map((d) => ({ value: d, label: LABEL[d] }))} />
          <Btn onClick={() => restart()} title="New puzzle"><RotateCcw size={12} /> New</Btn>
        </span>
      </div>
      <div ref={boardRef} className="flex min-h-0 flex-1 items-center justify-center">
        {size > 0 && (
          <div className="relative select-none overflow-hidden rounded-md" style={{ width: size, height: size, background: "#1c1e26",
            display: "grid", gridTemplateColumns: "repeat(9, 1fr)", border: "2px solid #6b7088" }}>
            {state.values.map((v, i) => {
              const r = Math.floor(i / 9), c = i % 9;
              const given = !!state.puzzle[i];
              const bg = i === sel ? "#3d3566" : v && v === selVal ? "#2f2a4f" : related.has(i) ? "#24262f" : "transparent";
              return (
                <div key={i}
                  onMouseDown={(e) => { if (e.button !== 2) setSel(i); }}
                  // Right-click empties the cell (its number and its notes) without moving the selection.
                  onContextMenu={(e) => { e.preventDefault(); act((s) => clearCell(s, i)); }}
                  className="relative flex items-center justify-center"
                  style={{
                    background: bg, cursor: "pointer",
                    borderRight: c === 8 ? "none" : c % 3 === 2 ? "2px solid #6b7088" : "1px solid #34374a",
                    borderBottom: r === 8 ? "none" : r % 3 === 2 ? "2px solid #6b7088" : "1px solid #34374a",
                    fontSize: cell * 0.55, fontWeight: given ? 700 : 500,
                    color: bad.has(i) && !given ? "#ff6b6b" : bad.has(i) ? "#ffa8a8" : given ? "#e6e6ea" : "var(--accent)",
                  }}>
                  {v ? v : state.notes[i] ? (
                    <div className="grid h-full w-full grid-cols-3 grid-rows-3 p-[2px]" style={{ fontSize: cell * 0.2, color: "#9aa0b4" }}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                        <span key={d} className="flex items-center justify-center" style={{ fontWeight: d === selVal ? 700 : 400, color: d === selVal ? "var(--accent)" : undefined }}>
                          {state.notes[i] & (1 << d) ? d : ""}
                        </span>
                      ))}
                    </div>
                  ) : ""}
                </div>
              );
            })}
            {state.status === "won" && (
              <Overlay title="Solved!">
                <div className="text-[13px] text-white/80">
                  {clockText(state.elapsed)}{best === state.elapsed && !state.hints ? " · a new best" : ""}{state.hints ? ` · ${state.hints} hint${state.hints > 1 ? "s" : ""}` : ""}
                </div>
                <Btn onClick={() => restart()} primary>New puzzle</Btn>
              </Overlay>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button key={d} onClick={() => put(d, notesMode)} disabled={placed[d] >= 9}
            className="h-8 w-8 rounded-lg border border-subtle bg-elev text-[15px] font-semibold text-text-primary transition-colors hover:border-strong disabled:opacity-30 disabled:hover:border-subtle">
            {d}
          </button>
        ))}
        <Btn onClick={() => setNotesMode((n) => !n)} title="Notes (Space, or Shift with a digit)" on={notesMode}>
          <Pencil size={12} /> Notes {notesMode ? "on" : "off"}
        </Btn>
        <Btn onClick={() => put(0, false)} title="Clear (Backspace)">Clear</Btn>
        <Btn onClick={undo} disabled={!history.length} title="Undo (Ctrl+Z)"><Undo2 size={12} /> Undo</Btn>
        <Btn onClick={() => sel >= 0 && act((s) => hint(s, sel))} disabled={sel < 0} title="Fill the selected cell"><Lightbulb size={12} /> Hint</Btn>
      </div>
    </div>
  );
}
