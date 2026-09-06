import { describe, expect, it } from 'vitest';
import { compile } from '../../../vendor/artshape/dsl/index';
import { BOARD, MARKERS, pieceSketch } from '../sketches';
import { PIECE_TYPES } from '../../chess/board';

describe('sketches', () => {
  it('compiles the board', () => {
    const { sketch, error } = compile(BOARD);
    expect(error?.formatted).toBeUndefined();
    expect(sketch!.assembly.placements.length).toBe(64 + 1 + 4 + 4 + 32 + 8);
  });

  it('compiles the markers', () => {
    const { sketch, error } = compile(MARKERS);
    expect(error?.formatted).toBeUndefined();
    expect(sketch!.assembly.placements.length).toBe(4);
  });

  it('compiles every man of both armies, standing on the origin', () => {
    for (const colour of ['w', 'b'] as const) {
      for (const type of PIECE_TYPES) {
        const { sketch, error } = compile(pieceSketch(colour, type));
        expect(`${colour}${type}: ${error?.formatted ?? 'ok'}`).toBe(`${colour}${type}: ok`);
        const bounds = sketch!.assembly.bounds();
        // the foot sits on z = 0 and the man is no wider than his square
        expect(`${colour}${type} floor ${bounds.min[2].toFixed(2)}`).toBe(`${colour}${type} floor 0.00`);
        expect(bounds.max[0] - bounds.min[0]).toBeLessThan(22);
        expect(bounds.max[1] - bounds.min[1]).toBeLessThan(22);
      }
    }
  });
});
