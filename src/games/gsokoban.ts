// Sokoban: push every box onto a goal. The rules as pure functions, and the levels, written for
// this plugin; games.check.mjs runs a solver over every level, so one that cannot be solved fails
// the check rather than reaching a player.
//
// Levels use the usual text form: # wall, space floor, . goal, $ box, * box on a goal, @ the
// player, + the player on a goal. Lines may be ragged; outside the walls is just more nothing.

export const LEVELS: string[] = [
  `
#######
#@ $ .#
#######`,
  `
######
#.   #
# $$ #
# @ .#
######`,
  `
  ####
###  #
#. $ #
# #@ #
#  $.#
######`,
  `
#######
# .   #
# #$# #
#  @  #
# $ . #
#######`,
  `
 ######
 #    #
##$## #
# @ $ #
# .  .#
#######`,
  `
########
#  @   #
# $ ## #
# .  $ #
## #  .#
 #     #
 #######`,
  `
#######
#  .  #
# $$$ #
#. @ .#
#     #
#######`,
  `
########
#      #
# #$## #
# . $. #
## @ ###
 #####`,
  `
#########
#   #   #
# $ . $ #
#  #@#  #
# . $ . #
#   #   #
#########`,
  `
 ######
##    #
#  ## #
# $$  #
#. .# #
##@   #
 ######`,
];

/** A repeatable random source from a seed (mulberry32), so a level number is always the same level. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const generated = new Map<number, string>();

/** Level n's text: one of the hand-made ones, then generated ones for ever. */
export function levelText(n: number): string {
  if (n < LEVELS.length) return LEVELS[n];
  let t = generated.get(n);
  if (!t) { t = generate(n); generated.set(n, t); }
  return t;
}

/**
 * Make level n (past the hand-made ones). It starts solved, every box on its goal, and plays the
 * game backwards: the player wanders and pulls boxes along behind. A pull is a push run in
 * reverse, so pushing them all back is always possible: every generated level can be solved.
 * Of a few tries, the one whose boxes ended furthest from their goals is kept. Bigger rooms and
 * more boxes as n grows.
 */
export function generate(n: number): string {
  const rnd = seeded(n * 2654435761 + 97);
  const k = n - LEVELS.length;
  const boxes = Math.min(5, 2 + Math.floor(k / 8));
  const w = Math.min(13, 8 + Math.floor(k / 12) + Math.floor(rnd() * 2));
  const h = Math.min(11, 7 + Math.floor(k / 15) + Math.floor(rnd() * 2));
  let best: { text: string; score: number } | null = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const made = attemptLevel(w, h, boxes, rnd);
    if (made && (!best || made.score > best.score)) best = made;
  }
  return best ? best.text : LEVELS[n % LEVELS.length];
}

function attemptLevel(w: number, h: number, nBoxes: number, rnd: () => number): { text: string; score: number } | null {
  const size = { w, h };
  const wall = Array.from({ length: w * h }, (_, i) => {
    const x = i % w, y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 || rnd() < 0.16;
  });
  // Keep the largest open area; the rest becomes wall.
  const area = (from: number, block: (i: number) => boolean) => {
    const seen = new Set([from]), stack = [from];
    while (stack.length) {
      const c = stack.pop()!;
      for (const d of DIRS) { const nb = stepFrom(size, c, d); if (nb >= 0 && !block(nb) && !seen.has(nb)) { seen.add(nb); stack.push(nb); } }
    }
    return seen;
  };
  let biggest = new Set<number>();
  const visited = new Set<number>();
  for (let i = 0; i < w * h; i++) {
    if (wall[i] || visited.has(i)) continue;
    const a = area(i, (j) => wall[j]);
    a.forEach((j) => visited.add(j));
    if (a.size > biggest.size) biggest = a;
  }
  if (biggest.size < 10 + nBoxes * 3) return null;
  for (let i = 0; i < w * h; i++) if (!biggest.has(i)) wall[i] = true;
  const floor = [...biggest];
  const pick = () => floor[Math.floor(rnd() * floor.length)];
  const goals: number[] = [];
  while (goals.length < nBoxes) { const g = pick(); if (!goals.includes(g)) goals.push(g); }
  const boxes = [...goals];
  let player = pick();
  for (let tries = 0; boxes.includes(player) && tries < 50; tries++) player = pick();
  if (boxes.includes(player)) return null;
  // Play backwards: walk, and when walking away from a box right behind, sometimes pull it along.
  const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
  for (let step = 0; step < 120 + nBoxes * 60; step++) {
    const d = DIRS[Math.floor(rnd() * 4)];
    const to = stepFrom(size, player, d);
    if (to < 0 || wall[to] || boxes.includes(to)) continue;
    const behind = stepFrom(size, player, OPP[d]);
    const bi = behind >= 0 ? boxes.indexOf(behind) : -1;
    if (bi >= 0 && rnd() < 0.65) boxes[bi] = player;
    player = to;
  }
  if (boxes.every((b) => goals.includes(b))) return null;
  const dist = (a: number, b: number) => Math.abs((a % w) - (b % w)) + Math.abs(Math.floor(a / w) - Math.floor(b / w));
  const score = boxes.reduce((s, b, i) => s + dist(b, goals[i]), 0) + boxes.filter((b) => !goals.includes(b)).length * 2;
  if (score < nBoxes * 3) return null;
  // Walls nobody can reach from the player are trimmed to empty space for a cleaner outline.
  const reachable = area(player, (j) => wall[j]);
  const lines: string[] = [];
  for (let y = 0; y < h; y++) {
    let line = "";
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const nearFloor = DIRS.some((d) => { const nb = stepFrom(size, i, d); return nb >= 0 && reachable.has(nb); })
        || [[-1, -1], [1, -1], [-1, 1], [1, 1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < w && yy < h && reachable.has(yy * w + xx); });
      if (wall[i]) { line += nearFloor ? "#" : " "; continue; }
      const goal = goals.includes(i), box = boxes.includes(i);
      line += i === player ? (goal ? "+" : "@") : box ? (goal ? "*" : "$") : goal ? "." : " ";
    }
    lines.push(line.replace(/\s+$/, ""));
  }
  return { text: "\n" + lines.join("\n"), score };
}

export type Dir = "up" | "down" | "left" | "right";
const DIRS: Dir[] = ["up", "down", "left", "right"];
const DELTA: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export interface Level { w: number; h: number; walls: boolean[]; goals: number[]; boxes: number[]; player: number }

export function parse(text: string): Level {
  const lines = text.replace(/^\n+/, "").split("\n").map((l) => l.replace(/\s+$/, ""));
  const h = lines.length, w = Math.max(...lines.map((l) => l.length));
  const walls: boolean[] = [], goals: number[] = [], boxes: number[] = [];
  let player = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = lines[y][x] ?? " ", i = y * w + x;
    walls[i] = c === "#";
    if (c === "." || c === "*" || c === "+") goals.push(i);
    if (c === "$" || c === "*") boxes.push(i);
    if (c === "@" || c === "+") player = i;
  }
  return { w, h, walls, goals, boxes, player };
}

/** A move from `at` toward `d`, or -1 off the grid. */
function stepFrom(l: { w: number; h: number }, at: number, d: Dir): number {
  const [dx, dy] = DELTA[d];
  const x = (at % l.w) + dx, y = Math.floor(at / l.w) + dy;
  return x < 0 || y < 0 || x >= l.w || y >= l.h ? -1 : y * l.w + x;
}

export interface StateSokoban {
  level: number;
  player: number;
  boxes: number[];
  moves: number;
  pushes: number;
  /** Positions before each move, for undo. */
  history: { player: number; boxes: number[]; pushes: number }[];
  /** Levels finished, and the fewest moves each took. */
  solved: Record<number, number>;
}

export function start(level: number, solved: StateSokoban["solved"] = {}): StateSokoban {
  const l = parse(levelText(level));
  return { level, player: l.player, boxes: l.boxes, moves: 0, pushes: 0, history: [], solved };
}

export const isSolved = (s: StateSokoban) => {
  const goals = parse(levelText(s.level)).goals;
  return s.boxes.every((b) => goals.includes(b));
};

/** Walk one cell, pushing a box ahead if the cell beyond it is free. */
export function walk(s: StateSokoban, d: Dir): StateSokoban {
  if (isSolved(s)) return s;
  const l = parse(levelText(s.level));
  const to = stepFrom(l, s.player, d);
  if (to < 0 || l.walls[to]) return s;
  const bi = s.boxes.indexOf(to);
  let boxes = s.boxes, pushes = s.pushes;
  if (bi >= 0) {
    const beyond = stepFrom(l, to, d);
    if (beyond < 0 || l.walls[beyond] || s.boxes.includes(beyond)) return s;
    boxes = [...s.boxes];
    boxes[bi] = beyond;
    pushes++;
  }
  const next = {
    ...s, player: to, boxes, moves: s.moves + 1, pushes,
    history: [...s.history.slice(-999), { player: s.player, boxes: s.boxes, pushes: s.pushes }],
  };
  if (!isSolved(next)) return next;
  const prev = next.solved[s.level];
  return { ...next, solved: { ...next.solved, [s.level]: prev === undefined ? next.moves : Math.min(prev, next.moves) } };
}

export function undo(s: StateSokoban): StateSokoban {
  const last = s.history[s.history.length - 1];
  if (!last || isSolved(s)) return s;
  return { ...s, player: last.player, boxes: last.boxes, pushes: last.pushes, moves: s.moves + 1, history: s.history.slice(0, -1) };
}

/** Whether a level can be solved: a breadth-first search over box positions (for the checks). */
export function solvable(text: string, limit = 2_000_000): boolean {
  const l = parse(text);
  const goals = new Set(l.goals);
  const reach = (player: number, boxes: Set<number>) => {
    const seen = new Set([player]), stack = [player];
    while (stack.length) {
      const c = stack.pop()!;
      for (const d of Object.keys(DELTA) as Dir[]) {
        const n = stepFrom(l, c, d);
        if (n >= 0 && !l.walls[n] && !boxes.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); }
      }
    }
    return seen;
  };
  const key = (boxes: number[], area: Set<number>) => `${[...boxes].sort((a, b) => a - b).join(",")}|${Math.min(...area)}`;
  const queue: [number, number[]][] = [[l.player, l.boxes]];
  const seen = new Set<string>();
  for (let head = 0; head < queue.length && seen.size < limit; head++) {
    const [player, boxes] = queue[head];
    const set = new Set(boxes);
    const area = reach(player, set);
    const k = key(boxes, area);
    if (seen.has(k)) continue;
    seen.add(k);
    if (boxes.every((b) => goals.has(b))) return true;
    boxes.forEach((b, bi) => {
      for (const d of Object.keys(DELTA) as Dir[]) {
        const from = stepFrom(l, b, ({ up: "down", down: "up", left: "right", right: "left" } as const)[d]);
        const to = stepFrom(l, b, d);
        if (from < 0 || to < 0 || !area.has(from) || l.walls[to] || set.has(to)) continue;
        const nb = [...boxes];
        nb[bi] = to;
        queue.push([b, nb]);
      }
    });
  }
  return false;
}

/** A save from disk, checked: positions inside the level, or the level from its start. */
export function restore(v: unknown): StateSokoban | null {
  const s = v as Partial<StateSokoban> | null;
  if (!s || !Number.isInteger(s.level) || s.level! < 0) return null;
  const l = parse(levelText(s.level!));
  const cell = (n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < l.w * l.h && !l.walls[n as number];
  const solved = s.solved && typeof s.solved === "object" ? s.solved : {};
  if (!cell(s.player) || !Array.isArray(s.boxes) || s.boxes.length !== l.boxes.length || !s.boxes.every(cell)) return start(s.level!, solved);
  return {
    level: s.level!, player: s.player!, boxes: s.boxes, moves: Number(s.moves) || 0, pushes: Number(s.pushes) || 0,
    history: Array.isArray(s.history) ? s.history.filter((h) => h && cell(h.player) && Array.isArray(h.boxes)) : [], solved,
  };
}
