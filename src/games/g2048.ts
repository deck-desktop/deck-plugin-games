// 2048: the rules, as pure functions over a 4x4 board, so games.check.mjs can test them.
//
// The board is 16 numbers, row by row, 0 for empty. A move slides every row (or column) toward
// one edge, merging equal neighbours once per move (2 2 2 2 becomes 4 4, not 8), and a new tile
// appears only when something moved.

export type Dir = "left" | "right" | "up" | "down";
export const SIZE = 4;

export interface State2048 {
  board: number[];
  score: number;
  best: number;
  /** Reached 2048, and the "you won" card was shown. Play can go on past it. */
  won: boolean;
  /** No move changes the board. */
  over: boolean;
  /** The board and score before the last move, for one undo. */
  undo?: { board: number[]; score: number };
}

/** Slide one row toward its start, merging each pair once. */
export function slideRow(row: number[]): { row: number[]; gained: number } {
  const tiles = row.filter((v) => v !== 0);
  const out: number[] = [];
  let gained = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] === tiles[i + 1]) { out.push(tiles[i] * 2); gained += tiles[i] * 2; i++; }
    else out.push(tiles[i]);
  }
  while (out.length < row.length) out.push(0);
  return { row: out, gained };
}

/** The cells of line `i` in the order a move toward `dir` reads them (the edge it moves to first). */
function line(dir: Dir, i: number): number[] {
  return Array.from({ length: SIZE }, (_, j) =>
    dir === "left" ? i * SIZE + j
    : dir === "right" ? i * SIZE + (SIZE - 1 - j)
    : dir === "up" ? j * SIZE + i
    : (SIZE - 1 - j) * SIZE + i);
}

export function move(board: number[], dir: Dir): { board: number[]; gained: number; moved: boolean } {
  const next = [...board];
  let gained = 0;
  for (let i = 0; i < SIZE; i++) {
    const cells = line(dir, i);
    const r = slideRow(cells.map((c) => board[c]));
    cells.forEach((c, j) => { next[c] = r.row[j]; });
    gained += r.gained;
  }
  return { board: next, gained, moved: next.some((v, i) => v !== board[i]) };
}

/** A 2 (nine times in ten) or a 4 in a random empty cell. `rnd` is injectable for the checks. */
export function spawn(board: number[], rnd: () => number = Math.random): number[] {
  const empty = board.flatMap((v, i) => (v === 0 ? [i] : []));
  if (!empty.length) return board;
  const next = [...board];
  next[empty[Math.floor(rnd() * empty.length)]] = rnd() < 0.9 ? 2 : 4;
  return next;
}

export const canMove = (board: number[]) => (["left", "right", "up", "down"] as Dir[]).some((d) => move(board, d).moved);

export function newGame(best = 0, rnd: () => number = Math.random): State2048 {
  return { board: spawn(spawn(Array(SIZE * SIZE).fill(0), rnd), rnd), score: 0, best, won: false, over: false };
}

/** One turn: the move, a new tile if anything moved, the score, and whether the game is over. */
export function play(s: State2048, dir: Dir, rnd: () => number = Math.random): State2048 {
  if (s.over) return s;
  const m = move(s.board, dir);
  if (!m.moved) return s;
  const board = spawn(m.board, rnd);
  const score = s.score + m.gained;
  return {
    board, score, best: Math.max(s.best, score),
    won: s.won || board.some((v) => v >= 2048),
    over: !canMove(board),
    undo: { board: s.board, score: s.score },
  };
}

export function undo(s: State2048): State2048 {
  return s.undo ? { ...s, board: s.undo.board, score: s.undo.score, over: false, undo: undefined } : s;
}

/** A save from disk, checked: anything malformed starts a new game rather than a broken one. */
export function restore(v: unknown): State2048 | null {
  const s = v as Partial<State2048> | null;
  if (!s || !Array.isArray(s.board) || s.board.length !== SIZE * SIZE || !s.board.every((n) => Number.isInteger(n) && n >= 0)) return null;
  return {
    board: s.board, score: Number(s.score) || 0, best: Number(s.best) || 0, won: !!s.won, over: !canMove(s.board),
    undo: s.undo && Array.isArray(s.undo.board) && s.undo.board.length === SIZE * SIZE ? s.undo : undefined,
  };
}
