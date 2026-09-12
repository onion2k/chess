/**
 * The set's materials, as the game path can hold them.
 *
 * `render/` shades enamel, nacre, gems and metal each with their own model
 * and reflects a table in them; `game/` has one albedo and one roughness a
 * placement, with `f0 = albedo`, so everything over there is a metal and an
 * enamel is a flat colour. This is the crossing, kept in its own file so it
 * can be checked without a device — it is the whole of what the spike risks
 * getting wrong about how the set looks.
 */

import { enamels, finishes, metals } from 'artshape-render/render/materials';
import type { InstanceGroup } from 'artshape-render/render/renderer';
import type { GameGroup } from 'artshape-render/game/renderer';

/**
 * A group's colour and roughness on the game path, from the material record
 * the still-life path reads properly.
 *
 * An enamel becomes its own colour and a glassy roughness; a pearl or a stone
 * becomes its body colour; a metal becomes its normal-incidence reflectance,
 * which is what `f0 = albedo` means over there. What is lost in the crossing
 * is everything that is not one number: the enamel's glow of the metal under
 * it, the pearl's orient, the stone's fire, and the anisotropy, hammering and
 * patina a finish carries. Roughness survives.
 */
export function materialOf(group: InstanceGroup): { albedo: [number, number, number]; roughness: number } {
  const roughness = finishes[group.finish ?? 'satin']?.roughness ?? 0.3;
  if (group.enamel) {
    const enamel = enamels[group.enamel];
    if (enamel) return { albedo: enamel.colour, roughness: 0.1 };
  }
  const metal = metals[group.metal ?? 'silver'];
  if (!metal) return { albedo: [0.8, 0.8, 0.8], roughness };
  return { albedo: metal.colour ?? metal.f0, roughness };
}

export function asGameGroup(group: InstanceGroup): GameGroup {
  const { albedo, roughness } = materialOf(group);
  return { mesh: group.mesh, matrices: group.matrices, count: group.count, albedo, roughness };
}

