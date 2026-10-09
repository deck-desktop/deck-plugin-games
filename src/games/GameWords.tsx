// The word game on screen: type a five-letter word and press Enter; Backspace deletes. The
// on-screen keyboard works too and shows what each letter has been marked. Daily is the same word
// for a date, one a day; Unlimited is a new word each game. Each mode is saved on its own, so
// switching never throws away an unfinished daily word.
import { useState } from "react";
import { motion } from "framer-motion";
import { CalendarDays, Infinity as InfinityIcon, RotateCcw } from "lucide-react";
import { useGame } from "../store";
import { LEN, TRIES, erase, keyMarks, mark, newGame, restore, submit, type, type Mark, type Mode, type StateWords } from "./gwords";
import { Btn, useFocusOnMount } from "../ui";

const COLORS: Record<Mark, string> = { hit: "#3d9a50", near: "#c49a1f", miss: "#3a3d4a" };
/** A letter already ruled out: red on the keyboard, and red when typed into a new guess. */
const OUT = "#b33a3a", OUT_TEXT = "#ff6b6b";
const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

export function GameWords() {
  // The mode shown is a pane-local choice; each mode's game and stats are saved separately.
  const [mode, setMode] = useState<Mode>("daily");
  const [daily, saveDaily] = useGame<StateWords>("words-daily", (v) => restore(v), () => newGame("daily"));
  const [free, saveFree] = useGame<StateWords>("words-unlimited", (v) => restore(v), () => newGame("unlimited"));
  const state = mode === "daily" ? daily : free;
  const save = mode === "daily" ? saveDaily : saveFree;
  const [shake, setShake] = useState(0);
  const focusRef = useFocusOnMount<HTMLDivElement>();

  const enter = () => {
    const next = submit(state);
    if (next === state) { if (state.status === "playing") setShake((n) => n + 1); return; }
    save(next);
  };
  const key = (k: string) => {
    if (k === "enter") enter();
    else if (k === "back") save(erase(state));
    else save(type(state, k));
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Enter") key("enter");
    else if (e.key === "Backspace") key("back");
    else if (/^[a-zA-Z]$/.test(e.key)) key(e.key.toLowerCase());
    else return;
    e.preventDefault();
  };

  const marks = keyMarks(state);
  const st = state.stats[state.mode];
  const done = state.status !== "playing";
  const rows = Array.from({ length: TRIES }, (_, r) => state.guesses[r] ?? (r === state.guesses.length ? state.draft : ""));

  return (
    <div ref={focusRef} tabIndex={0} onKeyDown={onKey} onMouseDown={() => focusRef.current?.focus({ preventScroll: true })}
      className="flex h-full min-h-0 flex-col items-center gap-3 overflow-y-auto p-3 outline-none">
      <div className="flex w-full flex-wrap items-center gap-1.5">
        {(["daily", "unlimited"] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] transition ${m === mode ? "bg-accent-soft text-text-primary" : "text-text-muted hover:text-text-primary"}`}>
            {m === "daily" ? <CalendarDays size={12} /> : <InfinityIcon size={12} />} {m === "daily" ? "Daily" : "Unlimited"}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-text-muted">{mode === "daily" ? state.date : `${st.played} played`}</span>
        {mode === "unlimited" && <Btn onClick={() => saveFree(newGame("unlimited", free.stats))} title="A new word"><RotateCcw size={12} /> New</Btn>}
      </div>

      {/* A short shake when Enter is pressed on fewer than five letters. */}
      <motion.div key={shake} className="grid gap-1.5" style={{ gridTemplateRows: `repeat(${TRIES}, 1fr)` }}
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : undefined} transition={{ duration: 0.3 }}>
        {rows.map((word, r) => {
          const m = r < state.guesses.length ? mark(word, state.answer) : null;
          return (
            <div key={r} className="flex gap-1.5">
              {Array.from({ length: LEN }, (_, i) => (
                <div key={i} className="flex h-11 w-11 items-center justify-center rounded-md text-[20px] font-bold uppercase"
                  style={{
                    background: m ? COLORS[m[i]] : "transparent",
                    color: !m && word[i] && marks[word[i]] === "miss" ? OUT_TEXT : "#f1f1f4",
                    border: m ? "none" : `2px solid ${word[i] ? "#6b7088" : "#34374a"}`,
                  }}>
                  {word[i] ?? ""}
                </div>
              ))}
            </div>
          );
        })}
      </motion.div>

      {done && (
        <div className="w-full max-w-[320px] rounded-lg border border-subtle bg-card p-3 text-center">
          <div className="text-[15px] font-semibold text-text-primary">
            {state.status === "won" ? ["Genius", "Magnificent", "Impressive", "Splendid", "Great", "Phew"][state.guesses.length - 1] : "Out of tries"}
          </div>
          {state.status === "lost" && <div className="mt-0.5 text-[13px] text-text-secondary">The word was <b className="uppercase text-text-primary">{state.answer}</b></div>}
          <div className="mt-2 grid grid-cols-4 gap-1 text-[11px] text-text-muted">
            {[["Played", st.played], ["Win %", st.played ? Math.round((st.won / st.played) * 100) : 0], ["Streak", st.streak], ["Best", st.maxStreak]].map(([l, v]) => (
              <div key={String(l)}><div className="text-[16px] font-semibold text-text-primary">{v}</div>{l}</div>
            ))}
          </div>
          <div className="mt-2 space-y-0.5">
            {st.dist.map((n, i) => {
              const max = Math.max(1, ...st.dist);
              const here = state.status === "won" && state.guesses.length === i + 1;
              return (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-3 text-text-muted">{i + 1}</span>
                  <div className="rounded-sm px-1.5 text-right text-white" style={{ width: `${Math.max(8, (n / max) * 100)}%`, background: here ? "#3d9a50" : "#3a3d4a" }}>{n}</div>
                </div>
              );
            })}
          </div>
          {mode === "daily"
            ? <div className="mt-2 text-[11px] text-text-muted">A new word tomorrow. Unlimited has as many as you like.</div>
            : <div className="mt-2"><Btn onClick={() => saveFree(newGame("unlimited", free.stats))}>Next word</Btn></div>}
        </div>
      )}

      <div className="flex flex-col items-center gap-1.5">
        {ROWS.map((row, r) => (
          <div key={r} className="flex gap-1">
            {r === 2 && <KeyCap label="Enter" wide onClick={() => key("enter")} />}
            {[...row].map((c) => <KeyCap key={c} label={c} mark={marks[c]} onClick={() => key(c)} />)}
            {r === 2 && <KeyCap label="⌫" wide onClick={() => key("back")} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function KeyCap({ label, mark: m, wide, onClick }: { label: string; mark?: Mark; wide?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} tabIndex={-1}
      className={`flex h-10 items-center justify-center rounded-md text-[13px] font-semibold uppercase text-white transition hover:brightness-125 ${wide ? "px-2.5" : "w-8"}`}
      style={{ background: m === "miss" ? OUT : m ? COLORS[m] : "#4b4f60" }}>
      {label}
    </button>
  );
}
