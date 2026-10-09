// Tetris: the rules, as pure functions, so games.check.mjs can test them.
//
// The board is W x H cells, row by row, 0 for empty or 1..7 for the piece that left the block
// there. Pieces come from a shuffled bag of all seven, so no piece is ever missing for long. A
// piece that cannot fall further locks on the next tick; full rows clear and score by how many
// went at once, times the level.

export const W = 10, H = 20;
export type Kind = "I" | "O" | "T" | "S" | "Z" | "J" | "L";
export const KINDS: Kind[] = ["I", "O", "T", "S", "Z", "J", "L"];
/** Each piece's cells in its spawn orientation, inside a square of its size. */
const SHAPES: Record<Kind, number[][]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const BOX: Record<Kind, number> = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
/** The colour index a piece leaves on the board. */
export const COLOR: Record<Kind, number> = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

export interface Piece { kind: Kind; rot: number; x: number; y: number }

export interface StateTetris {
  board: number[];
  piece: Piece;
  /** The next pieces, from the current bag and the one after. */
  queue: Kind[];
  hold: Kind | null;
  /** Hold is once per piece. */
  canHold: boolean;
  score: number;
  lines: number;
  best: number;
  status: "ready" | "playing" | "paused" | "over";
}

/** The board cells a piece covers (x, y), rotating its shape clockwise `rot` times in its box. */
export function cells(p: Piece): [number, number][] {
  const n = BOX[p.kind];
  return SHAPES[p.kind].map(([cx, cy]) => {
    let x = cx, y = cy;
    for (let r = 0; r < ((p.rot % 4) + 4) % 4; r++) [x, y] = [n - 1 - y, x];
    return [p.x + x, p.y + y];
  });
}

/** Whether a piece is off the board or on a block. Above the top is allowed while it spawns. */
export function collides(board: number[], p: Piece): boolean {
  return cells(p).some(([x, y]) => x < 0 || x >= W || y >= H || (y >= 0 && board[y * W + x] !== 0));
}

/** A shuffled bag of all seven. `rnd` is injectable for the checks. */
export function bag(rnd: () => number = Math.random): Kind[] {
  const b = [...KINDS];
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

const spawnPiece = (kind: Kind): Piece => ({ kind, rot: 0, x: Math.floor((W - BOX[kind]) / 2), y: kind === "I" ? -1 : 0 });

export function newGame(best = 0, rnd: () => number = Math.random): StateTetris {
  const queue = [...bag(rnd), ...bag(rnd)];
  return { board: Array(W * H).fill(0), piece: spawnPiece(queue.shift()!), queue, hold: null, canHold: true, score: 0, lines: 0, best, status: "ready" };
}

export const level = (s: { lines: number }) => Math.floor(s.lines / 10) + 1;
/** Milliseconds per row of fall at the game's level. */
export const gravity = (s: { lines: number }) => Math.max(70, 800 - (level(s) - 1) * 70);

/** Move the piece by (dx, dy) if it fits; the same state if it does not. */
export function shift(s: StateTetris, dx: number, dy: number): StateTetris {
  if (s.status !== "playing") return s;
  const p = { ...s.piece, x: s.piece.x + dx, y: s.piece.y + dy };
  return collides(s.board, p) ? s : { ...s, piece: p };
}

/** Rotate, nudging sideways (then up) when the turn would hit a wall or a block. */
export function rotate(s: StateTetris, dir: 1 | -1): StateTetris {
  if (s.status !== "playing" || s.piece.kind === "O") return s;
  const turned = { ...s.piece, rot: (s.piece.rot + dir + 4) % 4 };
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]]) {
    const p = { ...turned, x: turned.x + dx, y: turned.y + dy };
    if (!collides(s.board, p)) return { ...s, piece: p };
  }
  return s;
}

const POINTS = [0, 100, 300, 500, 800];

/** Fix the piece into the board, clear full rows, and bring on the next piece. */
export function lock(s: StateTetris, rnd: () => number = Math.random): StateTetris {
  const board = [...s.board];
  let above = false;
  for (const [x, y] of cells(s.piece)) { if (y < 0) above = true; else board[y * W + x] = COLOR[s.piece.kind]; }
  // A piece locked partly above the top: there is no room left.
  if (above) return { ...s, board, status: "over", best: Math.max(s.best, s.score) };
  const kept: number[][] = [];
  for (let y = 0; y < H; y++) { const r = board.slice(y * W, y * W + W); if (r.some((v) => v === 0)) kept.push(r); }
  const cleared = H - kept.length;
  const nextBoard = [...Array(cleared * W).fill(0), ...kept.flat()];
  const lines = s.lines + cleared;
  const score = s.score + POINTS[cleared] * level(s);
  const queue = [...s.queue];
  const kind = queue.shift()!;
  if (queue.length < 7) queue.push(...bag(rnd));
  const piece = spawnPiece(kind);
  const over = collides(nextBoard, piece);
  return { ...s, board: nextBoard, piece, queue, canHold: true, lines, score, best: Math.max(s.best, score), status: over ? "over" : s.status };
}

/** One tick of gravity: fall a row, or lock where it is. */
export function tick(s: StateTetris, rnd: () => number = Math.random): StateTetris {
  if (s.status !== "playing") return s;
  const fell = shift(s, 0, 1);
  return fell !== s ? fell : lock(s, rnd);
}

/** Soft drop: a row down now, a point for it. */
export function softDrop(s: StateTetris, rnd: () => number = Math.random): StateTetris {
  if (s.status !== "playing") return s;
  const fell = shift(s, 0, 1);
  return fell !== s ? { ...fell, score: fell.score + 1 } : lock(s, rnd);
}

/** Where the piece would land: the ghost on screen, and the hard drop. */
export function landing(s: StateTetris): Piece {
  let p = s.piece;
  while (!collides(s.board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 };
  return p;
}

/** Hard drop: straight down and lock, two points a row. */
export function hardDrop(s: StateTetris, rnd: () => number = Math.random): StateTetris {
  if (s.status !== "playing") return s;
  const p = landing(s);
  return lock({ ...s, piece: p, score: s.score + 2 * (p.y - s.piece.y) }, rnd);
}

/** Swap the piece for the held one (or the next, the first time). Once per piece. */
export function hold(s: StateTetris): StateTetris {
  if (s.status !== "playing" || !s.canHold) return s;
  const queue = [...s.queue];
  const next = s.hold ?? queue.shift()!;
  return { ...s, piece: spawnPiece(next), hold: s.piece.kind, queue, canHold: false };
}

/** A save from disk, checked; a game that was running comes back paused. */
export function restore(v: unknown): StateTetris | null {
  const s = v as Partial<StateTetris> | null;
  const kind = (k: unknown): k is Kind => typeof k === "string" && (KINDS as string[]).includes(k);
  if (!s || !Array.isArray(s.board) || s.board.length !== W * H || !s.board.every((n) => Number.isInteger(n) && n >= 0 && n <= 7)) return null;
  if (!s.piece || !kind(s.piece.kind) || !Array.isArray(s.queue) || s.queue.length < 1 || !s.queue.every(kind)) return null;
  if (!["ready", "playing", "paused", "over"].includes(String(s.status))) return null;
  return {
    board: s.board, piece: { kind: s.piece.kind, rot: Number(s.piece.rot) || 0, x: Number(s.piece.x) || 0, y: Number(s.piece.y) || 0 },
    queue: s.queue, hold: kind(s.hold) ? s.hold : null, canHold: s.canHold !== false,
    score: Number(s.score) || 0, lines: Number(s.lines) || 0, best: Number(s.best) || 0,
    status: s.status === "playing" ? "paused" : s.status!,
  };
}
