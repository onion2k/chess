/**
 * The opponent: alpha-beta over the same move generator the board uses.
 *
 * There is no separate model of the game here. The search makes and unmakes
 * nothing — it copies positions, as the rules do — so a search bug cannot
 * corrupt the game being played, and the levels differ only in how deep they
 * look, whether they follow the exchanges to the end, and how much noise is
 * added to the score.
 */

import {
  colourOf, fileOf, inCheck, legalMoves, makeMove, rankOf, typeOf,
  type Colour, type Move, type Position,
} from './board';

export interface Level {
  name: string;
  /** Nominal depth in plies. */
  depth: number;
  /** Whether the leaf follows captures to a quiet position. */
  quiescence: boolean;
  /** Centipawns of noise added to each root move: how badly it may choose. */
  noise: number;
  /** Milliseconds the search may take, deepening until it runs out. 0 for a fixed depth. */
  budgetMs: number;
}

export const LEVELS: Level[] = [
  { name: 'Beginner', depth: 1, quiescence: false, noise: 130, budgetMs: 0 },
  { name: 'Casual', depth: 2, quiescence: false, noise: 55, budgetMs: 0 },
  { name: 'Club', depth: 3, quiescence: true, noise: 18, budgetMs: 0 },
  { name: 'Strong', depth: 4, quiescence: true, noise: 0, budgetMs: 2000 },
  { name: 'Advanced', depth: 7, quiescence: true, noise: 0, budgetMs: 4000 },
];

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 100000;

// Piece-square tables, from white's side, rank 1 first. Standard shapes: pawns
// want the centre and the far rank, knights hate the rim, rooks want open
// files and the seventh, the king wants a corner until the queens come off.
const PST: Record<string, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10,-20,-20, 10, 10,  5,
     5, -5,-10,  0,  0,-10, -5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5,  5, 10, 25, 25, 10,  5,  5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  5,  5,  0,  0,  0,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     5, 10, 10, 10, 10, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  q: [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -10,  5,  5,  5,  5,  5,  0,-10,
     0,  0,  5,  5,  5,  5,  0, -5,
    -5,  0,  5,  5,  5,  5,  0, -5,
   -10,  0,  5,  5,  5,  5,  0,-10,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    20, 30, 10,  0,  0, 10, 30, 20,
    20, 20,  0,  0,  0,  0, 20, 20,
   -10,-20,-20,-20,-20,-20,-20,-10,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
  ],
};

/** The king in an endgame wants the centre instead, and to walk. */
const KING_ENDGAME = [
  -50,-30,-30,-30,-30,-30,-30,-50,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -50,-40,-30,-20,-20,-30,-40,-50,
];

/** The score in centipawns from `side`'s point of view. */
export function evaluate(pos: Position, side: Colour): number {
  let score = 0;
  let material = 0;
  let bishops = { w: 0, b: 0 };
  const men: Array<{ type: string; colour: Colour; sq: number }> = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = pos.board[sq];
    if (!piece) continue;
    const type = typeOf(piece);
    const colour = colourOf(piece);
    men.push({ type, colour, sq });
    if (type !== 'k' && type !== 'p') material += VALUE[type];
    if (type === 'b') bishops[colour]++;
  }
  // one number for how far into the endgame we are, from the men still on
  const endgame = material < 1800;
  for (const { type, colour, sq } of men) {
    const index = colour === 'w' ? rankOf(sq) * 8 + fileOf(sq) : (7 - rankOf(sq)) * 8 + fileOf(sq);
    const table = type === 'k' && endgame ? KING_ENDGAME : PST[type];
    const value = VALUE[type] + table[index];
    score += colour === side ? value : -value;
  }
  if (bishops.w >= 2) score += side === 'w' ? 30 : -30;
  if (bishops.b >= 2) score += side === 'b' ? 30 : -30;
  return score;
}

/** Most valuable victim, least valuable attacker: the order that cuts soonest. */
function order(moves: Move[]): Move[] {
  return moves
    .map((m) => ({
      m,
      score: (m.captured ? 10 * VALUE[typeOf(m.captured)] - VALUE[typeOf(m.piece)] : 0)
        + (m.promotion ? VALUE[m.promotion] : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
}

class Timeout extends Error {}

class Search {
  nodes = 0;
  constructor(private readonly deadline: number, private readonly quiescence: boolean) {}

  private tick() {
    // the clock is read once every few thousand nodes: reading it per node costs more than the search saves
    if ((this.nodes++ & 2047) === 0 && this.deadline && performance.now() > this.deadline) throw new Timeout();
  }

  quiesce(pos: Position, alpha: number, beta: number): number {
    this.tick();
    const stand = evaluate(pos, pos.turn);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    for (const move of order(legalMoves(pos, true))) {
      const score = -this.quiesce(makeMove(pos, move), -beta, -alpha);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    const moves = legalMoves(pos);
    if (!moves.length) return inCheck(pos) ? -MATE + ply : 0;
    if (pos.halfmove >= 100) return 0;
    if (depth <= 0) {
      return this.quiescence ? this.quiesce(pos, alpha, beta) : evaluate(pos, pos.turn);
    }
    for (const move of order(moves)) {
      const score = -this.negamax(makeMove(pos, move), depth - 1, -beta, -alpha, ply + 1);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }
}

export interface Choice {
  move: Move;
  score: number;
  depth: number;
  nodes: number;
  ms: number;
}

/**
 * The move the engine plays. Deepens while there is time, keeping the best
 * move of the last completed depth: an interrupted deeper search is thrown
 * away rather than half-trusted.
 */
export function chooseMove(pos: Position, level: Level, random: () => number = Math.random): Choice | null {
  const started = performance.now();
  const deadline = level.budgetMs ? started + level.budgetMs : 0;
  const legal = legalMoves(pos);
  if (!legal.length) return null;

  let best: { move: Move; score: number } = { move: legal[0], score: -Infinity };
  let reached = 0;
  let nodes = 0;
  const first = level.budgetMs ? 1 : level.depth;

  for (let depth = first; depth <= level.depth; depth++) {
    const search = new Search(deadline, level.quiescence);
    // the last depth's winner is tried first, which is most of what a
    // deepening search buys: the cheap depths order the expensive one
    const ordered = [best.move, ...order(legal).filter((m) => m !== best.move)];
    let alpha = -Infinity;
    let round: { move: Move; score: number } | null = null;
    try {
      for (const move of ordered) {
        const raw = -search.negamax(makeMove(pos, move), depth - 1, -Infinity, -alpha, 1);
        // noise makes the weaker levels miss things; a mate seen is still played
        const score = level.noise && Math.abs(raw) < MATE - 100 ? raw + (random() * 2 - 1) * level.noise : raw;
        if (!round || score > round.score) round = { move, score };
        if (score > alpha) alpha = score;
      }
    } catch (error) {
      if (!(error instanceof Timeout)) throw error;
      nodes += search.nodes;
      break;
    }
    nodes += search.nodes;
    if (round) { best = round; reached = depth; }
    // a forced mate found: no deeper search will better it
    if (Math.abs(best.score) > MATE - 100) break;
  }

  return { move: best.move, score: best.score, depth: reached, nodes, ms: performance.now() - started };
}
