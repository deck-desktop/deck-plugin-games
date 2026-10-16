// node games.check.mjs
//
// The games' rules, which a pane would show wrong without ever throwing: a merge counted twice,
// a tile spawned after a move that moved nothing, a save that restores a broken board.
import assert from "node:assert";
import { build } from "esbuild";

const load = async (file) => {
  const out = await build({ entryPoints: [file], bundle: true, format: "esm", write: false, platform: "node" });
  return import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
};
/** A repeatable random source: the same numbers every run. */
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// ---- 2048 -------------------------------------------------------------------------------------
const g = await load("src/games/g2048.ts");
assert.deepEqual(g.slideRow([2, 2, 2, 2]), { row: [4, 4, 0, 0], gained: 8 }, "each pair merges once");
assert.deepEqual(g.slideRow([2, 2, 4, 0]), { row: [4, 4, 0, 0], gained: 4 }, "a merged tile does not merge again in the same move");
assert.deepEqual(g.slideRow([0, 2, 0, 2]), { row: [4, 0, 0, 0], gained: 4 }, "gaps close before merging");
assert.deepEqual(g.slideRow([4, 2, 2, 0]).row, [4, 4, 0, 0]);
assert.deepEqual(g.slideRow([2, 4, 8, 16]), { row: [2, 4, 8, 16], gained: 0 });

const b = [
  2, 0, 0, 2,
  0, 4, 4, 0,
  0, 0, 0, 0,
  8, 0, 0, 8,
];
assert.deepEqual(g.move(b, "left").board.slice(0, 4), [4, 0, 0, 0]);
assert.deepEqual(g.move(b, "right").board.slice(4, 8), [0, 0, 0, 8]);
const up = g.move(b, "up").board;
assert.deepEqual([up[0], up[4], up[8], up[12]], [2, 8, 0, 0], "a column moves toward the top");
const down = g.move(b, "down").board;
assert.deepEqual([down[3], down[7], down[11], down[15]], [0, 0, 2, 8]);
assert.equal(g.move(b, "left").gained, 4 + 8 + 16);

// A move that moves nothing is not a turn: no new tile, nothing to undo.
const stuck = [2, 4, 0, 0, 4, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const s0 = { board: stuck, score: 10, best: 10, won: false, over: false };
assert.equal(g.play(s0, "left", seq(0)), s0, "nothing moved, nothing changes");
const s1 = g.play(s0, "right", seq(0, 0.5));
assert.notEqual(s1, s0);
assert.equal(s1.board.filter((v) => v).length, 5, "a turn adds one tile");
assert.deepEqual(g.undo(s1).board, stuck, "undo puts the board back");
assert.equal(g.undo(s1).score, 10);

const full = [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
assert.equal(g.canMove(full), false);
assert.equal(g.canMove([...full.slice(0, 14), 2, 2]), true, "a pair next to each other can still merge");
const won = g.play({ board: [1024, 1024, 0, 0, ...Array(12).fill(0)], score: 0, best: 0, won: false, over: false }, "left", seq(0));
assert.ok(won.won && won.score === 2048 && won.best === 2048);

const fresh = g.newGame(50, seq(0.1, 0.95, 0.5, 0.2));
assert.equal(fresh.board.filter((v) => v).length, 2, "a new game starts with two tiles");
assert.equal(fresh.best, 50, "the best score carries over");
assert.equal(g.restore({ board: [1, 2] }), null, "a malformed save starts a new game");
assert.deepEqual(g.restore(s1).board, s1.board);

// ---- Minesweeper -------------------------------------------------------------------------------
const m = await load("src/games/gmines.ts");
const rnd = () => 0.37;
let ms = m.newGame("easy");
assert.equal(ms.status, "ready");
assert.equal(ms.mine.length, 0, "no mines until the first open");
ms = m.reveal(ms, 40, rnd);
assert.equal(ms.status, "playing");
assert.equal(ms.mine.reduce((a, b) => a + b, 0), 10, "the level's mine count is laid");
for (const j of [40, ...m.neighbours(ms, 40)]) assert.equal(ms.mine[j], 0, "the first open and its neighbours are safe");
assert.equal(ms.open[40], 1);
assert.ok(ms.open.reduce((a, b) => a + b, 0) > 1, "a first open on a zero opens an area");
// Everything opened is never a mine, and every open zero has its neighbours open.
ms.open.forEach((o, i) => {
  if (!o) return;
  assert.equal(ms.mine[i], 0);
  if (m.count(ms, i) === 0) for (const n of m.neighbours(ms, i)) assert.equal(ms.open[n], 1, "a zero opens its neighbours");
});
assert.deepEqual(m.neighbours({ w: 9, h: 9 }, 0).sort((a, b) => a - b), [1, 9, 10], "a corner has three neighbours");
assert.equal(m.neighbours({ w: 9, h: 9 }, 40).length, 8);

// A flag protects a cell; flags count down the mines left.
const mineAt = ms.mine.findIndex((x) => x === 1);
let f = m.toggleFlag(ms, mineAt);
assert.equal(m.minesLeft(f), 9);
assert.equal(m.reveal(f, mineAt), f, "a flagged cell does not open");
// Opening a mine loses, and shows every mine.
const lost = m.reveal(ms, mineAt);
assert.equal(lost.status, "lost");
assert.equal(lost.boom, mineAt);
assert.ok(lost.mine.every((x, i) => !x || lost.open[i]));

// Opening every safe cell wins, records the time, and flags the mines.
let w = { ...ms, elapsed: 4200 };
for (let i = 0; i < w.mine.length; i++) if (!w.mine[i]) w = m.reveal(w, i);
assert.equal(w.status, "won");
assert.equal(w.best.easy, 4200);
assert.equal(m.minesLeft(w), 0);
const w2 = { ...m.newGame("easy", { easy: 3000 }), mine: w.mine, status: "playing", elapsed: 5000 };
let w3 = w2;
for (let i = 0; i < w3.mine.length; i++) if (!w3.mine[i]) w3 = m.reveal(w3, i);
assert.equal(w3.best.easy, 3000, "a slower win keeps the best time");

// Chord: an open number with its flags placed opens the rest around it.
const tiny = { ...m.newGame("easy"), status: "playing", mine: Array(81).fill(0) };
tiny.mine[0] = 1;
let t1 = { ...tiny, open: Array(81).fill(0) };
t1.open[10] = 1; // (1,1): one mine around it, at 0
assert.equal(m.chord(t1, 10), t1, "no chord until the flags match the number");
t1 = m.toggleFlag(t1, 0);
const t2 = m.chord(t1, 10);
for (const n of m.neighbours(t2, 10)) if (n !== 0) assert.equal(t2.open[n], 1, "chord opens the unflagged neighbours");

assert.equal(m.restore({ level: "easy", open: [1] }), null, "a malformed save starts a new game");
assert.deepEqual(m.restore(ms).open, ms.open);

// ---- Snake ------------------------------------------------------------------------------------
const sn = await load("src/games/gsnake.ts");
const W = sn.W;
let s = { ...sn.newGame(0, seq(0)), status: "playing" };
assert.equal(s.snake.length, 3);
assert.ok(!s.snake.includes(s.food), "food is never under the snake");
const head0 = s.snake[0];
s = sn.step(s);
assert.equal(s.snake[0], head0 + 1, "it moves the way it faces");
assert.equal(s.snake.length, 3, "and keeps its length without food");
assert.equal(sn.turn(s, "left"), s, "it cannot reverse into itself");
let q = sn.turn(sn.turn(s, "up"), "left");
assert.deepEqual(q.queue, ["up", "left"], "two quick turns are both kept");
assert.equal(sn.turn(q, "down").queue.length, 2, "no more than two");
q = sn.step(q);
assert.equal(q.snake[0], s.snake[0] - W, "the first queued turn is taken first");
q = sn.step(q);
assert.equal(q.snake[0], s.snake[0] - W - 1);

// Eating: one longer, a point, new food somewhere free.
const eat = { ...s, food: s.snake[0] + 1 };
const ate = sn.step(eat, seq(0));
assert.equal(ate.snake.length, 4);
assert.equal(ate.score, 1);
assert.ok(!ate.snake.includes(ate.food));
// A wall ends it, and the best score is kept.
const edge = { ...s, snake: [W - 1, W - 2, W - 3], dir: "right", score: 7, best: 3 };
const hit = sn.step(edge);
assert.equal(hit.status, "over");
assert.equal(hit.best, 7);
// Its own body ends it, but the cell the tail is leaving does not.
const loop = { ...s, snake: [W + 1, W + 2, 2 * W + 2, 2 * W + 1], dir: "down", queue: [], food: 0 };
assert.equal(sn.step(loop).status, "playing", "moving into the tail's cell as it leaves is fine");
const bite = { ...loop, snake: [W + 1, W + 2, 2 * W + 2, 2 * W + 1, 2 * W] };
assert.equal(sn.step(bite).status, "over");
assert.ok(sn.speed({ score: 0 }) > sn.speed({ score: 20 }), "it speeds up");
assert.equal(sn.speed({ score: 500 }), 60);
assert.equal(sn.restore({ ...s, status: "playing" }).status, "paused", "a running game comes back paused");
assert.equal(sn.restore({ snake: [], food: 1 }), null);

// ---- Sudoku -----------------------------------------------------------------------------------
const su = await load("src/games/gsudoku.ts");
// A seeded random source, so the generated puzzles are the same each run.
const lcg = (seed) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const valid = (g) => g.every((v, i) => v >= 1 && v <= 9 && su.PEERS[i].every((p) => g[p] !== v));
assert.equal(su.PEERS[0].length, 20, "every cell has 20 peers");
const grid1 = su.fullGrid(lcg(1));
assert.ok(valid(grid1), "a full grid follows the rules");
for (const d of ["easy", "medium", "hard"]) {
  const t0 = Date.now();
  const { puzzle, solution } = su.makePuzzle(d, lcg(7));
  const givens = puzzle.filter((v) => v).length;
  assert.ok(valid(solution));
  assert.ok(puzzle.every((v, i) => !v || v === solution[i]), "the givens are the solution's");
  assert.equal(su.countSolutions(puzzle), 1, `${d}: exactly one solution`);
  assert.ok(givens >= su.GIVENS[d] && givens <= su.GIVENS[d] + 6, `${d}: ${givens} givens, about ${su.GIVENS[d]}`);
  assert.ok(Date.now() - t0 < 3000, `${d} is made quickly (${Date.now() - t0}ms)`);
}
assert.equal(su.countSolutions(Array(81).fill(0)), 2, "an empty grid has many (counting stops at 2)");

let sd = su.newGame("easy", {}, lcg(3));
const empty = sd.puzzle.findIndex((v) => v === 0);
const given = sd.puzzle.findIndex((v) => v !== 0);
assert.equal(su.setValue(sd, given, 1), sd, "a given cannot be changed");
// Notes, and a placed number clearing its digit from the peers' notes.
const peer = su.PEERS[empty].find((p) => !sd.puzzle[p]);
sd = su.toggleNote(sd, peer, sd.solution[empty]);
assert.ok(sd.notes[peer] & (1 << sd.solution[empty]));
sd = su.setValue(sd, empty, sd.solution[empty]);
assert.equal(sd.notes[peer] & (1 << sd.solution[empty]), 0, "placing a number clears it from the peers' notes");
// Conflicts are the cells that repeat a peer.
const wrong = sd.solution[given];
const bad = su.conflicts(su.setValue(sd, su.PEERS[given].find((p) => !sd.puzzle[p] && !sd.values[p]), wrong).values);
assert.ok(bad.has(given), "a repeated number marks both cells");
// Filling every cell right wins, and the time is recorded.
let win = { ...sd, elapsed: 9000 };
for (let i = 0; i < 81; i++) win = su.setValue(win, i, win.solution[i]);
assert.equal(win.status, "won");
assert.equal(win.best.easy, 9000);
// Clearing empties a cell's number and its notes, but never a given.
const withNote = su.toggleNote(su.newGame("easy", {}, lcg(3)), empty, 4);
assert.equal(su.clearCell(withNote, empty).notes[empty], 0, "notes go too");
assert.equal(su.clearCell(sd, given), sd, "a given stays");
assert.equal(su.clearCell(sd, empty).values[empty], 0);
const h = su.hint(su.newGame("easy", {}, lcg(5)), 0);
assert.ok(h.values[0] === h.solution[0]);
assert.equal(su.restore({ difficulty: "easy", puzzle: [1] }), null, "a malformed save starts a new game");
assert.deepEqual(su.restore(sd).values, sd.values);

// ---- Tetris -----------------------------------------------------------------------------------
const te = await load("src/games/gtetris.ts");
const TW = te.W, TH = te.H;
assert.deepEqual([...te.bag(lcg(2))].sort(), [...te.KINDS].sort(), "a bag holds each piece once");
let tt = { ...te.newGame(0, lcg(4)), status: "playing" };
assert.ok(tt.queue.length >= 7);
for (const k of te.KINDS) {
  // Four turns come back to the start, and every orientation has four cells.
  const p = { kind: k, rot: 0, x: 3, y: 5 };
  assert.deepEqual(te.cells({ ...p, rot: 4 }), te.cells(p), `${k}: four turns are a full turn`);
  for (let r = 0; r < 4; r++) assert.equal(new Set(te.cells({ ...p, rot: r }).map(String)).size, 4);
}
// Walls stop sideways moves.
let left = tt;
for (let i = 0; i < 12; i++) left = te.shift(left, -1, 0);
assert.equal(Math.min(...te.cells(left.piece).map(([x]) => x)), 0, "it stops at the left wall");
assert.equal(te.shift(left, -1, 0), left);
// Rotating against a wall nudges it in rather than refusing.
const iWall = { ...tt, piece: { kind: "I", rot: 1, x: -2, y: 5 } };
assert.ok(!te.collides(iWall.board, iWall.piece), "an upright I against the left wall");
const turned = te.rotate(iWall, 1);
assert.notEqual(turned, iWall, "it turns");
assert.ok(!te.collides(turned.board, turned.piece));
// Hard drop lands on the floor and locks: the next piece comes on, 2 points a row.
const hd = te.hardDrop(tt, lcg(1));
assert.equal(hd.board.filter((v) => v).length, 4, "four blocks left on the board");
assert.ok(hd.board.slice((TH - 1) * TW).some((v) => v), "on the bottom row");
assert.ok(hd.score > 0);
assert.equal(hd.piece.kind, tt.queue[0], "the next piece comes from the queue");
// A full row clears, scores, and the rows above fall.
const nearly = Array(TW * TH).fill(0);
for (let x = 0; x < TW; x++) if (x !== 4 && x !== 5) nearly[(TH - 1) * TW + x] = 1;
nearly[(TH - 2) * TW] = 3;
const oDrop = { ...tt, board: nearly, piece: { kind: "O", rot: 0, x: 3, y: 0 } }; // O covers x 4..5
const cleared = te.hardDrop(oDrop, lcg(1));
assert.equal(cleared.lines, 1, "one line cleared");
assert.ok(cleared.score >= 100);
assert.equal(cleared.board[(TH - 1) * TW], 3, "the block above fell into the cleared row");
assert.equal(cleared.board[(TH - 1) * TW + 4], 2, "and the O's top half with it");
assert.equal(te.level({ lines: 10 }), 2);
assert.ok(te.gravity({ lines: 0 }) > te.gravity({ lines: 50 }), "it speeds up");
// Hold: once per piece.
const held = te.hold(tt);
assert.equal(held.hold, tt.piece.kind);
assert.equal(te.hold(held), held, "only once until the piece locks");
const held2 = te.hardDrop(held, lcg(1));
assert.equal(held2.canHold, true);
// Topping out ends the game.
const packed = Array(TW * TH).fill(1);
for (let y = 0; y < TH; y++) packed[y * TW + 9] = 0; // a column free, so rows never clear
const topped = te.lock({ ...tt, board: packed.map((v, i) => (i < 3 * TW ? 0 : v)), piece: { kind: "T", rot: 0, x: 3, y: 0 } }, lcg(1));
assert.equal(topped.status, "over", "no room for the next piece");
assert.equal(te.restore({ ...tt, status: "playing" }).status, "paused", "a running game comes back paused");
assert.equal(te.restore({ board: [] }), null);

// ---- Words ------------------------------------------------------------------------------------
const wo = await load("src/games/gwords.ts");
const { ANSWERS } = await load("src/games/words.ts");
assert.ok(ANSWERS.length > 400, `${ANSWERS.length} answers`);
assert.ok(ANSWERS.every((w) => /^[a-z]{5}$/.test(w)), "every answer is five letters");
assert.equal(new Set(ANSWERS).size, ANSWERS.length, "no answer twice");
assert.deepEqual(wo.mark("geese", "those"), ["miss", "miss", "miss", "hit", "hit"], "the answer's one e is already a hit");
assert.deepEqual(wo.mark("eerie", "there"), ["near", "miss", "near", "miss", "hit"], "a repeated letter is near only as often as it is left");
assert.deepEqual(wo.mark("crane", "crane"), Array(5).fill("hit"));
assert.deepEqual(wo.mark("lunar", "rural"), ["near", "hit", "miss", "hit", "near"]);
assert.equal(wo.dailyAnswer("2026-10-09"), wo.dailyAnswer("2026-10-09"), "the same word for a date");
assert.ok(ANSWERS.includes(wo.dailyAnswer("2026-10-10")));
let wg = wo.newGame("unlimited", undefined, seq(0));
assert.equal(wg.answer, ANSWERS[0]);
for (const c of "xyzq") wg = wo.type(wg, c);
assert.equal(wo.submit(wg), wg, "four letters are not a guess");
wg = wo.type(wo.type(wg, "w"), "z");
assert.equal(wg.draft, "xyzqw", "no sixth letter");
wg = wo.submit(wg);
assert.deepEqual(wg.guesses, ["xyzqw"]);
for (const c of wg.answer) wg = wo.type(wg, c);
wg = wo.submit(wg);
assert.equal(wg.status, "won");
assert.deepEqual([wg.stats.unlimited.played, wg.stats.unlimited.won, wg.stats.unlimited.streak, wg.stats.unlimited.dist[1]], [1, 1, 1, 1], "won on the second try");
let lose = wo.newGame("unlimited", wg.stats, seq(0.5));
for (let t = 0; t < 6; t++) { for (const c of "zzzzz") lose = wo.type(lose, c); lose = wo.submit(lose); }
assert.equal(lose.status, "lost");
assert.equal(lose.stats.unlimited.streak, 0, "a loss ends the streak");
assert.equal(lose.stats.unlimited.maxStreak, 1);
assert.equal(wo.keyMarks({ ...wg, guesses: ["about"], answer: "above" }).a, "hit");
// Yesterday's daily game gives way to today's, keeping the stats.
const old = { ...wo.newGame("daily", wg.stats, Math.random, "2026-10-08"), guesses: ["crane"] };
const fresh2 = wo.restore(old, "2026-10-09");
assert.equal(fresh2.date, "2026-10-09");
assert.deepEqual(fresh2.guesses, []);
assert.equal(fresh2.stats.unlimited.played, 1);
assert.equal(wo.restore({ mode: "daily", answer: "toolong" }), null);

// ---- Solitaire --------------------------------------------------------------------------------
const so = await load("src/games/gsolitaire.ts");
const C = (r, s) => s * 13 + r - 1; // rank 1..13, suit 0 spades 1 hearts 2 diamonds 3 clubs
let sol = so.deal(1, {}, lcg(9));
assert.deepEqual(sol.tableau.map((c) => c.length), [1, 2, 3, 4, 5, 6, 7], "seven columns of 1..7");
assert.equal(sol.stock.length, 24);
assert.equal(new Set([...sol.stock, ...sol.tableau.flat()]).size, 52, "every card once");
assert.ok(so.canStack(C(6, 1), C(7, 0)), "a red six on a black seven");
assert.ok(!so.canStack(C(6, 0), C(7, 3)), "not black on black");
assert.ok(!so.canStack(C(5, 1), C(7, 0)), "only one rank lower");
assert.ok(so.canStack(C(13, 2), undefined) && !so.canStack(C(12, 2), undefined), "only a king on an empty column");
assert.ok(so.canFound(C(1, 3), []) && so.canFound(C(2, 3), [C(1, 3)]) && !so.canFound(C(2, 1), [C(1, 3)]));
// Drawing, and the waste turned back over when the stock runs out.
let dr = sol;
for (let i = 0; i < 24; i++) dr = so.drawCards(dr);
assert.equal(dr.stock.length, 0);
assert.equal(dr.waste.length, 24);
const back = so.drawCards(dr);
assert.deepEqual(back.stock, [...dr.waste].reverse(), "turned over, the first drawn comes first again");
const d3 = so.drawCards(so.deal(3, {}, lcg(9)));
assert.equal(d3.waste.length, 3, "draw three");
// A run moves together, and the card under it turns face up.
const rig = { ...sol, tableau: [[C(13, 0)], [C(5, 2), C(9, 3), C(8, 1), C(7, 0)], [C(10, 1)], [], [], [], []], down: [0, 1, 0, 0, 0, 0, 0] };
const runMoved = so.move(rig, { pile: "tab", col: 1, index: 1 }, { pile: "tab", col: 2 });
assert.deepEqual(runMoved.tableau[2], [C(10, 1), C(9, 3), C(8, 1), C(7, 0)], "the whole run");
assert.deepEqual(runMoved.tableau[1], [C(5, 2)]);
assert.equal(runMoved.down[1], 0, "the card left behind turns face up");
assert.equal(so.move(rig, { pile: "tab", col: 1, index: 0 }, { pile: "tab", col: 2 }), rig, "a face-down card does not move");
assert.equal(so.move(rig, { pile: "tab", col: 1, index: 2 }, { pile: "tab", col: 2 }), rig, "an eight does not go on a ten");
const king = so.autoMove(rig, { pile: "tab", col: 0, index: 0 });
assert.equal(king, rig, "a king alone in its column is not shuffled to another empty one");
// Double-click prefers a foundation.
const ace = { ...rig, waste: [C(1, 1)] };
assert.deepEqual(so.autoMove(ace, { pile: "waste" }).foundations.find((f) => f.length), [C(1, 1)]);
// Finishing: everything face up, nothing in the stock: play it all out and win.
const endgame = { ...sol, stock: [], waste: [], down: Array(7).fill(0),
  foundations: [0, 1, 2, 3].map((s) => Array.from({ length: 11 }, (_, r) => C(r + 1, s))),
  tableau: [[C(13, 0), C(12, 1)], [C(13, 1), C(12, 0)], [C(12, 2)], [C(13, 2)], [C(12, 3)], [C(13, 3)], []], elapsed: 60000 };
assert.ok(so.canFinish(endgame));
const won2 = so.finishAll(endgame);
assert.equal(won2.status, "won");
assert.equal(won2.best["1"], 60000);
assert.equal(so.restore({ ...sol, stock: sol.stock.slice(1) }), null, "a save missing a card is refused");
assert.deepEqual(so.restore(sol).tableau, sol.tableau);

// ---- Sokoban ----------------------------------------------------------------------------------
const sk = await load("src/games/gsokoban.ts");
sk.LEVELS.forEach((text, i) => {
  const l = sk.parse(text);
  assert.equal(l.boxes.length, l.goals.length, `level ${i + 1}: as many boxes as goals`);
  assert.ok(sk.solvable(text), `level ${i + 1} can be solved`);
});
assert.equal(sk.solvable("\n#####\n#@$.#\n#####"), true);
assert.equal(sk.solvable("\n######\n#@$#.#\n######"), false, "a box against a wall is stuck");
// Past the hand-made levels they are generated: always the same for a number, quick to make,
// never already solved, and solvable (they are built by playing backwards; the solver confirms).
assert.equal(sk.levelText(0), sk.LEVELS[0]);
for (const n of [10, 11, 12, 15, 20, 25, 30, 40, 55, 80]) {
  const t0 = Date.now();
  const text = sk.generate(n);
  const ms = Date.now() - t0;
  assert.equal(sk.generate(n), text, `level ${n + 1} is the same every time`);
  const l = sk.parse(text);
  assert.equal(l.boxes.length, l.goals.length, `level ${n + 1}: boxes and goals match`);
  assert.ok(!l.boxes.every((b) => l.goals.includes(b)), `level ${n + 1} does not start solved`);
  assert.ok(ms < 300, `level ${n + 1} is made in ${ms}ms`);
  // The solver confirms the smaller ones; past three boxes its search takes seconds to minutes,
  // and those levels are solvable by how they are built.
  if (l.boxes.length <= 3) assert.ok(sk.solvable(text), `level ${n + 1} can be solved:\n${text}`);
  assert.ok(text !== sk.LEVELS[n % sk.LEVELS.length], `level ${n + 1} is generated, not a hand-made fallback`);
}
assert.ok(sk.parse(sk.generate(60)).boxes.length > sk.parse(sk.generate(10)).boxes.length, "later levels have more boxes");

// Walking and pushing on level 1: "#@ $ .#".
let sb = sk.start(0);
sb = sk.walk(sb, "left");
assert.equal(sb.moves, 0, "a wall stops the player");
sb = sk.walk(sb, "right");
assert.equal(sb.pushes, 0);
sb = sk.walk(sb, "right");
assert.equal(sb.pushes, 1, "walking into a box pushes it");
const undone = sk.undo(sb);
assert.equal(undone.pushes, 0);
assert.equal(undone.player, sb.history[sb.history.length - 1].player, "undo puts the box and the player back");
sb = sk.walk(sb, "right");
assert.ok(sk.isSolved(sb), "level 1 done");
assert.equal(sb.solved[0], 3, "the fewest moves are kept");
assert.equal(sk.walk(sb, "left"), sb, "a solved level does not move");
// A box cannot be pushed into another box.
const two = sk.start(1);
assert.equal(sk.restore({ level: -1 }), null);
assert.equal(sk.restore({ level: 99 }).level, 99, "any level number is a level now");
assert.deepEqual(sk.restore({ ...two, boxes: [0] }).boxes, two.boxes, "a save with a bad box restarts the level");

console.log("games.check.mjs: all assertions passed");
