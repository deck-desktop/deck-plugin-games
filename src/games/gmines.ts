// Minesweeper: the rules, as pure functions, so games.check.mjs can test them.
//
// Cells are indexed row by row. The mines are laid only on the first open, away from that cell
// and its neighbours, so the first click always opens an area rather than ending the game.

export type Level = "easy" | "medium" | "hard";
export const LEVELS: Record<Level, { w: number; h: number; mines: number; label: string }> = {
  easy: { w: 9, h: 9, mines: 10, label: "Easy" },
  medium: { w: 16, h: 16, mines: 40, label: "Medium" },
  hard: { w: 30, h: 16, mines: 99, label: "Hard" },
};

export interface StateMines {
  level: Level;
  w: number; h: number; mines: number;
  /** 1 where a mine is; empty until the first open lays them. */
  mine: number[];
  /** 1 where the cell is open. */
  open: number[];
  /** 1 where the cell is flagged. */
  flag: number[];
  status: "ready" | "playing" | "won" | "lost";
  /** Milliseconds played, not counting time away. */
  elapsed: number;
  /** The mine that went off, for the board to mark. */
  boom?: number;
  /** Best time per level, in milliseconds. */
  best: Partial<Record<Level, number>>;
}

export function newGame(level: Level = "easy", best: StateMines["best"] = {}): StateMines {
  const { w, h, mines } = LEVELS[level];
  return { level, w, h, mines, mine: [], open: Array(w * h).fill(0), flag: Array(w * h).fill(0), status: "ready", elapsed: 0, best };
}

export function neighbours(s: { w: number; h: number }, i: number): number[] {
  const x = i % s.w, y = Math.floor(i / s.w), out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < s.w && ny < s.h) out.push(ny * s.w + nx);
  }
  return out;
}

/** Mines around a cell: the number it shows when open. */
export const count = (s: StateMines, i: number) => neighbours(s, i).reduce((n, j) => n + (s.mine[j] ? 1 : 0), 0);

/** Lay the mines anywhere but `safe` and its neighbours. `rnd` is injectable for the checks. */
export function layMines(s: StateMines, safe: number, rnd: () => number = Math.random): number[] {
  const keep = new Set([safe, ...neighbours(s, safe)]);
  const spots = Array.from({ length: s.w * s.h }, (_, i) => i).filter((i) => !keep.has(i));
  const mine = Array(s.w * s.h).fill(0);
  for (let n = 0; n < s.mines && spots.length; n++) mine[spots.splice(Math.floor(rnd() * spots.length), 1)[0]] = 1;
  return mine;
}

function finish(s: StateMines): StateMines {
  // Won when every cell that is not a mine is open; the mines are flagged for the picture.
  const won = s.open.every((o, i) => o || s.mine[i]);
  if (!won) return s;
  const best = s.best[s.level];
  return {
    ...s, status: "won", flag: s.mine.map((m) => m),
    best: { ...s.best, [s.level]: best === undefined ? s.elapsed : Math.min(best, s.elapsed) },
  };
}

/** Open a cell: the first open lays the mines; a zero opens its whole area; a mine ends it. */
export function reveal(s: StateMines, i: number, rnd: () => number = Math.random): StateMines {
  if (s.status === "won" || s.status === "lost" || s.open[i] || s.flag[i]) return s;
  let st = s;
  if (st.status === "ready") st = { ...st, mine: layMines(st, i, rnd), status: "playing" };
  if (st.mine[i]) return { ...st, status: "lost", boom: i, open: st.open.map((o, j) => (o || st.mine[j] ? 1 : 0)) };
  const open = [...st.open];
  const stack = [i];
  while (stack.length) {
    const c = stack.pop()!;
    if (open[c] || st.flag[c]) continue;
    open[c] = 1;
    if (count(st, c) === 0) for (const n of neighbours(st, c)) if (!open[n]) stack.push(n);
  }
  return finish({ ...st, open });
}

/** Clicking an open number whose flags are all placed opens the rest of its neighbours. */
export function chord(s: StateMines, i: number): StateMines {
  if (s.status !== "playing" || !s.open[i]) return s;
  const around = neighbours(s, i);
  if (around.filter((j) => s.flag[j]).length !== count(s, i)) return s;
  let st = s;
  for (const j of around) if (!st.open[j] && !st.flag[j]) st = reveal(st, j);
  return st;
}

export function toggleFlag(s: StateMines, i: number): StateMines {
  if (s.status === "won" || s.status === "lost" || s.open[i]) return s;
  const flag = [...s.flag];
  flag[i] = flag[i] ? 0 : 1;
  return { ...s, flag };
}

export const minesLeft = (s: StateMines) => s.mines - s.flag.reduce((a, b) => a + b, 0);

/** A save from disk, checked: anything malformed starts a new game. */
export function restore(v: unknown): StateMines | null {
  const s = v as Partial<StateMines> | null;
  if (!s || !s.level || !(s.level in LEVELS)) return null;
  const { w, h, mines } = LEVELS[s.level];
  const n = w * h;
  const okArr = (a: unknown, len: number) => Array.isArray(a) && a.length === len && a.every((x) => x === 0 || x === 1);
  if (!okArr(s.open, n) || !okArr(s.flag, n) || !(okArr(s.mine, n) || (Array.isArray(s.mine) && s.mine.length === 0))) return null;
  if (!["ready", "playing", "won", "lost"].includes(String(s.status))) return null;
  return {
    level: s.level, w, h, mines, mine: s.mine!, open: s.open!, flag: s.flag!, status: s.status!,
    elapsed: Number(s.elapsed) || 0, boom: typeof s.boom === "number" ? s.boom : undefined,
    best: s.best && typeof s.best === "object" ? s.best : {},
  };
}
