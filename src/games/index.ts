// The games on offer, in the order the picker lists them. Adding one is a row here and its file.
import type { ComponentType } from "react";
import { Game2048 } from "./Game2048";
import { GameMines } from "./GameMines";
import { GameSnake } from "./GameSnake";
import { GameSudoku } from "./GameSudoku";
import { GameTetris } from "./GameTetris";
import { GameWords } from "./GameWords";
import { GameSolitaire } from "./GameSolitaire";
import { GameSokoban } from "./GameSokoban";

export interface GameDef {
  id: string;
  name: string;
  /** One line under the name in the picker. */
  blurb: string;
  Component: ComponentType;
}

export const GAMES: GameDef[] = [
  { id: "2048", name: "2048", blurb: "Slide and merge tiles to reach 2048.", Component: Game2048 },
  { id: "minesweeper", name: "Minesweeper", blurb: "Clear the field without opening a mine.", Component: GameMines },
  { id: "snake", name: "Snake", blurb: "Eat, grow, and keep off the walls and your tail.", Component: GameSnake },
  { id: "sudoku", name: "Sudoku", blurb: "Fill the grid: 1 to 9 once in every row, column and box.", Component: GameSudoku },
  { id: "tetris", name: "Tetris", blurb: "Stack the falling pieces and clear lines.", Component: GameTetris },
  { id: "words", name: "Words", blurb: "Guess the five-letter word in six tries. Daily or unlimited.", Component: GameWords },
  { id: "solitaire", name: "Solitaire", blurb: "Klondike: build the four suits up from the aces.", Component: GameSolitaire },
  { id: "sokoban", name: "Sokoban", blurb: "Push every box onto a goal. Endless levels, getting harder.", Component: GameSokoban },
];
