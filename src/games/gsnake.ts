// Snake: the rules, as pure functions, so games.check.mjs can test them.
//
// The board is W x H cells, indexed row by row. The snake is a list of cells, head first. Each
// step moves the head one cell; eating the food grows it by one, and a wall or its own body ends
// the game. Turns are queued (two at most) so two quick key presses inside one step both count.

export const W = 20, H = 20;
export type Dir = "up" | "down" | "left" | "right";
const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export interface StateSnake {
  snake: number[];
  dir: Dir;
  /** Turns pressed but not yet taken, oldest first. */
  queue: Dir[];
  food: number;
  score: number;
  best: number;
  status: "ready" | "playing" | "paused" | "over";
}

/** A random empty cell for the food. `rnd` is injectable for the checks. */
export function placeFood(snake: number[], rnd: () => number = Math.random): number {
  const taken = new Set(snake);
  const free = Array.from({ length: W * H }, (_, i) => i).filter((i) => !taken.has(i));
  return free.length ? free[Math.floor(rnd() * free.length)] : -1;
}

export function newGame(best = 0, rnd: () => number = Math.random): StateSnake {
  const mid = Math.floor(H / 2) * W + Math.floor(W / 2);
  const snake = [mid, mid - 1, mid - 2];
  return { snake, dir: "right", queue: [], food: placeFood(snake, rnd), score: 0, best, status: "ready" };
}

/** Queue a turn, unless it reverses the way the snake will be going or repeats it. */
export function turn(s: StateSnake, d: Dir): StateSnake {
  if (s.status === "over") return s;
  const planned = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  if (d === planned || d === OPPOSITE[planned] || s.queue.length >= 2) return s;
  return { ...s, queue: [...s.queue, d] };
}

/** The cell one step from `cell` toward `d`, or -1 through a wall. */
export function next(cell: number, d: Dir): number {
  const x = cell % W, y = Math.floor(cell / W);
  const nx = x + (d === "right" ? 1 : d === "left" ? -1 : 0);
  const ny = y + (d === "down" ? 1 : d === "up" ? -1 : 0);
  return nx < 0 || ny < 0 || nx >= W || ny >= H ? -1 : ny * W + nx;
}

/** One step of the game. */
export function step(s: StateSnake, rnd: () => number = Math.random): StateSnake {
  if (s.status !== "playing") return s;
  const [dir, ...queue] = s.queue.length ? s.queue : [s.dir];
  const head = next(s.snake[0], dir);
  const eats = head === s.food;
  // The tail moves out of its cell this step unless the snake grows, so moving into it is fine.
  const body = eats ? s.snake : s.snake.slice(0, -1);
  if (head < 0 || body.includes(head)) return { ...s, dir, queue: [], status: "over", best: Math.max(s.best, s.score) };
  const snake = [head, ...body];
  if (!eats) return { ...s, snake, dir, queue };
  const score = s.score + 1;
  const food = placeFood(snake, rnd);
  // A full board is a win; it ends the game the same way.
  return { ...s, snake, dir, queue, score, best: Math.max(s.best, score), food, status: food < 0 ? "over" : "playing" };
}

/** Milliseconds per step: quicker as the snake grows, never faster than 60. */
export const speed = (s: StateSnake) => Math.max(60, 150 - s.score * 3);

/** A save from disk, checked; a game that was running comes back paused. */
export function restore(v: unknown): StateSnake | null {
  const s = v as Partial<StateSnake> | null;
  const cell = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < W * H;
  if (!s || !Array.isArray(s.snake) || !s.snake.length || !s.snake.every(cell) || !cell(s.food)) return null;
  if (!s.dir || !(s.dir in OPPOSITE) || !["ready", "playing", "paused", "over"].includes(String(s.status))) return null;
  return {
    snake: s.snake, dir: s.dir, queue: [], food: s.food!, score: Number(s.score) || 0, best: Number(s.best) || 0,
    status: s.status === "playing" ? "paused" : s.status!,
  };
}
