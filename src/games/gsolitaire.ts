// Klondike solitaire: the rules, as pure functions, so games.check.mjs can test them.
//
// A card is 0..51: suit = floor(card / 13) (0 spades, 1 hearts, 2 diamonds, 3 clubs), rank =
// card % 13 + 1 (1 ace .. 13 king). Seven tableau columns, each with its face-down cards first;
// four foundations built up by suit from the ace; a stock dealt to the waste one or three at a
// time, turned back over when it runs out.

export const suit = (c: number) => Math.floor(c / 13);
export const rank = (c: number) => (c % 13) + 1;
export const red = (c: number) => suit(c) === 1 || suit(c) === 2;

export interface StateSolitaire {
  stock: number[];
  waste: number[];
  foundations: number[][];
  tableau: number[][];
  /** Face-down cards at the bottom of each column. */
  down: number[];
  draw: 1 | 3;
  moves: number;
  status: "playing" | "won";
  elapsed: number;
  best: Partial<Record<"1" | "3", number>>;
}

export type Src = { pile: "waste" } | { pile: "tab"; col: number; index: number } | { pile: "found"; f: number };
export type Dst = { pile: "tab"; col: number } | { pile: "found"; f: number };

/** A shuffled deck. `rnd` is injectable for the checks. */
export function shuffle(rnd: () => number = Math.random): number[] {
  const d = Array.from({ length: 52 }, (_, i) => i);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

export function deal(draw: 1 | 3 = 1, best: StateSolitaire["best"] = {}, rnd: () => number = Math.random): StateSolitaire {
  const deck = shuffle(rnd);
  const tableau: number[][] = [];
  for (let c = 0; c < 7; c++) tableau.push(deck.splice(0, c + 1));
  return { stock: deck, waste: [], foundations: [[], [], [], []], tableau, down: [0, 1, 2, 3, 4, 5, 6], draw, moves: 0, status: "playing", elapsed: 0, best };
}

/** Turn cards from the stock to the waste, or the waste back over when the stock is empty. */
export function drawCards(s: StateSolitaire): StateSolitaire {
  if (s.status !== "playing") return s;
  if (!s.stock.length) {
    if (!s.waste.length) return s;
    return { ...s, stock: [...s.waste].reverse(), waste: [], moves: s.moves + 1 };
  }
  const n = Math.min(s.draw, s.stock.length);
  const taken = s.stock.slice(-n).reverse();
  return { ...s, stock: s.stock.slice(0, -n), waste: [...s.waste, ...taken], moves: s.moves + 1 };
}

/** Whether `card` may go on a column whose top card is `onto` (undefined for an empty column). */
export const canStack = (card: number, onto: number | undefined) =>
  onto === undefined ? rank(card) === 13 : red(card) !== red(onto) && rank(card) === rank(onto) - 1;
/** Whether `card` may go on a foundation. */
export const canFound = (card: number, pile: number[]) =>
  pile.length ? suit(card) === suit(pile[pile.length - 1]) && rank(card) === rank(pile[pile.length - 1]) + 1 : rank(card) === 1;

/** The cards a source would move (a run, for a tableau source), or null if it moves nothing. */
export function picked(s: StateSolitaire, src: Src): number[] | null {
  if (src.pile === "waste") return s.waste.length ? [s.waste[s.waste.length - 1]] : null;
  if (src.pile === "found") { const p = s.foundations[src.f]; return p.length ? [p[p.length - 1]] : null; }
  const col = s.tableau[src.col];
  if (src.index < s.down[src.col] || src.index >= col.length) return null; // face down, or nothing
  return col.slice(src.index);
}

const finish = (s: StateSolitaire): StateSolitaire => {
  if (!s.foundations.every((f) => f.length === 13)) return s;
  const key = String(s.draw) as "1" | "3";
  const prev = s.best[key];
  return { ...s, status: "won", best: { ...s.best, [key]: prev === undefined ? s.elapsed : Math.min(prev, s.elapsed) } };
};

/** Move from a source to a destination if the rules allow; the same state otherwise. */
export function move(s: StateSolitaire, src: Src, dst: Dst): StateSolitaire {
  if (s.status !== "playing") return s;
  const cards = picked(s, src);
  if (!cards) return s;
  if (dst.pile === "found") {
    if (cards.length !== 1 || !canFound(cards[0], s.foundations[dst.f]) || (src.pile === "found" && src.f === dst.f)) return s;
  } else {
    if (src.pile === "tab" && src.col === dst.col) return s;
    const col = s.tableau[dst.col];
    if (!canStack(cards[0], col[col.length - 1])) return s;
  }
  const next: StateSolitaire = {
    ...s, waste: [...s.waste], foundations: s.foundations.map((f) => [...f]), tableau: s.tableau.map((c) => [...c]), down: [...s.down], moves: s.moves + 1,
  };
  if (src.pile === "waste") next.waste.pop();
  else if (src.pile === "found") next.foundations[src.f].pop();
  else {
    next.tableau[src.col].splice(src.index);
    // The card under a moved run turns face up.
    if (next.down[src.col] >= next.tableau[src.col].length) next.down[src.col] = Math.max(0, next.tableau[src.col].length - 1);
  }
  if (dst.pile === "found") next.foundations[dst.f].push(cards[0]);
  else next.tableau[dst.col].push(...cards);
  return finish(next);
}

/** Where a double-click sends a card: a foundation first, then the first column that takes it. */
export function autoMove(s: StateSolitaire, src: Src): StateSolitaire {
  const cards = picked(s, src);
  if (!cards) return s;
  if (cards.length === 1 && src.pile !== "found") for (let f = 0; f < 4; f++) {
    const n = move(s, src, { pile: "found", f });
    if (n !== s) return n;
  }
  for (let c = 0; c < 7; c++) {
    // Moving a king that is already at the bottom of a column to another empty one gains nothing.
    if (src.pile === "tab" && src.index === 0 && !s.tableau[c].length) continue;
    const n = move(s, src, { pile: "tab", col: c });
    if (n !== s) return n;
  }
  return s;
}

/** Every card face up and the stock and waste empty: the rest can be played out to the end. */
export const canFinish = (s: StateSolitaire) =>
  s.status === "playing" && !s.stock.length && !s.waste.length && s.down.every((d) => d === 0);

/** Play every remaining card to the foundations (only when canFinish). */
export function finishAll(s: StateSolitaire): StateSolitaire {
  let st = s;
  for (let guard = 0; guard < 52 && st.status === "playing"; guard++) {
    let moved = false;
    for (let c = 0; c < 7 && !moved; c++) {
      const col = st.tableau[c];
      if (!col.length) continue;
      const n = autoFound(st, { pile: "tab", col: c, index: col.length - 1 });
      if (n !== st) { st = n; moved = true; }
    }
    if (!moved) break;
  }
  return st;
}
function autoFound(s: StateSolitaire, src: Src): StateSolitaire {
  for (let f = 0; f < 4; f++) { const n = move(s, src, { pile: "found", f }); if (n !== s) return n; }
  return s;
}

/** A save from disk, checked: all 52 cards exactly once, or a new deal. */
export function restore(v: unknown): StateSolitaire | null {
  const s = v as Partial<StateSolitaire> | null;
  const list = (a: unknown) => Array.isArray(a) && a.every((c) => Number.isInteger(c) && c >= 0 && c < 52);
  if (!s || !list(s.stock) || !list(s.waste) || !Array.isArray(s.foundations) || s.foundations.length !== 4 || !s.foundations.every(list)) return null;
  if (!Array.isArray(s.tableau) || s.tableau.length !== 7 || !s.tableau.every(list) || !Array.isArray(s.down) || s.down.length !== 7) return null;
  const all = [...s.stock!, ...s.waste!, ...s.foundations!.flat(), ...s.tableau!.flat()];
  if (all.length !== 52 || new Set(all).size !== 52) return null;
  return {
    stock: s.stock!, waste: s.waste!, foundations: s.foundations!, tableau: s.tableau!,
    down: s.down!.map((d, i) => Math.max(0, Math.min(Number(d) || 0, Math.max(0, s.tableau![i].length - 1)))),
    draw: s.draw === 3 ? 3 : 1, moves: Number(s.moves) || 0, status: s.status === "won" ? "won" : "playing",
    elapsed: Number(s.elapsed) || 0, best: s.best && typeof s.best === "object" ? s.best : {},
  };
}
