import { describe, expect, it } from 'vitest';
import { legalMoves, squareFromName } from '../board';
import { Game } from '../game';

/** Play a run of moves given as from/to, e.g. 'e2e4'. */
function play(game: Game, ...moves: string[]) {
  for (const text of moves) {
    const from = squareFromName(text.slice(0, 2));
    const to = squareFromName(text.slice(2, 4));
    const move = game.legal().find((m) => m.from === from && m.to === to && (!text[4] || m.promotion === text[4]));
    if (!move) throw new Error(`${text} is not legal in ${game.position.turn}'s position`);
    game.play(move);
  }
  return game;
}

describe('the game', () => {
  it('records the moves it is given', () => {
    const game = play(new Game(), 'e2e4', 'e7e5', 'g1f3');
    expect(game.history.map((h) => h.san)).toEqual(['e4', 'e5', 'Nf3']);
    expect(game.outcome().over).toBe(false);
  });

  it("sees the fool's mate", () => {
    const game = play(new Game(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(game.outcome()).toEqual({ over: true, winner: 'b', reason: 'checkmate' });
    expect(game.history.at(-1)!.san).toBe('Qh4#');
  });

  it('sees a stalemate', () => {
    const game = new Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(game.legal()).toHaveLength(0);
    expect(game.outcome()).toEqual({ over: true, winner: null, reason: 'stalemate' });
  });

  it('sees when neither side has the material to mate', () => {
    expect(new Game('8/8/4k3/8/8/4K3/8/8 w - - 0 1').outcome())
      .toEqual({ over: true, winner: null, reason: 'material' });
    expect(new Game('8/8/4k3/8/8/4KB2/8/8 w - - 0 1').outcome().over).toBe(true);
    // two knights is not a forced mate, but the rules do not call it a draw
    expect(new Game('8/8/4k3/8/8/3NKN2/8/8 w - - 0 1').outcome().over).toBe(false);
    expect(new Game('8/8/4k3/8/8/4KR2/8/8 w - - 0 1').outcome().over).toBe(false);
  });

  it('sees the fifty-move rule', () => {
    expect(new Game('4k3/8/4r3/8/8/4R3/8/4K3 w - - 100 80').outcome())
      .toEqual({ over: true, winner: null, reason: 'fifty-move' });
  });

  it('sees a threefold repetition', () => {
    const game = play(new Game(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
    expect(game.outcome().over).toBe(false);
    play(game, 'f6g8');
    expect(game.outcome()).toEqual({ over: true, winner: null, reason: 'repetition' });
  });

  it('lists the men taken, in the order they were taken', () => {
    const game = play(new Game(), 'e2e4', 'd7d5', 'e4d5', 'd8d5', 'b1c3', 'd5e5', 'd1e2');
    expect(game.captured()).toEqual([{ colour: 'b', type: 'p' }, { colour: 'w', type: 'p' }]);
  });

  it('takes a move back, and forgets the repetition with it', () => {
    const game = play(new Game(), 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8');
    expect(game.outcome().over).toBe(true);
    game.undo();
    expect(game.outcome().over).toBe(false);
    expect(game.history).toHaveLength(7);
    expect(game.legal()).toEqual(legalMoves(game.position));
  });

  it('has nothing to take back at the start', () => {
    expect(new Game().undo()).toBe(null);
  });
});
