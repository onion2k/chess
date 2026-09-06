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

/** What separates one army from the other. */
interface Livery {
  metal: string;
  /** Polished for the turned collars and the base's steps, satin for the rest. */
  bright: string;
  /** The enamel let into the base: the one colour on an otherwise plain man. */
  inlay: string;
}

export const LIVERY: Record<'w' | 'b', Livery> = {
  w: { metal: 'silver', bright: 'silver', inlay: 'cobalt' },
  b: { metal: 'gold', bright: 'gold', inlay: 'ruby' },
};

/**
 * The base every man stands on, and the turned foot rising out of it.
 *
 * A Staunton base is a broad disc, stepped at its edge, with a hollow flare
 * sweeping up from it to the collar the stem begins at. `radius` is the
 * disc's, `rise` how far the flare climbs; a king stands on a wider foot than
 * a pawn and the rest of him is scaled to it.
 *
 * The step is cut deep enough to leave a shelf between the two tiers, and a
 * ring of enamel is let into it — the one colour on an otherwise plain man,
 * and what tells the two armies apart from across the board where the metals
 * alone can be hard to read at a low angle. The flare's throat is drawn in
 * inside the upper tier so that nothing overhangs the ring.
 *
 * A plate is centred on its own z, so it is placed at half its height to
 * stand on the square; with two tiers it is twice its thickness tall. `bore`
 * is a diameter, not a radius.
 */
const base = (l: Livery, radius: number, rise: number) => `material ${l.metal} satin

part foot  = plate(roundel(radius: ${radius}), thickness: 1.2, tiers: 2, shrink: 0.16, bevel: 0.4) in ${l.bright} polished
part inlay = plate(roundel(radius: ${(radius * 0.975).toFixed(2)}), thickness: 0.42, bore: ${(radius * 1.73).toFixed(2)}, bevel: 0.14, enamel: ${l.inlay}) in ${l.bright} polished
part flare = bell(length: ${rise}, mouth: ${(radius * 0.5).toFixed(2)}, throat: ${(radius * 1.6).toFixed(2)}, wall: 1.0, flare: 1.2) in ${l.metal} satin
part ring  = band(radius: ${(radius * 0.31).toFixed(2)}, width: 1.3, thickness: 0.55) in ${l.bright} polished

unit base {
  place foot at (0, 0, 1.2)
  place inlay at (0, 0, 1.32)
  place flare at (0, 0, 2.4)
  place ring at (0, 0, ${(2.4 + rise).toFixed(2)})
}
`;

/**
 * The six men, in the shapes a Staunton set has had since 1849: a turned
 * baluster stem on a stepped base for all of them, and then the head that
 * tells you what the man is — a ball for the pawn, a battlement for the rook,
 * a horse for the knight, a slit mitre for the bishop, a coronet of points
 * for the queen and a crown under a cross for the king.
 *
 * Heights are the traditional proportions against a 22 mm square: the king
 * half again as tall as the square is wide, and the rest stepped down from
 * him. Nothing is enamelled and nothing is set: the two armies are told apart
 * by their metal, as a boxwood set is told apart by its stain.
 */
const bodies: Record<string, (l: Livery) => string> = {
  p: (l) => base(l, 7.0, 2.9) + `
part shaft = stem(path: through((0,0,0), (0,0,6.6)), radius: 2.35, tip: 0.6, swell: 0.24) in ${l.metal} satin
part neck  = band(radius: 1.5, width: 1.0, thickness: 0.5) in ${l.bright} polished
part head  = pearl(radius: 2.5) in ${l.bright} polished

form pawn {
  place base
  place shaft at (0, 0, 5.4)
  place neck at (0, 0, 12.1)
  place head at (0, 0, 13.9)
}`,

  r: (l) => base(l, 7.8, 3.0) + `
part shaft  = stem(path: through((0,0,0), (0,0,4.4)), radius: 2.95, tip: 0.88) in ${l.metal} satin
part rim    = band(radius: 4.55, width: 1.7, thickness: 0.85) in ${l.bright} polished
part tower  = collar(inner: 3.15, wall: 1.45, length: 7.0, belly: 0.05) in ${l.metal} satin
part merlon = bar(length: 2.5, width: 2.3, thickness: 2.5, bevel: 0.25) in ${l.bright} polished

form rook {
  place base
  place shaft at (0, 0, 5.5)
  place rim at (0, 0, 10.2)
  place tower at (0, 0, 14.0)
  repeat merlon around ring(4, radius: 3.6, z: 18.0)
}`,

  n: (l) => base(l, 7.8, 2.8) + `
# The horse is cut the way a carver cuts one: a flat slab in the piece's own
# plane, bent up the neck, over the poll and down the face, so its outer edge
# is the crest and its inner edge the throat and jaw, and its blunt end the
# muzzle. The mane is a second, thinner slab standing behind that curve, and
# the ears sit at the poll where neck and head meet. He faces +y, and black's
# knights are turned about so the two armies look at each other.
part plinth = stem(path: through((0,0,0), (0,0,3.6)), radius: 3.2, tip: 0.86) in ${l.metal} satin
part horse  = blade(path: through((0,-0.9,0), (0,-1.6,4.8), (0,-1.4,9.0), (0,0.3,12.2), (0,2.8,13.0), (0,4.7,12.4)), width: 6.2, thickness: 5.2, sections: 48) in ${l.metal} satin
part mane   = blade(path: through((0,-3.6,3.4), (0,-4.2,8.4), (0,-2.6,12.4), (0,0.0,14.4)), width: 1.5, thickness: 2.0, sections: 26) in ${l.bright} polished
part ear    = bud(length: 2.3, width: 1.3, lobes: 1, point: 0.82) in ${l.bright} polished

form knight {
  place base
  place plinth at (0, 0, 5.1)
  place horse at (0, 0, 6.9)
  place mane at (0, 0, 6.9)
  place ear at (1.4, -0.7, 19.4) pitch -16deg
  place ear at (-1.4, -0.7, 19.4) pitch -16deg
}`,

  b: (l) => base(l, 7.8, 3.0) + `
part shaft = stem(path: through((0,0,0), (0,0,8.6)), radius: 2.5, tip: 0.52, swell: 0.34, nodes: 2) in ${l.metal} satin
part neck  = band(radius: 1.75, width: 1.3, thickness: 0.55) in ${l.bright} polished
part mitre = bud(length: 8.4, width: 6.6, lobes: 2, lobeDepth: 0.22, point: 0.5) in ${l.metal} satin
part pip   = pearl(radius: 1.3) in ${l.bright} polished

form bishop {
  place base
  place shaft at (0, 0, 5.5)
  place neck at (0, 0, 13.8)
  place mitre at (0, 0, 14.2)
  place pip at (0, 0, 23.3)
}`,

  q: (l) => base(l, 8.4, 3.2) + `
part shaft = stem(path: through((0,0,0), (0,0,12.8)), radius: 2.7, tip: 0.48, swell: 0.36, nodes: 2) in ${l.metal} satin
part neck  = band(radius: 1.85, width: 1.4, thickness: 0.6) in ${l.bright} polished
part crown = bell(length: 4.8, mouth: 9.8, throat: 4.6, wall: 0.95, flare: 1.15) in ${l.metal} satin
part point = bead(radius: 0.85, point: 1.1) in ${l.bright} polished
part orb   = pearl(radius: 1.65) in ${l.bright} polished

form queen {
  place base
  place shaft at (0, 0, 5.7)
  place neck at (0, 0, 18.1)
  place crown at (0, 0, 18.4)
  repeat point around ring(9, radius: 4.5, z: 23.8)
  place orb at (0, 0, 25.0)
}`,

  k: (l) => base(l, 8.4, 3.2) + `
part shaft    = stem(path: through((0,0,0), (0,0,13.4)), radius: 2.7, tip: 0.48, swell: 0.36, nodes: 2) in ${l.metal} satin
part neck     = band(radius: 1.85, width: 1.4, thickness: 0.6) in ${l.bright} polished
part crown    = bell(length: 4.4, mouth: 9.4, throat: 4.8, wall: 0.95, flare: 1.1) in ${l.metal} satin
part point    = bead(radius: 0.8, point: 0.95) in ${l.bright} polished
part upright  = bar(length: 4.4, width: 1.45, thickness: 1.45, bevel: 0.3) in ${l.bright} polished
part crossarm = bar(length: 2.9, width: 1.45, thickness: 1.45, bevel: 0.3) in ${l.bright} polished

form king {
  place base
  place shaft at (0, 0, 5.7)
  place neck at (0, 0, 18.7)
  place crown at (0, 0, 19.0)
  repeat point around ring(9, radius: 4.4, z: 24.0)
  place upright at (0, 0, 27.0) pitch -90deg
  place crossarm at (0, 0, 27.6)
}`,
};

/** The sketch for one man: `type` is the usual letter, `colour` which army. */
export function pieceSketch(colour: 'w' | 'b', type: string): string {
  return bodies[type](LIVERY[colour]);
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
