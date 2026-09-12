/**
 * The lamp spike: the chess set drawn on the renderer's game path.
 *
 * The game has always been drawn by `render/`, the still-life path — one
 * piece, photographed, redrawn only when something changes. That path has no
 * cone lights, no fog and no particles, and it never will: they belong to
 * `game/`, which draws every frame. This page is the experiment that says
 * whether the set is still the set over there, and it is deliberately a
 * separate entry rather than a mode inside the game: nothing here touches
 * `main.ts`, and if the answer is no it is one directory to delete.
 *
 * Three things are being looked at, in this order.
 *
 * 1. **The material.** `render/` shades enamel, nacre, gems and metal with
 *    their own models and reflects a table in them. `game/` has one albedo
 *    and one roughness a placement, with `f0 = albedo`, so everything is a
 *    metal and an enamel is a flat colour. The men and the board are mapped
 *    across below, honestly, and the question is whether a silver knight
 *    still reads as silver.
 * 2. **The lamp.** A pendant over the middle of the board: a cone with a
 *    shadow map of its own, so the men throw long wedges outward and the
 *    edges of the table fall away into the dark.
 * 3. **The moves, as light.** The game marks legal squares with enamel discs
 *    laid on the board. Here each is a small cone hung over the square — warm
 *    for a quiet move, red for a capture, amber over the man in hand. Nothing
 *    is laid on the board at all.
 *
 * And the fog is what ties the first two together: the pendant's beam is
 * visible in the air above the board, which is the whole reason to hang a
 * lamp rather than to light from nowhere.
 */

import { createContext } from 'artshape-render/gpu/context';
import { Orbit } from 'artshape-render/gpu/camera';
import { bakeEnvironment } from 'artshape-render/render/env';
import { GameRenderer, type GameGroup } from 'artshape-render/game/renderer';
import { LightPool, type PointLight } from 'artshape-render/game/lights';
import { colourOf, square, squareFromName, typeOf, type Colour, type Move } from '../chess/board';
import { Game } from '../chess/game';
import { A1, SQUARE, SetScene, TOP, squareCentre, type Standing } from '../scene/scene';
import { onPlane, rayThrough } from '../ray';
import { asGameGroup } from './materials';

// --- the set ------------------------------------------------------------

const game = new Game();
const scene = new SetScene();

// The board never moves and the men do; the markers are not drawn at all,
// which is the point of the page.
const statics: GameGroup[] = [];
const movers: GameGroup[] = [];
/** Where a scene group ended up in the renderer's dynamic pool, or -1. */
const dynamicOf = new Map<number, number>();

scene.groups.forEach((group, i) => {
  const role = scene.roleOf(i);
  if (role === 'marker') return;
  if (role === 'board') { statics.push(asGameGroup(group)); return; }
  dynamicOf.set(i, movers.length);
  movers.push(asGameGroup(group));
});

/** Every man standing where he stands, as the game's own `standing` does it. */
function standing(): Standing[] {
  const men: Standing[] = [];
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = square(file, rank);
      const piece = game.position.board[sq];
      if (!piece) continue;
      const colour = colourOf(piece);
      const [x, y] = squareCentre(sq);
      men.push({ colour, type: typeOf(piece), at: [x, y, TOP], turn: colour === 'b' ? Math.PI : 0 });
    }
  }
  return men;
}

// --- the device ---------------------------------------------------------

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLElement;
const ctx = await createContext(canvas);
const renderer = new GameRenderer(ctx, 96, 8, 1024);
await renderer.ready;

const env = bakeEnvironment(ctx, 'studio', { size: 64, mips: 5 });
await env.samples;
renderer.setEnvironment(env.specular, env.brdf, env.mips);
renderer.setStatic(statics);
renderer.setDynamic(movers);

/**
 * A dim room with one lamp in it. The sun is nearly out — a chess set indoors
 * at night is lit by the pendant and by whatever the room gives back, which is
 * the environment at a tenth of its strength.
 */
renderer.look = {
  ...renderer.look,
  ambient: 0.11,
  background: [0.008, 0.008, 0.011],
  sunDir: [0.2, 0.35, 0.91],
  sunColour: [0.03, 0.033, 0.042],
  exposure: 1.15,
  // the board is 180 mm across: a light that halves over 150 of them pools
  // on the middle and leaves the corners to the ambient
  falloffHalf: 150,
  // a texel of the pendant's map per 60 mm of distance: the men's shadows
  // are sharp at the foot and soft by the time they reach the board's edge
  spotSoftness: 1 / 60,
};

/**
 * Mist enough to carry a beam over a board, and no more.
 *
 * `cones` is the number this page found the hard way. It says how much a
 * shadowed lamp puts into the air, against what that lamp puts on a surface —
 * and a lamp over a chessboard is 260 mm from everything it lights, where an
 * arena's lamp is six metres up. At the library's default of 1 the scattering
 * was some twenty times the surface lighting: the whole frame went grey and
 * the board looked like a photograph of fog. A third of that, over a third of
 * the density first tried, is a beam you can see and a room you can see
 * through. The lesson is general: `cones` is not a look, it is a ratio, and
 * it wants setting against the scale the lamp hangs at.
 */
renderer.fog = {
  ...renderer.fog,
  density: 6e-4,
  base: TOP,
  height: 120,
  colour: [1, 0.97, 0.92],
  ambient: 0.012,
  anisotropy: 0.72,
  reach: 560,
  steps: 26,
  cones: 0.32,
};

// the shadow map covers the board, the men on it, and the lamp above them
renderer.setSunShadow({ min: [-160, -160, -10], max: [160, 160, 340] });

// --- the camera ---------------------------------------------------------

const camera = renderer.camera;
camera.fov = 34;
camera.near = 20;
camera.far = 2400;
camera.target = [0, 0, TOP + 48];
camera.position = [0, -300, 190];
const orbit = new Orbit(camera, {
  element: canvas, minDistance: 150, maxDistance: 900,
  minPolar: 0.1, maxPolar: Math.PI / 2 - 0.06,
});
// low enough that the air over the board is in frame: the beam is half of
// what the lamp is for, and a view straight down the way sees none of it
orbit.setSpherical({ polar: 1.12, radius: 380 });

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (canvas.width === width && canvas.height === height) return;
  canvas.width = width; canvas.height = height;
  camera.aspect = width / height;
  renderer.resize(width, height);
}
window.addEventListener('resize', resize);

// --- the lights ---------------------------------------------------------

/**
 * The lamp, as numbers that can be turned while looking at it. They are on
 * `window` at the bottom of this file, which is how every one of them below
 * was arrived at: turn it in the console, look, keep what the eye keeps.
 */
const lamp = {
  /** How high over the board the pendant hangs, in millimetres. */
  height: 260,
  /**
   * Full strength within the first angle, nothing past the second. Nine and
   * twenty degrees at this height is a pool about 95 mm across against a
   * board 180 mm across — so the middle is lit, the outer files fall away,
   * and a light laid on one square has something to be brighter than. A cone
   * wide enough to cover the whole board was the first thing tried and it is
   * the reason the move lights below read as tints rather than as pools.
   */
  cone: [9, 20] as [number, number],
  intensity: 52,
};

/**
 * The move lights. They hang low — a hand's breadth over the square — so
 * their pool is the square and not its neighbours, and they are bright
 * against the pendant rather than beside it: a pool that only tints the
 * board reads as a dirty square rather than as a lit one.
 */
const moves = {
  height: 34,
  radius: 80,
  cone: [9, 20] as [number, number],
  // Bright enough to beat the pendant on the square it lands on, and no
  // brighter: at a hundred and ten the pool's middle clipped to white and a
  // capture read the same as a quiet move. Saturated beats bright.
  quiet: { colour: [0.45, 1, 0.5] as [number, number, number], intensity: 42 },
  capture: { colour: [1, 0.25, 0.16] as [number, number, number], intensity: 52 },
  chosen: { colour: [1, 0.7, 0.2] as [number, number, number], intensity: 34 },
  last: { colour: [0.35, 0.55, 1] as [number, number, number], intensity: 14 },
};
const pool = new LightPool(96);

/** A cone hung over a square, pointing straight down at it. */
function overSquare(sq: number, height: number, radius: number, colour: [number, number, number], intensity: number, cone: [number, number]): PointLight {
  const [x, y] = squareCentre(sq);
  return { position: [x, y, TOP + height], radius, colour, intensity, direction: [0, 0, -1], cone };
}

/**
 * Every light this frame. The pendant is index 0 and is the only one handed
 * to `setLights` as shadowed: it is the light the men stand in, and a map
 * costs a pass each. The move lights cast nothing — a cone over an empty
 * square has nothing to cast, and a cone over a man being taken should light
 * him, not be cut by him.
 */
function lights(): number[] {
  pool.clear();
  pool.add({
    position: [0, 0, TOP + lamp.height], radius: 900, colour: [1, 0.93, 0.82],
    intensity: lamp.intensity, direction: [0, 0, -1], cone: lamp.cone,
  });

  const options = chosen === null ? [] : game.legal().filter((m) => m.from === chosen);
  const quiet = new Set<number>(), capture = new Set<number>();
  for (const move of options) (move.captured ? capture : quiet).add(move.to);
  const put = (sq: number, kind: { colour: [number, number, number]; intensity: number }) =>
    pool.add(overSquare(sq, moves.height, moves.radius, kind.colour, kind.intensity, moves.cone));
  for (const sq of quiet) put(sq, moves.quiet);
  for (const sq of capture) put(sq, moves.capture);
  if (chosen !== null && options.length) put(chosen, moves.chosen);
  // the last move, dimly, at both ends
  if (last) for (const sq of [last.from, last.to]) put(sq, moves.last);

  renderer.setLights(pool, [0]);
  return [pool.count, options.length];
}

// --- playing ------------------------------------------------------------

let chosen: number | null = null;
let last: Move | null = null;

/** The square under the pointer, or null: the ray, met with the top of the board. */
function squareUnder(x: number, y: number): number | null {
  const ray = rayThrough(camera, canvas, x, y);
  if (!ray) return null;
  const hit = onPlane(ray, TOP);
  if (!hit) return null;
  const file = Math.round((hit[0] - A1) / SQUARE);
  const rank = Math.round((hit[1] - A1) / SQUARE);
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return square(file, rank);
}

function stand() {
  for (const placed of scene.place(standing())) {
    const index = dynamicOf.get(placed.group);
    if (index !== undefined) renderer.move(index, placed.matrices, placed.count);
  }
}

canvas.addEventListener('click', (e) => {
  const sq = squareUnder(e.clientX, e.clientY);
  if (sq === null) return;
  if (chosen !== null) {
    const move = game.legal().find((m) => m.from === chosen && m.to === sq);
    if (move) {
      game.play(move);
      last = move;
      chosen = null;
      stand();
      return;
    }
  }
  const piece = game.position.board[sq];
  chosen = piece && colourOf(piece) === (game.position.turn as Colour) ? sq : null;
});

// --- the frame ----------------------------------------------------------

let frames = 0;
let since = performance.now();
let fps = 0;
let fenced = 0;

function tick() {
  resize();
  orbit.update();
  const [count, moves] = lights();
  renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', 1 / 60);

  frames++;
  const now = performance.now();
  if (now - since > 500) {
    fps = Math.round((frames * 1000) / (now - since));
    frames = 0; since = now;
    hud.textContent = `${fps} fps · ${count} lights (${moves} moves lit)`
      + (fenced ? ` · ${fenced.toFixed(2)} ms fenced` : ' · press m to measure')
      + ` · ${game.position.turn === 'w' ? 'white' : 'black'} to move`;
  }
  requestAnimationFrame(tick);
}

/**
 * What a frame actually costs, fenced on the queue rather than counted by
 * `requestAnimationFrame` — which measures how often the browser felt like
 * compositing, and reads as sixty however slow the frame is, or as nothing at
 * all in a pane that is not on screen.
 */
async function measure(runs = 90) {
  await ctx.device.queue.onSubmittedWorkDone();
  const start = performance.now();
  for (let i = 0; i < runs; i++) {
    lights();
    renderer.frame(ctx.context.getCurrentTexture().createView(), 'redraw', 1 / 60);
  }
  await ctx.device.queue.onSubmittedWorkDone();
  fenced = (performance.now() - start) / runs;
  console.log(`lamp spike: ${fenced.toFixed(3)} ms a frame at ${canvas.width}×${canvas.height}, ${pool.count} lights`);
  return fenced;
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'm') void measure();
  if (e.key === 'f') renderer.fog = { ...renderer.fog, density: renderer.fog.density > 0 ? 0 : 9e-4 };
  if (e.key === 'l') renderer.economy = { ...renderer.economy, points: renderer.economy.points === false };
});

resize();
stand();
tick();

// for driving it from a console, and from a test
/** Choose a man by the square he stands on, for driving the page from a console. */
function select(name: string) {
  const sq = squareFromName(name);
  chosen = sq >= 0 && game.position.board[sq] ? sq : null;
  return chosen;
}

/** Play a move by the squares it runs between, as the click does. */
function play(from: string, to: string) {
  const move = game.legal().find((m) => m.from === squareFromName(from) && m.to === squareFromName(to));
  if (!move) return null;
  game.play(move);
  last = move;
  chosen = null;
  stand();
  return move;
}

Object.assign(window as unknown as Record<string, unknown>, { renderer, camera, orbit, game, lamp, moves, measure, select, play });
