/** Turning a point on the canvas into a ray in the board's own millimetres. */

import type { Camera } from '../vendor/artshape/gpu/camera';
import { invert } from '../vendor/artshape/geom/transform';
import type { Vec3 } from '../vendor/artshape/geom/types';

export interface Ray { origin: Vec3; direction: Vec3 }

export function rayThrough(camera: Camera, canvas: HTMLElement, x: number, y: number): Ray | null {
  camera.update();
  const inverse = invert(camera.viewProjection);
  if (!inverse) return null;
  const rect = canvas.getBoundingClientRect();
  const nx = ((x - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((y - rect.top) / rect.height) * 2;
  const near = unproject(inverse, nx, ny, 0);
  const far = unproject(inverse, nx, ny, 1);
  if (!near || !far) return null;
  return { origin: near, direction: [far[0] - near[0], far[1] - near[1], far[2] - near[2]] };
}

function unproject(inverse: Float32Array, x: number, y: number, z: number): Vec3 | null {
  const w = inverse[3] * x + inverse[7] * y + inverse[11] * z + inverse[15];
  if (Math.abs(w) < 1e-9) return null;
  return [
    (inverse[0] * x + inverse[4] * y + inverse[8] * z + inverse[12]) / w,
    (inverse[1] * x + inverse[5] * y + inverse[9] * z + inverse[13]) / w,
    (inverse[2] * x + inverse[6] * y + inverse[10] * z + inverse[14]) / w,
  ];
}

/** Where the ray crosses a level plane, or null if it runs along it or away from it. */
export function onPlane(ray: Ray, z: number): [number, number] | null {
  if (Math.abs(ray.direction[2]) < 1e-9) return null;
  const t = (z - ray.origin[2]) / ray.direction[2];
  if (t < 0) return null;
  return [ray.origin[0] + t * ray.direction[0], ray.origin[1] + t * ray.direction[1]];
}

/**
 * How far along the ray it first meets an upright cylinder — a man's rough
 * shape, which is all the pointer needs — or null. The cylinder stands on
 * `base` at (cx, cy), `radius` across and `height` tall.
 */
export function throughCylinder(ray: Ray, cx: number, cy: number, base: number, radius: number, height: number): number | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  const px = ox - cx, py = oy - cy;
  const a = dx * dx + dy * dy;
  let best: number | null = null;
  const consider = (t: number) => { if (t > 0 && (best === null || t < best)) best = t; };
  if (a > 1e-12) {
    const b = 2 * (px * dx + py * dy);
    const c = px * px + py * py - radius * radius;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
        const z = oz + t * dz;
        if (z >= base && z <= base + height) consider(t);
      }
    }
  }
  // the lid, for a ray looking down on him
  if (Math.abs(dz) > 1e-9) {
    const t = (base + height - oz) / dz;
    const x = px + t * dx, y = py + t * dy;
    if (x * x + y * y <= radius * radius) consider(t);
  }
  return best;
}
