/**
 * The set on the renderer: which instance group is which man, and where each
 * one stands.
 *
 * The renderer draws instance groups — one mesh, many placements — and a group
 * cannot change its count without being rebuilt. A chess set changes what
 * stands on the board every move but never what a rook is made of, so every
 * group here is allocated once, at the largest number of that man the rules
 * allow (ten knights, if eight pawns promote to knights), and a placement not
 * in use is given a matrix of zero scale: no area, no pixels, no cost beyond
 * its vertices.
 *
 * A man is made of several meshes — the foot, the inlay, the shaft, eight
 * colleted stones — so one man is a slice through several groups at the same
 * index. `locals` holds where each mesh sits within its man; the man's own
 * matrix multiplies through it.
 */

import { compile } from '../../vendor/artshape/dsl/index';
import { groupByMesh } from '../../vendor/artshape/assembly/groups';
import { multiply, translation } from '../../vendor/artshape/geom/transform';
import type { Mat4 } from '../../vendor/artshape/geom/transform';
import type { InstanceGroup } from '../../vendor/artshape/render/renderer';
import { PIECE_TYPES, fileOf, rankOf, type Colour, type PieceType } from '../chess/board';
import { BOARD, MARKERS, pieceSketch } from './sketches';

/** Millimetres between the centres of two squares. */
export const SQUARE = 22;
/** The centre of a1 in the board's own coordinates. */
export const A1 = -77;
/** The height of the top of a square: what a man stands on. */
export const TOP = 6.8;
/** How far a man rises when he is picked up. */
export const LIFT = 26;

export function squareCentre(sq: number): [number, number] {
  return [A1 + SQUARE * fileOf(sq), A1 + SQUARE * rankOf(sq)];
}

/** The most of one man a side can have: the two it starts with, plus eight promoted pawns. */
const CAPACITY: Record<PieceType, number> = { p: 8, n: 10, b: 10, r: 10, q: 9, k: 1 };

/** A man standing somewhere: everything the scene needs to draw him. */
export interface Standing {
  colour: Colour;
  type: PieceType;
  /** The centre of his foot, in board millimetres. */
  at: [number, number, number];
  /** Turned about the vertical, in radians: the black knights face the other way. */
  turn: number;
}

export type MarkerKind = 'quiet' | 'capture' | 'chosen' | 'last';
const MARKER_KINDS: MarkerKind[] = ['quiet', 'capture', 'chosen', 'last'];
const MARKER_CAPACITY: Record<MarkerKind, number> = { quiet: 32, capture: 16, chosen: 1, last: 2 };
const MARKER_ENAMEL: Record<MarkerKind, string> = { quiet: 'emerald', capture: 'coral', chosen: 'amber', last: 'peacock' };

/** A group of the renderer's, and where its mesh sits within the man it belongs to. */
interface Slice {
  group: number;
  locals: Mat4[];
}

interface Kind {
  slices: Slice[];
  capacity: number;
  /** How far the man reaches from his own axis, and how tall he stands. */
  radius: number;
  height: number;
}

const ZERO = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

/** A turn about the vertical, in the board's plane. */
export function turned(angle: number, x: number, y: number, z: number): Mat4 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
}

/**
 * Builds every group once. The board's groups come first and never move; then
 * the twelve kinds of man, each dynamic so that moving one does not begin the
 * sky occlusion bake again; then the markers.
 */
export class SetScene {
  readonly groups: InstanceGroup[] = [];
  private kinds = new Map<string, Kind>();
  private markers = new Map<MarkerKind, { slices: Slice[]; capacity: number }>();

  constructor() {
    for (const group of build(BOARD)) this.groups.push(group);

    for (const colour of ['w', 'b'] as Colour[]) {
      for (const type of PIECE_TYPES) {
        const capacity = CAPACITY[type];
        const slices: Slice[] = [];
        const { groups, bounds } = buildWithBounds(pieceSketch(colour, type));
        for (const group of groups) {
          const locals = split(group.matrices);
          slices.push({ group: this.groups.length, locals });
          this.groups.push({
            ...group,
            dynamic: true,
            matrices: blank(locals.length * capacity),
          });
        }
        this.kinds.set(colour + type, {
          slices, capacity,
          radius: Math.max(-bounds.min[0], bounds.max[0], -bounds.min[1], bounds.max[1]),
          height: bounds.max[2],
        });
      }
    }

    // the markers are told apart by their enamel rather than by the order the
    // groups come back in, so the sketch can be rewritten without silently
    // swapping green for red
    const markerGroups = build(MARKERS);
    for (const kind of MARKER_KINDS) {
      const capacity = MARKER_CAPACITY[kind];
      const group = markerGroups.find((g) => g.enamel === MARKER_ENAMEL[kind]);
      if (!group) throw new Error(`markers: no part enamelled ${MARKER_ENAMEL[kind]} for ${kind}`);
      const locals = split(group.matrices);
      this.markers.set(kind, { slices: [{ group: this.groups.length, locals }], capacity });
      this.groups.push({ ...group, dynamic: true, matrices: blank(capacity * locals.length) });
    }
  }

  /**
   * Stand these men, in this order, and nothing else. Two men of the same kind
   * keep their index between calls only as far as the caller's ordering does,
   * which is why the caller sorts by a stable identity: an instance that keeps
   * its index does not flicker through the contact shadow.
   */
  place(men: Standing[]) {
    const used = new Map<string, number>();
    const buffers = new Map<number, Float32Array>();
    const bufferFor = (group: number) => {
      let b = buffers.get(group);
      if (!b) { b = blank(this.groups[group].matrices.length / 16); buffers.set(group, b); }
      return b;
    };

    for (const man of men) {
      const key = man.colour + man.type;
      const kind = this.kinds.get(key)!;
      const index = used.get(key) ?? 0;
      if (index >= kind.capacity) continue;
      used.set(key, index + 1);
      const matrix = turned(man.turn, man.at[0], man.at[1], man.at[2]);
      for (const slice of kind.slices) {
        const buffer = bufferFor(slice.group);
        slice.locals.forEach((local, l) => {
          buffer.set(multiply(matrix, local), (index * slice.locals.length + l) * 16);
        });
      }
    }

    // only the groups that actually changed are reported: a man carried across
    // the board moves his own eight or so meshes, and telling the renderer
    // about the other ninety would have it re-measure the whole scene ninety
    // times for one movement of the pointer
    const touched: number[] = [];
    for (const kind of this.kinds.values()) {
      for (const slice of kind.slices) {
        const target = this.groups[slice.group].matrices;
        const buffer = buffers.get(slice.group) ?? blank(target.length / 16);
        if (same(target, buffer)) continue;
        target.set(buffer);
        touched.push(slice.group);
      }
    }
    return touched;
  }

  /** How wide and how tall one man stands, for the ray that has to find him under the pointer. */
  extent(colour: Colour, type: PieceType) {
    const kind = this.kinds.get(colour + type)!;
    return { radius: kind.radius, height: kind.height };
  }

  /**
   * Lay markers of one kind on these points; anything beyond the group's
   * capacity is dropped. Returns the group to write back, or -1 when the
   * markers are already where they are wanted.
   */
  mark(kind: MarkerKind, points: Array<[number, number, number]>): number {
    const entry = this.markers.get(kind)!;
    const slice = entry.slices[0];
    const buffer = blank(entry.capacity * slice.locals.length);
    points.slice(0, entry.capacity).forEach((p, i) => {
      slice.locals.forEach((local, l) => {
        buffer.set(multiply(translation(p), local), (i * slice.locals.length + l) * 16);
      });
    });
    const target = this.groups[slice.group].matrices;
    if (same(target, buffer)) return -1;
    target.set(buffer);
    return slice.group;
  }
}

function build(source: string) {
  return buildWithBounds(source).groups;
}

function buildWithBounds(source: string) {
  const { sketch, error } = compile(source);
  if (error) throw new Error(`sketch: ${error.formatted}`);
  return { groups: groupByMesh(sketch!.assembly), bounds: sketch!.assembly.bounds() };
}

function split(matrices: Float32Array): Mat4[] {
  const out: Mat4[] = [];
  for (let i = 0; i < matrices.length; i += 16) out.push(matrices.slice(i, i + 16));
  return out;
}

function same(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** `count` placements of no size: allocated, drawn, and covering nothing. */
function blank(count: number): Float32Array {
  const out = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) out.set(ZERO, i * 16);
  return out;
}
