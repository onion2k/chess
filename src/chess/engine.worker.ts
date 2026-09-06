/**
 * The engine off the main thread: the search may take seconds at the top
 * level, and the board has to stay turnable while it thinks.
 */

import { fromFen, squareName } from './board';
import { chooseMove, LEVELS } from './engine';

export interface Ask { fen: string; level: number; id: number }
export interface Answer {
  id: number;
  /** The move in long algebraic — e2e4, a7a8q — or null when there is none. */
  move: string | null;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
}

self.addEventListener('message', (e: MessageEvent<Ask>) => {
  const { fen, level, id } = e.data;
  const pos = fromFen(fen);
  const choice = chooseMove(pos, LEVELS[Math.max(0, Math.min(LEVELS.length - 1, level))]);
  const answer: Answer = choice
    ? {
        id,
        move: squareName(choice.move.from) + squareName(choice.move.to) + (choice.move.promotion ?? ''),
        score: choice.score, depth: choice.depth, nodes: choice.nodes, ms: choice.ms,
      }
    : { id, move: null, score: 0, depth: 0, nodes: 0, ms: 0 };
  (self as unknown as Worker).postMessage(answer);
});
