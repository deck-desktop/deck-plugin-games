// The word game: guess a five-letter word in six tries, each guess marked letter by letter.
// The rules as pure functions, so games.check.mjs can test them.
import { ANSWERS } from "./words";

export type Mark = "hit" | "near" | "miss";
export type Mode = "daily" | "unlimited";
export const LEN = 5, TRIES = 6;

/**
 * Mark a guess: `hit` for the right letter in the right place, `near` for a letter the answer
 * has elsewhere, `miss` otherwise. A repeated letter is `near` only as many times as the answer
 * still has it once the hits are counted: "geese" against "those" is miss miss miss hit hit, the
 * first two e's missing because the answer's only e is already a hit.
 */
export function mark(guess: string, answer: string): Mark[] {
  const out: Mark[] = Array(LEN).fill("miss");
  const left: Record<string, number> = {};
  for (let i = 0; i < LEN; i++) {
    if (guess[i] === answer[i]) out[i] = "hit";
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < LEN; i++) {
    if (out[i] === "hit" || !left[guess[i]]) continue;
    out[i] = "near";
    left[guess[i]]--;
  }
  return out;
}

/** The day's answer: the same for a date wherever the game runs. */
export function dailyAnswer(date: string): string {
  let h = 2166136261;
  for (const c of date) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ANSWERS[(h >>> 0) % ANSWERS.length];
}
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export interface Stats { played: number; won: number; streak: number; maxStreak: number; dist: number[] }
export interface StateWords {
  mode: Mode;
  /** For the daily game, the date it is for. */
  date: string;
  answer: string;
  guesses: string[];
  /** What is being typed. */
  draft: string;
  status: "playing" | "won" | "lost";
  stats: Record<Mode, Stats>;
}

const noStats = (): Stats => ({ played: 0, won: 0, streak: 0, maxStreak: 0, dist: Array(TRIES).fill(0) });

export function newGame(mode: Mode, stats?: StateWords["stats"], rnd: () => number = Math.random, date = today()): StateWords {
  return {
    mode, date, answer: mode === "daily" ? dailyAnswer(date) : ANSWERS[Math.floor(rnd() * ANSWERS.length)],
    guesses: [], draft: "", status: "playing", stats: stats ?? { daily: noStats(), unlimited: noStats() },
  };
}

export function type(s: StateWords, letter: string): StateWords {
  if (s.status !== "playing" || s.draft.length >= LEN || !/^[a-z]$/.test(letter)) return s;
  return { ...s, draft: s.draft + letter };
}
export const erase = (s: StateWords): StateWords => (s.status !== "playing" || !s.draft ? s : { ...s, draft: s.draft.slice(0, -1) });

/** Enter the draft as a guess, if it is five letters; win, lose, and the stats. */
export function submit(s: StateWords): StateWords {
  if (s.status !== "playing" || s.draft.length !== LEN) return s;
  const guesses = [...s.guesses, s.draft];
  const won = s.draft === s.answer;
  const status = won ? "won" : guesses.length >= TRIES ? "lost" : "playing";
  if (status === "playing") return { ...s, guesses, draft: "" };
  const st = s.stats[s.mode];
  const dist = [...st.dist];
  if (won) dist[guesses.length - 1]++;
  const streak = won ? st.streak + 1 : 0;
  return {
    ...s, guesses, draft: "", status,
    stats: { ...s.stats, [s.mode]: { played: st.played + 1, won: st.won + (won ? 1 : 0), streak, maxStreak: Math.max(st.maxStreak, streak), dist } },
  };
}

/** The best mark each letter has had so far, for the on-screen keyboard. */
export function keyMarks(s: StateWords): Record<string, Mark> {
  const rank: Record<Mark, number> = { miss: 0, near: 1, hit: 2 };
  const out: Record<string, Mark> = {};
  for (const g of s.guesses) mark(g, s.answer).forEach((m, i) => {
    const c = g[i];
    if (!out[c] || rank[m] > rank[out[c]]) out[c] = m;
  });
  return out;
}

/** A save from disk, checked. A daily game from another day is replaced by today's. */
export function restore(v: unknown, date = today()): StateWords | null {
  const s = v as Partial<StateWords> | null;
  const word = (w: unknown) => typeof w === "string" && /^[a-z]{5}$/.test(w);
  if (!s || (s.mode !== "daily" && s.mode !== "unlimited") || !word(s.answer) || !Array.isArray(s.guesses) || !s.guesses.every(word)) return null;
  const stat = (x: unknown): Stats => {
    const t = x as Partial<Stats> | null;
    return t && Array.isArray(t.dist) && t.dist.length === TRIES ? { played: Number(t.played) || 0, won: Number(t.won) || 0, streak: Number(t.streak) || 0, maxStreak: Number(t.maxStreak) || 0, dist: t.dist.map(Number) } : noStats();
  };
  const stats = { daily: stat(s.stats?.daily), unlimited: stat(s.stats?.unlimited) };
  if (s.mode === "daily" && s.date !== date) return newGame("daily", stats, Math.random, date);
  return {
    mode: s.mode, date: String(s.date ?? date), answer: s.answer!, guesses: s.guesses, draft: typeof s.draft === "string" && /^[a-z]{0,5}$/.test(s.draft) ? s.draft : "",
    status: s.status === "won" || s.status === "lost" ? s.status : "playing", stats,
  };
}
