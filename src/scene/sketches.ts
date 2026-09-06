/**
 * The set, in artshape's own language.
 *
 * These are the chess sketches from artshape, taken apart. There a whole set
 * is one form, laid out for the first move and then still; here every man has
 * to move on its own, so each is its own sketch with its own form, standing at
 * the origin on its base. The board keeps its sketch unchanged.
 *
 * A piece is written once, as a template, and the two armies differ only in
 * their metal and the colour of the stones and enamel set in them — which is
 * exactly the difference between the silver and gold sets in the original.
 */

export const BOARD = `# An art deco chessboard: sixty-four enamel squares laid on a gold ground,
# with a millimetre of gold showing between them for the veins, a guilloche
# border, a dentil band of chevrons, and a sunburst with an onyx at each
# corner.
material gold satin

part ground = plate(polygon(sides: 4, radius: 147, rotate: 45deg), thickness: 2.6, tiers: 2, shrink: 0.055, bevel: 1.2) engraved guilloche(scale: 5, depth: 0.1)
part light  = plate(polygon(sides: 4, radius: 14.85, rotate: 45deg), thickness: 1.6, bevel: 0.25, enamel: white)
part dark   = plate(polygon(sides: 4, radius: 14.85, rotate: 45deg), thickness: 1.6, bevel: 0.25, enamel: black)
part rail   = bar(length: 182, width: 3.4, thickness: 1.8, bevel: 0.4) in gold polished
part ray    = plate(fan(radius: 17, spread: 86deg, blades: 5, inner: 3.5), thickness: 1.4, bevel: 0.3) in gold polished
part chev   = plate(chevron(width: 9, rise: 4, bar: 1.8), thickness: 1.2, bevel: 0.25) in gold polished
part seat   = setting(width: 5.5, style: bezel, height: 1.8) in gold polished
part stone  = gem(cut: brilliant, width: 5.5) in onyx

unit collet {
  place seat
  fasten stone to seat.seat
}

# a1 is dark, so the a file starts dark and the b file light
unit pairA { place dark
  place light at (0, 22, 0) }
unit pairB { place light
  place dark at (0, 22, 0) }
unit fileA { repeat pairA around along(bow((0,0,0), (0,132,0), sag: 0), 4) }
unit fileB { repeat pairB around along(bow((0,0,0), (0,132,0), sag: 0), 4) }
unit two   { place fileA
  place fileB at (22, 0, 0) }
unit four  { place two
  place two at (44, 0, 0) }
unit eight { place four
  place four at (88, 0, 0) }

unit railing { place rail turn 90deg }
unit teeth { repeat chev around along(bow((0,-77,0), (0,77,0), sag: 0), 8) }

form chessboard {
  place ground at (0, 0, 2.6)
  place eight at (-77, -77, 6)
  repeat railing around ring(4, radius: 90.5, z: 6)
  repeat ray around ring(4, radius: 126, phase: 45deg, z: 5.9)
  repeat teeth around ring(4, radius: 99, z: 5.9)
  repeat collet around ring(4, radius: 122, phase: 45deg, z: 5.6)
}`;

/** What separates one army from the other: the metal, and what is set in it. */
interface Livery {
  metal: string;
  /** Enamel of the roundel let into the foot. */
  inlay: string;
  /** Nacre of the pearls: the pawn's head, the bishop's pip, the queen's. */
  pearl: string;
  /** The stone in every collet. */
  stone: string;
}

export const LIVERY: Record<'w' | 'b', Livery> = {
  w: { metal: 'silver', inlay: 'cobalt', pearl: 'white pearl', stone: 'sapphire' },
  b: { metal: 'gold', inlay: 'ruby', pearl: 'gold pearl', stone: 'ruby' },
};

/** The base, the hoop and the collet, which every man is built on. */
const common = (l: Livery) => `material ${l.metal} satin

part foot  = disc(radius: 7.2, thickness: 2.4, bevel: 0.7) in ${l.metal} polished
part inlay = plate(roundel(radius: 5.9), thickness: 1, bevel: 0.3, enamel: ${l.inlay}) in ${l.metal} satin
part hoop  = band(radius: 2, width: 1.6, thickness: 0.9) in ${l.metal} polished
part seat  = setting(width: 3, style: bezel, height: 1.2) in ${l.metal} polished
part stone = gem(cut: brilliant, width: 3) in ${l.stone}

unit collet {
  place seat
  fasten stone to seat.seat
}
unit base {
  place foot at (0, 0, 1.2)
  place inlay at (0, 0, 2.9)
}
`;

/** The hatching every shaft and cup carries. */
const HATCH = 'engraved hatch(scale: 1.3, depth: 0.13)';
const HATCH_ACROSS = 'engraved hatch(scale: 1.3, depth: 0.13, angle: 90deg)';

const bodies: Record<string, (l: Livery) => string> = {
  p: (l) => `part shaft = stem(path: through((0,0,0), (0,0,9)), radius: 2.6, tip: 0.45, swell: 0.3) in ${l.metal} satin ${HATCH}
part head = pearl(radius: 3) in ${l.pearl}

form pawn {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 12.6)
  place head at (0, 0, 15.8)
}`,

  r: (l) => `part shaft  = stem(path: through((0,0,0), (0,0,7)), radius: 3, tip: 0.8, swell: 0.25) in ${l.metal} satin ${HATCH}
part tower  = collar(inner: 2.6, wall: 2.1, length: 7, belly: 0.05) in ${l.metal} satin ${HATCH_ACROSS}
part rim    = band(radius: 4.8, width: 1.5, thickness: 1) in ${l.metal} polished
part lid    = disc(radius: 4.9, thickness: 1, bevel: 0.3) in ${l.metal} polished
part merlon = bar(length: 2.2, width: 2.6, thickness: 2.4, bevel: 0.3) in ${l.metal} polished

form rook {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 10.6)
  place rim at (0, 0, 11.4)
  place tower at (0, 0, 14.6)
  place lid at (0, 0, 17.6)
  repeat merlon around ring(4, radius: 3.5, z: 19.3)
}`,

  n: (l) => `part shaft = stem(path: through((0,0,0), (0,0,7)), radius: 3, tip: 0.8, swell: 0.25) in ${l.metal} satin ${HATCH}
part crest = blade(path: through((0,0,0), (0,0,5), (0,1.5,9), (0,4,11.5), (0,6.5,11)), width: 6.5, thickness: 2.4, sections: 40) in ${l.metal} satin
part ear   = plate(lozenge(length: 3.4, width: 1.5), thickness: 1.1, bevel: 0.25) in ${l.metal} polished

form knight {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 10.6)
  place crest at (0, 0, 11)
  place ear at (1.2, 0, 23.4) roll 90deg pitch -25deg
  place collet at (2.4, 1.3, 21.6) pitch 90deg roll 20deg
  place collet at (2.4, -1.3, 21.6) pitch 90deg roll -20deg
}`,

  b: (l) => `part shaft = stem(path: through((0,0,0), (0,0,9)), radius: 2.8, tip: 0.5, swell: 0.3) in ${l.metal} satin ${HATCH}
part mitre = bud(length: 10.5, width: 7, lobes: 2, lobeDepth: 0.18, point: 0.5) in ${l.metal} satin
part pip   = pearl(radius: 1.6) in ${l.pearl}

form bishop {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 12.6)
  place mitre at (0, 0, 13)
  place pip at (0, 0, 24.2)
  place collet at (0, -3.1, 17.4) roll -90deg
}`,

  q: (l) => `part shaft = stem(path: through((0,0,0), (0,0,13.5)), radius: 2.8, tip: 0.55, swell: 0.3) in ${l.metal} satin ${HATCH}
part cup   = bell(length: 6.5, mouth: 10, throat: 6.4, wall: 1.3, flare: 1.2) in ${l.metal} satin ${HATCH_ACROSS}
part pip   = pearl(radius: 2.5) in ${l.pearl}

form queen {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 17)
  place cup at (0, 0, 17.2)
  repeat collet around ring(8, radius: 4.6, z: 23.6, tilt: 40deg)
  place pip at (0, 0, 25.6)
}`,

  k: (l) => `part shaft    = stem(path: through((0,0,0), (0,0,15.5)), radius: 2.8, tip: 0.55, swell: 0.3) in ${l.metal} satin ${HATCH}
part cup      = bell(length: 5, mouth: 9.5, throat: 6.2, wall: 1.3, flare: 1.2) in ${l.metal} satin ${HATCH_ACROSS}
part upright  = bar(length: 7, width: 2.2, thickness: 2.2, bevel: 0.35) in ${l.metal} polished
part crossarm = bar(length: 4.4, width: 2.2, thickness: 2.2, bevel: 0.35) in ${l.metal} polished

form king {
  place base
  place shaft at (0, 0, 3.4)
  place hoop at (0, 0, 19)
  place cup at (0, 0, 19.2)
  repeat collet around ring(8, radius: 4.4, z: 24.4, tilt: 40deg)
  place upright at (0, 0, 27.5) pitch -90deg
  place crossarm at (0, 0, 28.5)
}`,
};

/** The sketch for one man: `type` is the usual letter, `colour` which army. */
export function pieceSketch(colour: 'w' | 'b', type: string): string {
  const livery = LIVERY[colour];
  return common(livery) + '\n' + bodies[type](livery);
}

/**
 * The markers laid on the squares: a disc under an empty square a piece may
 * go to, a wider ring of colour under a man that may be taken, and an amber
 * disc under the man in hand. They are enamel over polished gold, not lights,
 * so highlighting a dozen squares costs a dozen instances and no shadow bakes.
 */
export const MARKERS = `material gold polished

part quiet   = plate(roundel(radius: 4.4), thickness: 0.5, bevel: 0.2, enamel: emerald) in gold polished
part capture = plate(roundel(radius: 10), thickness: 0.5, bevel: 0.2, enamel: coral) in gold polished
part chosen  = plate(roundel(radius: 9.6), thickness: 0.5, bevel: 0.2, enamel: amber) in gold polished
part last    = plate(polygon(sides: 4, radius: 14.2, rotate: 45deg), thickness: 0.4, bevel: 0.2, enamel: peacock) in gold polished

# The last move is marked by tinting the whole square rather than by a disc on
# it, which a piece standing there would hide.
#
# All four stand on the origin: only their meshes are wanted, and the game puts
# them on squares itself.
form markers {
  place quiet
  place capture
  place chosen
  place last
}`;
