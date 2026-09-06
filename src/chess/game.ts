/**
 * The game as played: the position, everything that led to it, and how it
 * ended. The rules live in board.ts; this is the record and the verdict.
 */

import {
  colourOf, fromFen, inCheck, initialPosition, legalMoves, makeMove, opponent, repetitionKey, typeOf,
  type Colour, type Move, type PieceType, type Position,
} from './board';
import { toSan } from './san';

export interface Played {
  move: Move;
  san: string;
  /** The position the move was made in, so a takeback is a truncation. */
  before: Position;
}

export type Outcome =
  | { over: false }
  | { over: true; winner: Colour | null; reason: 'checkmate' | 'stalemate' | 'fifty-move' | 'repetition' | 'material' };

export class Game {
  position: Position;
  readonly history: Played[] = [];

  /** Every position reached, for the threefold. */
  private seen = new Map<string, number>();

  /** From the opening position, or from a FEN — which a test, or a puzzle, sets up. */
  constructor(fen?: string) {
    this.position = fen ? fromFen(fen) : initialPosition();
    this.seen.set(repetitionKey(this.position), 1);
  }

  /**
   * The legal moves, kept until the position changes. A pointer moving across
   * the board asks for them many times a second — for the squares to light, for
   * whether the game is over — and generating them means making every move.
   */
  legal(): Move[] {
    if (this.cache?.position !== this.position) this.cache = { position: this.position, moves: legalMoves(this.position) };
    return this.cache.moves;
  }
  private cache: { position: Position; moves: Move[]; outcome?: Outcome } | null = null;

  play(move: Move): Played {
    const before = this.position;
    const played: Played = { move, san: toSan(before, move), before };
    this.history.push(played);
    this.cache = null;
    this.position = makeMove(before, move);
    const key = repetitionKey(this.position);
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1);
    return played;
  }

  /** Take back one ply. Returns what was taken back, or null at the start. */
  undo(): Played | null {
    const played = this.history.pop();
    if (!played) return null;
    const key = repetitionKey(this.position);
    const count = (this.seen.get(key) ?? 1) - 1;
    if (count > 0) this.seen.set(key, count); else this.seen.delete(key);
    // the cache holds a verdict that the repetition count above has just changed
    this.cache = null;
    this.position = played.before;
    return played;
  }

  /** The men taken, in the order they were taken. */
  captured(): Array<{ colour: Colour; type: PieceType }> {
    return this.history
      .filter((p) => p.move.captured)
      .map((p) => ({ colour: colourOf(p.move.captured), type: typeOf(p.move.captured) }));
  }

  outcome(): Outcome {
    const legal = this.legal();
    if (this.cache!.outcome) return this.cache!.outcome;
    return (this.cache!.outcome = this.decide(legal));
  }

  private decide(legal: Move[]): Outcome {
    if (!legal.length) {
      const mated = inCheck(this.position);
      return mated
        ? { over: true, winner: opponent(this.position.turn), reason: 'checkmate' }
        : { over: true, winner: null, reason: 'stalemate' };
    }
    if (this.position.halfmove >= 100) return { over: true, winner: null, reason: 'fifty-move' };
    if ((this.seen.get(repetitionKey(this.position)) ?? 0) >= 3) return { over: true, winner: null, reason: 'repetition' };
    if (insufficient(this.position)) return { over: true, winner: null, reason: 'material' };
    return { over: false };
  }
}

/**
 * Neither side can force mate: king against king, king and a minor against
 * king, or king and bishop against king and bishop on one colour of square.
 */
function insufficient(pos: Position): boolean {
  const men: Array<{ type: PieceType; colour: Colour; light: boolean }> = [];
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue;
    const piece = pos.board[sq];
    if (!piece) continue;
    men.push({ type: typeOf(piece), colour: colourOf(piece), light: (((sq >> 4) + (sq & 7)) & 1) === 1 });
  }
  const others = men.filter((m) => m.type !== 'k');
  if (!others.length) return true;
  if (others.length === 1) return others[0].type === 'b' || others[0].type === 'n';
  if (others.length === 2 && others.every((m) => m.type === 'b')) {
    return others[0].light === others[1].light && others[0].colour !== others[1].colour;
  }
  return false;
}
