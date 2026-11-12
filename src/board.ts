// The boards' colours on Deck's light themes. Every board was drawn for a dark background; `on`
// keeps that colour on a dark theme and swaps in a light one on a light theme, through the --light
// variable Deck sets (100% on a light background, 0% on a dark one, absent on an older Deck,
// which is dark). Plain CSS, so a theme change repaints the boards without a re-render.
export const on = (dark: string, light: string) =>
  `color-mix(in srgb, ${dark} calc(100% - var(--light, 0%)), ${light})`;

/** A board's surface, its empty cells, and the lines of a grid drawn over it. */
export const BOARD = on("#1c1e26", "var(--bg-elev, #e9ecf0)");
export const CELL = on("#262934", "var(--bg-card, #ffffff)");
export const GRID_LINE = "rgb(var(--overlay-rgb, 255 255 255) / 0.05)";
/** A raised tile or wall, and the text on one. */
export const RAISED = on("#4b4f60", "#c9ced7");
export const INK = on("#e6e6ea", "#16181d");
/** Thick and thin rules (Sudoku's boxes and cells, the word grid's frames). */
export const RULE = on("#6b7088", "#8a90a0");
export const RULE_THIN = on("#34374a", "#d5d9e0");
/** Red for a wrong entry or a mine: the pale one reads on dark, a deeper one on light. */
export const BAD = on("#ff6b6b", "#c92a2a");
