import { describe, expect, it } from 'vitest';
import { SetScene, TOP, squareCentre } from '../scene';
import { squareFromName } from '../../chess/board';

/** The translation of one instance of a group, or null when it stands nowhere. */
function placed(matrices: Float32Array, index: number) {
  const m = matrices.subarray(index * 16, index * 16 + 16);
  // a placement not in use is written at zero scale
  if (m[0] === 0 && m[5] === 0 && m[10] === 0) return null;
  return [m[12], m[13], m[14]];
}

describe('the set on the renderer', () => {
  const scene = new SetScene();

  it("names the squares in the board's own millimetres", () => {
    expect(squareCentre(squareFromName('a1'))).toEqual([-77, -77]);
    expect(squareCentre(squareFromName('h8'))).toEqual([77, 77]);
    expect(squareCentre(squareFromName('e4'))).toEqual([11, -11]);
  });

  it('allocates every group once, the men dynamic and the board not', () => {
    const dynamic = scene.groups.filter((g) => g.dynamic);
    expect(scene.groups.length).toBeGreaterThan(60);
    expect(dynamic.length).toBeGreaterThan(40);
    // the board's own groups never move, so they stay in the sky occlusion bake
    expect(scene.groups.length - dynamic.length).toBeGreaterThan(4);
    for (const group of scene.groups) expect(group.matrices.length % 16).toBe(0);
  });

  it('stands a man on a square, and leaves the rest of his kind nowhere', () => {
    scene.place([{ colour: 'w', type: 'k', at: [11, -77, TOP], turn: 0 }]);
    const standing = scene.groups.filter((g) => g.dynamic).some((g) => {
      const p = placed(g.matrices, 0);
      return !!p && p[0] === 11 && p[1] === -77;
    });
    expect(standing).toBe(true);

    scene.place([{ colour: 'w', type: 'p', at: [11, -55, TOP], turn: 0 }]);
    // the king was told to stand nowhere this time, so no man's group holds
    // him — the board's own square e1 sits on that point and is not a man
    const anyKing = scene.groups.filter((g) => g.dynamic).some((g) => {
      for (let i = 0; i < g.matrices.length / 16; i++) {
        const p = placed(g.matrices, i);
        if (p && p[0] === 11 && p[1] === -77) return true;
      }
      return false;
    });
    expect(anyKing).toBe(false);
  });

  it('reports only the groups a move actually changed', () => {
    const men = [
      { colour: 'w' as const, type: 'p' as const, at: [11, -55, TOP] as [number, number, number], turn: 0 },
      { colour: 'b' as const, type: 'q' as const, at: [-11, 77, TOP] as [number, number, number], turn: Math.PI },
    ];
    scene.place(men);
    expect(scene.place(men)).toEqual([]);
    const moved = scene.place([{ ...men[0], at: [11, -11, TOP] }, men[1]]);
    expect(moved.length).toBeGreaterThan(0);
    // the queen did not move, so her groups are not among them
    expect(moved.length).toBeLessThan(scene.groups.length / 2);
  });

  it('lays markers, and says so only when they move', () => {
    const first = scene.mark('quiet', [[11, -11, TOP]]);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(scene.mark('quiet', [[11, -11, TOP]])).toBe(-1);
    expect(scene.mark('quiet', [])).toBeGreaterThanOrEqual(0);
  });

  it('knows how wide and tall each man is, for the pointer', () => {
    const pawn = scene.extent('w', 'p');
    const king = scene.extent('b', 'k');
    expect(pawn.height).toBeGreaterThan(15);
    expect(king.height).toBeGreaterThan(pawn.height);
    expect(pawn.radius).toBeLessThan(11);
  });
});
