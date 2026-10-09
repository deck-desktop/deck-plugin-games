// Games — mini games in a pane.
//
// A pane view only: open it from a pane's menu (or split one into Games) in Workspaces. The pane
// opens on a picker; choosing a game shows it with a way back. Which game is showing, and each
// game's whole state, are saved (store.ts), so a reload or a restart of Deck comes back to the
// same game, mid-play.
import { useEffect, useSyncExternalStore } from "react";
import { ChevronLeft, Gamepad2 } from "lucide-react";
import { current, flush, getVersion, isLoaded, load, setCurrent, subscribe } from "./store";
import { GAMES } from "./games";

function Picker() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-text-secondary">
        <Gamepad2 size={16} style={{ color: "var(--accent)" }} /> Pick a game
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
        {GAMES.map((g) => (
          <button key={g.id} onClick={() => setCurrent(g.id)}
            className="rounded-lg border border-subtle bg-card p-3 text-left transition hover:border-accent">
            <div className="text-[14px] font-semibold text-text-primary">{g.name}</div>
            <div className="mt-1 text-[12px] leading-snug text-text-secondary">{g.blurb}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PaneView() {
  useSyncExternalStore(subscribe, getVersion);
  useEffect(() => { void load(); }, []);
  // A pane closing (or Deck navigating away) writes the last moves at once rather than in a second.
  useEffect(() => () => { void flush(); }, []);

  if (!isLoaded()) return <div className="p-4 text-[12px] text-text-muted">Loading…</div>;
  const game = GAMES.find((g) => g.id === current());
  if (!game) return <Picker />;
  return (
    <div className="flex h-full min-h-0 flex-col bg-app">
      <div className="flex shrink-0 items-center gap-1 border-b border-subtle px-2 py-1">
        <button onClick={() => setCurrent(null)} title="All games"
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[12px] text-text-muted hover:bg-white/5 hover:text-text-primary">
          <ChevronLeft size={14} /> Games
        </button>
        <span className="text-[12px] font-semibold text-text-primary">{game.name}</span>
      </div>
      {/* Keyed by game: switching games remounts, so each reads its own save. */}
      <div className="min-h-0 flex-1"><game.Component key={game.id} /></div>
    </div>
  );
}

export { dispose } from "./store";
