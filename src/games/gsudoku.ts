// Sudoku: generating puzzles with exactly one solution, and the rules, as pure functions so
// games.check.mjs can test them.
//
// A grid is 81 numbers, row by row, 0 for empty. A puzzle is made by filling a whole grid at
// random, then emptying cells one by one, keeping each removal only while the puzzle still has a
// single solution. Difficulty is how many numbers are left given.

export type Difficulty = "easy" | "medium" | "hard";
export const GIVENS: Record<Difficulty, number> = { easy: 40, medium: 32, hard: 26 };
export const LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

const row = (i: number) => Math.floor(i / 9), col = (i: number) => i % 9;
const box = (i: number) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);

/** The 20 cells that share a row, a column or a box with cell i. */
export const PEERS: number[][] = Array.from({ length: 81 }, (_, i) =>
  Array.from({ length: 81 }, (_, j) => j).filter((j) => j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))));

/** Digits 1..9 that can go in cell i, as a bitmask (bit d set for digit d). */
function candidates(g: number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << g[p];
  return ~used & 0b1111111110;
}

/**
 * Count solutions, stopping at `limit`. Fills the emptiest-choice cell first, which keeps the
 * search small enough to run on every removal while generating.
 */
export function countSolutions(grid: number[], limit = 2): number {
  const g = [...grid];
  let found = 0;
  const solve = (): boolean => {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = candidates(g, i);
      const n = popcount(m);
      if (n === 0) return false;
      if (n < bestCount) { best = i; bestMask = m; bestCount = n; if (n === 1) break; }
    }
    if (best < 0) { found++; return found >= limit; }
    for (let d = 1; d <= 9; d++) {
      if (!(bestMask & (1 << d))) continue;
      g[best] = d;
      if (solve()) return true;
    }
    g[best] = 0;
    return false;
  };
  solve();
  return found;
}
const popcount = (m: number) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

/** A complete, valid grid, at random. */
export function fullGrid(rnd: () => number = Math.random): number[] {
  const g = Array(81).fill(0);
  const fill = (i: number): boolean => {
    if (i === 81) return true;
    const ds = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => rnd() - 0.5);
    for (const d of ds) {
      if (candidates(g, i) & (1 << d)) { g[i] = d; if (fill(i + 1)) return true; }
    }
    g[i] = 0;
    return false;
  };
  fill(0);
  return g;
}

/** A puzzle with exactly one solution and (about) the difficulty's number of givens. */
export function makePuzzle(difficulty: Difficulty, rnd: () => number = Math.random): { puzzle: number[]; solution: number[] } {
  const solution = fullGrid(rnd);
  const puzzle = [...solution];
  const order = Array.from({ length: 81 }, (_, i) => i).sort(() => rnd() - 0.5);
  let givens = 81;
  for (const i of order) {
    if (givens <= GIVENS[difficulty]) break;
    const keep = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle) === 1) givens--;
    else puzzle[i] = keep;
  }
  return { puzzle, solution };
}

export interface StateSudoku {
  difficulty: Difficulty;
  /** The given numbers; 0 where the player fills in. */
  puzzle: number[];
  solution: number[];
  /** The player's numbers; 0 for empty. Given cells are never changed. */
  values: number[];
  /** Pencil marks per cell, bit d for digit d. */
  notes: number[];
  status: "playing" | "won";
  elapsed: number;
  best: Partial<Record<Difficulty, number>>;
  /** Hints used this game. */
  hints: number;
}

export function newGame(difficulty: Difficulty = "easy", best: StateSudoku["best"] = {}, rnd: () => number = Math.random): StateSudoku {
  const { puzzle, solution } = makePuzzle(difficulty, rnd);
  return { difficulty, puzzle, solution, values: [...puzzle], notes: Array(81).fill(0), status: "playing", elapsed: 0, best, hints: 0 };
}

/** Cells whose number repeats in their row, column or box. */
export function conflicts(values: number[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < 81; i++) {
    if (!values[i]) continue;
    for (const p of PEERS[i]) if (values[p] === values[i]) { bad.add(i); bad.add(p); }
  }
  return bad;
}

const finish = (s: StateSudoku): StateSudoku => {
  if (!s.values.every((v, i) => v === s.solution[i])) return s;
  const prev = s.best[s.difficulty];
  return { ...s, status: "won", notes: Array(81).fill(0), best: { ...s.best, [s.difficulty]: prev === undefined ? s.elapsed : Math.min(prev, s.elapsed) } };
};

/** Put a number in a cell (0 clears it). Placing one clears that digit from its peers' notes. */
export function setValue(s: StateSudoku, i: number, d: number): StateSudoku {
  if (s.status !== "playing" || s.puzzle[i] || s.values[i] === d) return s;
  const values = [...s.values];
  values[i] = d;
  const notes = [...s.notes];
  notes[i] = 0;
  if (d) for (const p of PEERS[i]) notes[p] &= ~(1 << d);
  return finish({ ...s, values, notes });
}

/** Empty a cell: its number and its notes. Givens stay. */
export function clearCell(s: StateSudoku, i: number): StateSudoku {
  if (s.status !== "playing" || s.puzzle[i] || (!s.values[i] && !s.notes[i])) return s;
  const values = [...s.values], notes = [...s.notes];
  values[i] = 0;
  notes[i] = 0;
  return { ...s, values, notes };
}

/** Toggle a pencil mark; only in an empty cell. */
export function toggleNote(s: StateSudoku, i: number, d: number): StateSudoku {
  if (s.status !== "playing" || s.puzzle[i] || s.values[i] || d < 1 || d > 9) return s;
  const notes = [...s.notes];
  notes[i] ^= 1 << d;
  return { ...s, notes };
}

/** Fill a cell with its answer. */
export function hint(s: StateSudoku, i: number): StateSudoku {
  if (s.status !== "playing" || s.puzzle[i] || s.values[i] === s.solution[i]) return s;
  return { ...setValue(s, i, s.solution[i]), hints: s.hints + 1 };
}

/** A save from disk, checked: anything malformed starts a new game. */
export function restore(v: unknown): StateSudoku | null {
  const s = v as Partial<StateSudoku> | null;
  const grid = (a: unknown, max: number) => Array.isArray(a) && a.length === 81 && a.every((x) => Number.isInteger(x) && x >= 0 && x <= max);
  if (!s || !s.difficulty || !(s.difficulty in GIVENS)) return null;
  if (!grid(s.puzzle, 9) || !grid(s.solution, 9) || !grid(s.values, 9) || !grid(s.notes, 0b1111111110)) return null;
  if (!s.puzzle!.every((v, i) => !v || (v === s.solution![i] && s.values![i] === v))) return null;
  return {
    difficulty: s.difficulty, puzzle: s.puzzle!, solution: s.solution!, values: s.values!, notes: s.notes!,
    status: s.status === "won" ? "won" : "playing", elapsed: Number(s.elapsed) || 0,
    best: s.best && typeof s.best === "object" ? s.best : {}, hints: Number(s.hints) || 0,
  };
}
