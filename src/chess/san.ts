/** Moves written the way a scoresheet writes them. */

import {
  colourOf, fileOf, inCheck, legalMoves, makeMove, rankOf, sameMove, squareName, typeOf,
  type Move, type Position,
} from './board';

/**
 * Standard algebraic notation for a move in a position. The legal list is
 * needed anyway for the disambiguation — Nbd2 rather than Nd2 — so it is taken
 * as an argument where the caller already has it.
 */
export function toSan(pos: Position, move: Move, legal = legalMoves(pos)): string {
  if (move.castle) {
    const side = fileOf(move.to) > fileOf(move.from) ? 'O-O' : 'O-O-O';
    return side + suffix(pos, move);
  }
  const type = typeOf(move.piece);
  let text: string;
  if (type === 'p') {
    text = move.captured ? `${'abcdefgh'[fileOf(move.from)]}x${squareName(move.to)}` : squareName(move.to);
  } else {
    const rivals = legal.filter((m) =>
      !sameMove(m, move) && m.to === move.to && typeOf(m.piece) === type && colourOf(m.piece) === colourOf(move.piece));
    let hint = '';
    if (rivals.length) {
      const sameFile = rivals.some((m) => fileOf(m.from) === fileOf(move.from));
      const sameRank = rivals.some((m) => rankOf(m.from) === rankOf(move.from));
      hint = !sameFile ? 'abcdefgh'[fileOf(move.from)]
        : !sameRank ? String(rankOf(move.from) + 1)
        : squareName(move.from);
    }
    text = `${type.toUpperCase()}${hint}${move.captured ? 'x' : ''}${squareName(move.to)}`;
  }
  if (move.promotion) text += `=${move.promotion.toUpperCase()}`;
  return text + suffix(pos, move);
}

function suffix(pos: Position, move: Move): string {
  const after = makeMove(pos, move);
  if (!inCheck(after)) return '';
  return legalMoves(after).length ? '+' : '#';
}
