import { describe, expect, it } from 'vitest';
import { compile } from '../../../vendor/artshape/dsl/index';
import { groupByMesh } from '../../../vendor/artshape/assembly/groups';
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

  it('stands the men in the order a Staunton set stands them', () => {
    const height = (type: string) => compile(pieceSketch('w', type)).sketch!.assembly.bounds().max[2];
    const [pawn, rook, knight, bishop, queen, king] =
      ['p', 'r', 'n', 'b', 'q', 'k'].map(height);
    // king over queen over bishop over knight over rook over pawn, which is
    // what tells one man from another across a board before its shape does
    expect([pawn, rook, knight, bishop, queen, king])
      .toEqual([...[pawn, rook, knight, bishop, queen, king]].sort((a, b) => a - b));
    // and the king half again as tall as a square is wide, as a made set is
    expect(king / 22).toBeGreaterThan(1.2);
    expect(king / 22).toBeLessThan(1.6);
  });

  it("lets a ring of the army's own enamel into every base", () => {
    for (const [colour, enamel] of [['w', 'cobalt'], ['b', 'ruby']] as const) {
      for (const type of PIECE_TYPES) {
        const { sketch } = compile(pieceSketch(colour, type));
        const rings = groupByMesh(sketch!.assembly).filter((g) => g.enamel);
        expect(`${colour}${type}: ${rings.map((r) => r.enamel).join()}`).toBe(`${colour}${type}: ${enamel}`);
      }
    }
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
