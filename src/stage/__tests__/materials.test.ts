/**
 * The crossing from the still life's materials to the game path's one colour
 * and one roughness. It is checked here rather than by eye because the two
 * mistakes it can make — an enamel read as its metal, a metal read as a
 * colour it does not have — look like a lighting problem on the page and
 * take an evening to tell apart from one.
 */
import { describe, expect, it } from 'vitest';
import { enamels, finishes, metals } from 'artshape-render/render/materials';
import type { InstanceGroup } from 'artshape-render/render/renderer';
import { asGameGroup, materialOf } from '../materials';

const mesh = { positions: new Float32Array(3), normals: new Float32Array(3), indices: new Uint32Array(3) };
const group = (over: Partial<InstanceGroup>) =>
  ({ mesh, matrices: new Float32Array(16), ...over }) as InstanceGroup;

describe('a group crossing to the game path', () => {
  it('gives a metal its own reflectance, and its finish its roughness', () => {
    const { albedo, roughness } = materialOf(group({ metal: 'gold', finish: 'polished' }));
    expect(albedo).toEqual(metals.gold.f0);
    expect(roughness).toBe(finishes.polished.roughness);
  });

  it('gives an enamelled part the enamel, not the metal under it', () => {
    // the board's dark squares: black enamel laid on a gold ground, and a
    // group that came back gold with black in it would be a gold board
    const { albedo, roughness } = materialOf(group({ metal: 'gold', finish: 'satin', enamel: 'black' }));
    expect(albedo).toEqual(enamels.black.colour);
    expect(roughness).toBeLessThan(finishes.satin.roughness);
  });

  it("gives a pearl or a stone its body colour rather than a metal's", () => {
    for (const name of ['pearl', 'ruby']) {
      const metal = metals[name];
      if (!metal?.colour) continue;
      expect(materialOf(group({ metal: name })).albedo).toEqual(metal.colour);
    }
  });

  it('falls back rather than throwing on a material it does not know', () => {
    const { albedo, roughness } = materialOf(group({ metal: 'unobtainium', finish: 'scumbled' }));
    expect(albedo.every((c) => c > 0 && c <= 1)).toBe(true);
    expect(roughness).toBeGreaterThan(0);
  });

  it('carries the placements across without copying them', () => {
    const source = group({ metal: 'silver', count: 3 });
    const crossed = asGameGroup(source);
    expect(crossed.matrices).toBe(source.matrices);
    expect(crossed.count).toBe(3);
    expect(crossed.mesh).toBe(source.mesh);
  });
});
