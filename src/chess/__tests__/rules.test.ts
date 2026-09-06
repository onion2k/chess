import { describe, expect, it } from 'vitest';
import { fromFen, initialPosition, legalMoves, makeMove, squareFromName, toFen, type Position } from '../board';
import { toSan } from '../san';
import { chooseMove, LEVELS } from '../engine';

/** Nodes at a depth: the one test that catches a move generator's every lie. */
function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const move of moves) total += perft(makeMove(pos, move), depth - 1);
  return total;
}

describe('perft', () => {
  it('counts the opening position', () => {
    const pos = initialPosition();
    expect(perft(pos, 1)).toBe(20);
    expect(perft(pos, 2)).toBe(400);
    expect(perft(pos, 3)).toBe(8902);
    expect(perft(pos, 4)).toBe(197281);
  });

  // Kiwipete: castling both ways, en passant, pins, promotions in reach
  it('counts kiwipete', () => {
    const pos = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(pos, 1)).toBe(48);
    expect(perft(pos, 2)).toBe(2039);
    expect(perft(pos, 3)).toBe(97862);
  });

  it('counts a position full of en passant and promotion', () => {
    const pos = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect(perft(pos, 1)).toBe(14);
    expect(perft(pos, 2)).toBe(191);
    expect(perft(pos, 3)).toBe(2812);
    expect(perft(pos, 4)).toBe(43238);
  });

  it('counts a position where promotion and pins decide', () => {
    const pos = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
    expect(perft(pos, 1)).toBe(6);
    expect(perft(pos, 2)).toBe(264);
    expect(perft(pos, 3)).toBe(9467);
  });

  it('counts a cramped middlegame', () => {
    const pos = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
    expect(perft(pos, 1)).toBe(44);
    expect(perft(pos, 2)).toBe(1486);
    expect(perft(pos, 3)).toBe(62379);
  });
});

describe('fen', () => {
  it('round-trips the opening', () => {
    expect(toFen(initialPosition())).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  it('records the passing square after a double step', () => {
    const pos = initialPosition();
    const e4 = legalMoves(pos).find((m) => m.from === squareFromName('e2') && m.to === squareFromName('e4'))!;
    expect(toFen(makeMove(pos, e4))).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  });
});

describe('castling', () => {
  it('moves the rook with the king and drops the rights', () => {
    const pos = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const short = legalMoves(pos).find((m) => m.castle && m.to === squareFromName('g1'))!;
    expect(toFen(makeMove(pos, short))).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });

  it('is refused through check', () => {
    const pos = fromFen('4k3/8/8/8/8/8/6r1/R3K2R w KQ - 0 1');
    expect(legalMoves(pos).some((m) => m.castle && m.to === squareFromName('g1'))).toBe(false);
    expect(legalMoves(pos).some((m) => m.castle && m.to === squareFromName('c1'))).toBe(true);
  });
});

describe('notation', () => {
  it('disambiguates by file', () => {
    const pos = fromFen('R6R/8/8/8/8/8/8/4K3 w - - 0 1');
    const moves = legalMoves(pos);
    const move = moves.find((m) => m.from === squareFromName('a8') && m.to === squareFromName('d8'))!;
    expect(toSan(pos, move, moves)).toBe('Rad8');
  });

  it('writes castling, promotion and mate', () => {
    const castle = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    const short = legalMoves(castle).find((m) => m.castle && m.to === squareFromName('g1'))!;
    expect(toSan(castle, short)).toBe('O-O');

    const promote = fromFen('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const queen = legalMoves(promote).find((m) => m.promotion === 'q')!;
    expect(toSan(promote, queen)).toBe('a8=Q');

    const mate = fromFen('k7/1R6/2K5/8/8/8/8/6R1 w - - 0 1');
    const done = legalMoves(mate).find((m) => m.from === squareFromName('g1') && m.to === squareFromName('g8'))!;
    expect(toSan(mate, done)).toBe('Rg8#');
  });
});

describe('engine', () => {
  it('takes a free queen at every level', () => {
    const pos = fromFen('4k3/8/8/8/8/8/3q4/4K2R w K - 0 1');
    for (const level of LEVELS) {
      const choice = chooseMove(pos, { ...level, noise: 0 })!;
      expect(`${level.name}: ${choice.move.from},${choice.move.to}`)
        .toBe(`${level.name}: ${squareFromName('e1')},${squareFromName('d2')}`);
    }
  });

  it('finds mate in one', () => {
    const pos = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const choice = chooseMove(pos, LEVELS[2])!;
    expect(toSan(pos, choice.move)).toBe('Ra8#');
  });

  it('does not walk into mate in one', () => {
    // black must stop Ra8#: the search should see it a ply ahead
    const pos = fromFen('6k1/5ppp/8/8/8/8/6P1/R5K1 b - - 0 1');
    const choice = chooseMove(pos, LEVELS[3])!;
    const after = makeMove(pos, choice.move);
    expect(legalMoves(after).some((m) => toSan(after, m).endsWith('#'))).toBe(false);
  });
});
