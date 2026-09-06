/**
 * The position, and the rules that move it on.
 *
 * The board is 0x88: sixteen files of a notional sixteen-wide board, of which
 * the right-hand eight are real. A square index off the board has a bit set in
 * its high nibble, so `square & 0x88` is the whole edge test — no rank or file
 * arithmetic, no bounds checks in the move loops.
 *
 * A position is a value. Making a move copies it; nothing is unmade. The
 * copy is a 128-byte typed array and six numbers, which the search can afford
 * and which means no move generator can leave a board dirty behind it.
 */

export type Colour = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** Piece codes on the board: white 1..6, black 9..14, 0 empty. */
export const enum P { Empty = 0, WP = 1, WN, WB, WR, WQ, WK, BP = 9, BN, BB, BR, BQ, BK }

export const PIECE_TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

export function code(colour: Colour, type: PieceType): number {
  return (colour === 'b' ? 8 : 0) + PIECE_TYPES.indexOf(type) + 1;
}
export function typeOf(piece: number): PieceType {
  return PIECE_TYPES[(piece & 7) - 1];
}
export function colourOf(piece: number): Colour {
  return piece & 8 ? 'b' : 'w';
}

/** 0x88 square from file (0=a) and rank (0=rank 1). */
export function square(file: number, rank: number): number {
  return rank * 16 + file;
}
export const fileOf = (sq: number) => sq & 7;
export const rankOf = (sq: number) => sq >> 4;
export const onBoard = (sq: number) => (sq & 0x88) === 0;

export function squareName(sq: number): string {
  return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);
}
export function squareFromName(name: string): number {
  return square('abcdefgh'.indexOf(name[0]), Number(name[1]) - 1);
}

/** Castling rights, as bits. */
export const enum Castle { WK = 1, WQ = 2, BK = 4, BQ = 8 }

export interface Move {
  from: number;
  to: number;
  /** The piece moved, as a board code. */
  piece: number;
  /** The piece taken, 0 for none. On an en passant it is the pawn beside, not the piece on `to`. */
  captured: number;
  /** Square the captured piece stood on; equals `to` except en passant. */
  capturedAt: number;
  promotion?: PieceType;
  /** Set on the king's move of a castling; the rook's own from/to. */
  castle?: { rookFrom: number; rookTo: number };
  /** Set on the double pawn step that creates it. */
  doubleStep?: boolean;
  enPassant?: boolean;
}

export interface Position {
  board: Int8Array;
  turn: Colour;
  castling: number;
  /** The square a pawn may be taken on in passing, or -1. */
  ep: number;
  /** Plies since the last capture or pawn move. */
  halfmove: number;
  /** Full moves, from 1, incremented after black's move. */
  fullmove: number;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function initialPosition(): Position {
  return fromFen(START);
}

export function fromFen(fen: string): Position {
  const [placement, turn, rights, ep, half, full] = fen.trim().split(/\s+/);
  const board = new Int8Array(128);
  let rank = 7, file = 0;
  for (const ch of placement) {
    if (ch === '/') { rank--; file = 0; continue; }
    if (ch >= '1' && ch <= '8') { file += Number(ch); continue; }
    const lower = ch.toLowerCase() as PieceType;
    board[square(file, rank)] = code(ch === lower ? 'b' : 'w', lower);
    file++;
  }
  let castling = 0;
  if (rights.includes('K')) castling |= Castle.WK;
  if (rights.includes('Q')) castling |= Castle.WQ;
  if (rights.includes('k')) castling |= Castle.BK;
  if (rights.includes('q')) castling |= Castle.BQ;
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling,
    ep: ep && ep !== '-' ? squareFromName(ep) : -1,
    halfmove: Number(half ?? 0),
    fullmove: Number(full ?? 1),
  };
}

export function toFen(pos: Position): string {
  let placement = '';
  for (let rank = 7; rank >= 0; rank--) {
    let run = 0;
    for (let file = 0; file < 8; file++) {
      const piece = pos.board[square(file, rank)];
      if (!piece) { run++; continue; }
      if (run) { placement += run; run = 0; }
      const letter = typeOf(piece);
      placement += colourOf(piece) === 'w' ? letter.toUpperCase() : letter;
    }
    if (run) placement += run;
    if (rank) placement += '/';
  }
  let rights = '';
  if (pos.castling & Castle.WK) rights += 'K';
  if (pos.castling & Castle.WQ) rights += 'Q';
  if (pos.castling & Castle.BK) rights += 'k';
  if (pos.castling & Castle.BQ) rights += 'q';
  return `${placement} ${pos.turn} ${rights || '-'} ${pos.ep >= 0 ? squareName(pos.ep) : '-'} ${pos.halfmove} ${pos.fullmove}`;
}

/** Everything that must repeat for a threefold: the men, the turn, the rights, the passing square. */
export function repetitionKey(pos: Position): string {
  const fen = toFen(pos);
  return fen.slice(0, fen.lastIndexOf(' ', fen.lastIndexOf(' ') - 1));
}

export function clone(pos: Position): Position {
  return { ...pos, board: pos.board.slice() };
}

export const opponent = (c: Colour): Colour => (c === 'w' ? 'b' : 'w');

// --- attack tables -------------------------------------------------------

const KNIGHT_STEPS = [31, 33, 14, 18, -31, -33, -14, -18];
const KING_STEPS = [1, -1, 16, -16, 15, 17, -15, -17];
const BISHOP_STEPS = [15, 17, -15, -17];
const ROOK_STEPS = [1, -1, 16, -16];
const QUEEN_STEPS = KING_STEPS;

/** Whether `colour` attacks `target`, ignoring whose turn it is and pins entirely. */
export function attacks(board: Int8Array, target: number, colour: Colour): boolean {
  const mine = colour === 'b' ? 8 : 0;
  // pawns: from where a pawn of this colour could take onto the target
  const back = colour === 'w' ? -16 : 16;
  for (const side of [-1, 1]) {
    const from = target + back + side;
    if (onBoard(from) && board[from] === (mine | 1)) return true;
  }
  for (const step of KNIGHT_STEPS) {
    const from = target + step;
    if (onBoard(from) && board[from] === (mine | 2)) return true;
  }
  for (const step of KING_STEPS) {
    const from = target + step;
    if (onBoard(from) && board[from] === (mine | 6)) return true;
  }
  for (const [steps, piece] of [[BISHOP_STEPS, 3], [ROOK_STEPS, 4]] as const) {
    for (const step of steps) {
      for (let sq = target + step; onBoard(sq); sq += step) {
        const occupant = board[sq];
        if (!occupant) continue;
        if ((occupant & 8 ? 8 : 0) === mine && ((occupant & 7) === piece || (occupant & 7) === 5)) return true;
        break;
      }
    }
  }
  return false;
}

export function kingSquare(board: Int8Array, colour: Colour): number {
  const king = (colour === 'b' ? 8 : 0) | 6;
  for (let sq = 0; sq < 128; sq++) if (!(sq & 0x88) && board[sq] === king) return sq;
  return -1;
}

export function inCheck(pos: Position, colour: Colour = pos.turn): boolean {
  const king = kingSquare(pos.board, colour);
  return king >= 0 && attacks(pos.board, king, opponent(colour));
}

// --- move generation -----------------------------------------------------

/**
 * Pseudo-legal moves: everything the pieces may do by their own rules, before
 * asking whether the mover's king is left in check. `capturesOnly` is for the
 * search's quiescence, which looks no further than the exchanges.
 */
export function pseudoMoves(pos: Position, capturesOnly = false): Move[] {
  const { board, turn } = pos;
  const mine = turn === 'b' ? 8 : 0;
  const moves: Move[] = [];
  const push = (m: Move) => { moves.push(m); };

  const add = (from: number, to: number, piece: number, extra: Partial<Move> = {}) => {
    const captured = board[to];
    if (capturesOnly && !captured && !extra.enPassant) return;
    push({ from, to, piece, captured, capturedAt: to, ...extra });
  };

  for (let from = 0; from < 128; from++) {
    if (from & 0x88) continue;
    const piece = board[from];
    if (!piece || (piece & 8 ? 8 : 0) !== mine) continue;
    const type = piece & 7;

    if (type === 1) {
      const forward = turn === 'w' ? 16 : -16;
      const startRank = turn === 'w' ? 1 : 6;
      const lastRank = turn === 'w' ? 7 : 0;
      const one = from + forward;
      if (onBoard(one) && !board[one]) {
        if (!capturesOnly) {
          if (rankOf(one) === lastRank) for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) push({ from, to: one, piece, captured: 0, capturedAt: one, promotion });
          else push({ from, to: one, piece, captured: 0, capturedAt: one });
          const two = one + forward;
          if (rankOf(from) === startRank && !board[two]) push({ from, to: two, piece, captured: 0, capturedAt: two, doubleStep: true });
        }
      }
      for (const side of [-1, 1]) {
        const to = one + side;
        if (!onBoard(to)) continue;
        const occupant = board[to];
        if (occupant && (occupant & 8 ? 8 : 0) !== mine) {
          if (rankOf(to) === lastRank) for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) push({ from, to, piece, captured: occupant, capturedAt: to, promotion });
          else push({ from, to, piece, captured: occupant, capturedAt: to });
        } else if (!occupant && to === pos.ep) {
          const takenAt = to - forward;
          push({ from, to, piece, captured: board[takenAt], capturedAt: takenAt, enPassant: true });
        }
      }
      continue;
    }

    const sliding = type === 3 || type === 4 || type === 5;
    const steps = type === 2 ? KNIGHT_STEPS : type === 3 ? BISHOP_STEPS : type === 4 ? ROOK_STEPS : QUEEN_STEPS;
    for (const step of steps) {
      let to = from + step;
      while (onBoard(to)) {
        const occupant = board[to];
        if (occupant) {
          if ((occupant & 8 ? 8 : 0) !== mine) add(from, to, piece);
          break;
        }
        add(from, to, piece);
        if (!sliding) break;
        to += step;
      }
    }

    if (type === 6 && !capturesOnly) {
      const home = turn === 'w' ? square(4, 0) : square(4, 7);
      if (from !== home || attacks(board, from, opponent(turn))) continue;
      const kingSide = turn === 'w' ? Castle.WK : Castle.BK;
      const queenSide = turn === 'w' ? Castle.WQ : Castle.BQ;
      if (pos.castling & kingSide
        && !board[from + 1] && !board[from + 2]
        && !attacks(board, from + 1, opponent(turn)) && !attacks(board, from + 2, opponent(turn))) {
        push({ from, to: from + 2, piece, captured: 0, capturedAt: from + 2, castle: { rookFrom: from + 3, rookTo: from + 1 } });
      }
      if (pos.castling & queenSide
        && !board[from - 1] && !board[from - 2] && !board[from - 3]
        && !attacks(board, from - 1, opponent(turn)) && !attacks(board, from - 2, opponent(turn))) {
        push({ from, to: from - 2, piece, captured: 0, capturedAt: from - 2, castle: { rookFrom: from - 4, rookTo: from - 1 } });
      }
    }
  }
  return moves;
}

const CASTLE_LOST: Record<number, number> = {
  [square(4, 0)]: Castle.WK | Castle.WQ,
  [square(0, 0)]: Castle.WQ,
  [square(7, 0)]: Castle.WK,
  [square(4, 7)]: Castle.BK | Castle.BQ,
  [square(0, 7)]: Castle.BQ,
  [square(7, 7)]: Castle.BK,
};

export function makeMove(pos: Position, move: Move): Position {
  const next = clone(pos);
  const { board } = next;
  board[move.from] = P.Empty;
  if (move.captured) board[move.capturedAt] = P.Empty;
  board[move.to] = move.promotion ? code(pos.turn, move.promotion) : move.piece;
  if (move.castle) {
    board[move.castle.rookTo] = board[move.castle.rookFrom];
    board[move.castle.rookFrom] = P.Empty;
  }
  next.castling &= ~(CASTLE_LOST[move.from] ?? 0);
  next.castling &= ~(CASTLE_LOST[move.capturedAt] ?? 0);
  next.ep = move.doubleStep ? (move.from + move.to) / 2 : -1;
  next.halfmove = move.captured || (move.piece & 7) === 1 ? 0 : pos.halfmove + 1;
  if (pos.turn === 'b') next.fullmove = pos.fullmove + 1;
  next.turn = opponent(pos.turn);
  return next;
}

/** Pseudo-legal moves that do not leave the mover's own king attacked. */
export function legalMoves(pos: Position, capturesOnly = false): Move[] {
  const out: Move[] = [];
  for (const move of pseudoMoves(pos, capturesOnly)) {
    const after = makeMove(pos, move);
    if (!inCheck(after, pos.turn)) out.push(move);
  }
  return out;
}

export function sameMove(a: Move, b: Move): boolean {
  return a.from === b.from && a.to === b.to && a.promotion === b.promotion;
}
