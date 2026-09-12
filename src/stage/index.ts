/**
 * Where the set is drawn: the game path, with the still-life path behind it
 * for the photograph.
 *
 * The game was drawn by `render/` until now — one still picture, redrawn when
 * something changed, and beautiful. It is drawn by `game/` from here: every
 * frame, so the men can be carried to their squares rather than appearing on
 * them, under a pendant lamp with a cone and a shadow of its own, with the
 * legal squares lit rather than marked, and a little mist over the board to
 * carry the beam. What that costs is the enamel's glow, the pearls' orient,
 * the stones' fire and the table's reflection — one albedo and one roughness
 * a placement is all the game path holds — and what it buys back is a room
 * and movement, at a tenth of the cost a still frame was.
 *
 * The photograph is the other path, over the same device and the same canvas,
 * built the first time it is asked for: see `photo.ts`. Both are lit by the
 * same lamp, hung in the same place.
 *
 * Nothing here knows the rules. It takes men and where they stand, squares to
 * light, and men in flight; the game is `main.ts`'s.
 */

import { createContext, type GpuContext } from 'artshape-render/gpu/context';
import { Orbit } from 'artshape-render/gpu/camera';
import { bakeEnvironment } from 'artshape-render/render/env';
import { GameRenderer, type GameGroup } from 'artshape-render/game/renderer';
import { LightPool, type PointLight } from 'artshape-render/game/lights';
import type { InstanceGroup } from 'artshape-render/render/renderer';
import { TOP } from '../scene/scene';
import { asGameGroup } from './materials';
import { Photo, type Placed } from './photo';

/** A square to light, and how. */
export type Mark = 'chosen' | 'quiet' | 'capture' | 'last';

/** What the position wants lit, in board millimetres. */
export interface Lighting {
  chosen: Array<[number, number]>;
  quiet: Array<[number, number]>;
  capture: Array<[number, number]>;
  last: Array<[number, number]>;
  /** A man in flight or in hand, who carries a light with him. */
  carried: Array<[number, number, number]>;
}

const NOTHING: Lighting = { chosen: [], quiet: [], capture: [], last: [], carried: [] };

/**
 * The pendant, and where it hangs.
 *
 * Not over the middle. A lamp hung dead centre and aimed straight down puts
 * every man's shadow under his own base, where his base covers it, and the
 * board reads as though nothing with a direction is lighting it. Over a far
 * corner and tilted back at the middle, the same lamp rakes the whole board.
 */
const LAMP = {
  at: [45, 120, 240] as [number, number, number],
  aim: [0, 0, TOP] as [number, number, number],
  cone: [14, 30] as [number, number],
  intensity: 60,
  /** The shade's radius, for the photograph's penumbra. */
  radius: 14,
};

/**
 * The move lights. They hang low, so a pool is the square and not its
 * neighbours, and they are saturated rather than bright: at three times the
 * pendant the middle of a pool clips to white and a capture reads the same as
 * a quiet move.
 */
const MOVES = {
  height: 34,
  radius: 80,
  cone: [9, 20] as [number, number],
  chosen: { colour: [1, 0.7, 0.2] as [number, number, number], intensity: 34 },
  quiet: { colour: [0.45, 1, 0.5] as [number, number, number], intensity: 42 },
  capture: { colour: [1, 0.25, 0.16] as [number, number, number], intensity: 52 },
  last: { colour: [0.35, 0.55, 1] as [number, number, number], intensity: 14 },
};

/** How hard the machine is asked to work. */
export interface Economy {
  /** Whether the mist over the board is marched. It is the dearest thing here. */
  fog: boolean;
  /** Whether the dust a man raises is simulated and drawn. */
  particles: boolean;
  /** Bloom, the vignette and the grain. */
  post: boolean;
  /** Pixels drawn, as a fraction of the pane. */
  scale: number;
}

export interface StageOptions {
  onLost?(info: GPUDeviceLostInfo): void;
  /** Fired once, with how long the first frame took to land. */
  onFirstFrame?(ms: number): void;
  /** Every frame, before it is drawn: the game advances whatever it is moving. */
  onTick?(dt: number): void;
}

export class Stage {
  readonly ctx: GpuContext;
  readonly renderer: GameRenderer;
  readonly orbit: Orbit;
  readonly photo: Photo;
  private host: HTMLElement;
  private pool: LightPool;
  private lighting: Lighting = NOTHING;
  /** Which scene group is where in the renderer's dynamic pool. */
  private dynamicOf = new Map<number, number>();
  private opts: StageOptions;
  private economy: Economy = { fog: true, particles: true, post: true, scale: 1 };
  private lastFrame = performance.now();
  private watched: [number, number, number] = [0, 0, 0];
  private started = 0;
  private asked = 0;
  private landed = false;
  /** The last fenced measurement, in milliseconds a frame at 1080p. */
  msPerFrame = 0;

  static async create(host: HTMLElement, opts: StageOptions = {}): Promise<Stage> {
    const asked = performance.now();
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    const ctx = await createContext(canvas, opts.onLost);
    host.appendChild(canvas);
    const stage = new Stage(ctx, host, opts);
    await stage.renderer.ready;
    const env = bakeEnvironment(ctx, 'studio', { size: 64, mips: 5 });
    await env.samples;
    stage.renderer.setEnvironment(env.specular, env.brdf, env.mips);
    // what the first frame is timed from: asking for the device, not the
    // moment the loop was let go, which is a few milliseconds before it draws
    // and says nothing about what the page waited for
    stage.asked = asked;
    return stage;
  }

  private constructor(ctx: GpuContext, host: HTMLElement, opts: StageOptions) {
    this.ctx = ctx;
    this.host = host;
    this.opts = opts;
    this.renderer = new GameRenderer(ctx, 96, 8, 2048);
    this.photo = new Photo(ctx, ctx.canvas);
    this.photo.lamp = { at: LAMP.at, aim: LAMP.aim, cone: LAMP.cone, strength: 3.4, radius: LAMP.radius };
    this.pool = new LightPool(96);

    // a dark room with one lamp over the board, and the sky at a tenth
    this.renderer.look = {
      ...this.renderer.look,
      ambient: 0.11,
      background: [0.008, 0.008, 0.011],
      sunDir: [0.2, 0.35, 0.91],
      sunColour: [0.03, 0.033, 0.042],
      exposure: 1.15,
      falloffHalf: 150,
      spotSoftness: 1 / 60,
    };
    this.renderer.fog = {
      ...this.renderer.fog,
      density: 6e-4, base: TOP, height: 120,
      colour: [1, 0.97, 0.92], ambient: 0.012, anisotropy: 0.72,
      reach: 560, steps: 26,
      // how much a lamp scatters against what it lands on a surface. The
      // library's 1 is set for an arena's lamp six metres up; over a board,
      // where it hangs a quarter of a metre away, it turns the whole frame
      // grey.
      cones: 0.32,
    };
    this.renderer.setSunShadow({ min: [-160, -160, -10], max: [160, 160, 340] });

    const camera = this.renderer.camera;
    camera.fov = 34;
    camera.near = 20;
    camera.far = 2400;
    // the middle of the board, a little over its squares: what the view turns
    // about, and what the game frames itself against
    camera.target = [0, 0, TOP + 10];
    camera.position = [0, -300, 190];
    this.orbit = new Orbit(camera, {
      element: ctx.canvas, minDistance: 150,
      // far enough back that the board and both trays fit across a narrow
      // pane; the first version stopped at 900 and framed a tall window's
      // board as a postage stamp
      maxDistance: 2400,
      minPolar: 0.1, maxPolar: Math.PI / 2 - 0.06,
    });

    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
  }

  /**
   * Begin drawing. It is the caller's to start and not the constructor's: the
   * first frame asks the game where its men are, and a game whose own module
   * has not finished evaluating cannot answer — the first version drew before
   * `main.ts` had declared the men in flight, and died in the dark with the
   * loading spinner still up.
   */
  start() {
    if (this.started) return;
    this.started = performance.now();
    requestAnimationFrame(this.tick);
  }

  get camera() { return this.renderer.camera; }
  get canvas() { return this.ctx.canvas; }

  /**
   * The set, as the still path holds it: the board's groups go in as the half
   * that never moves, the men as the half that does, and the markers not at
   * all — the squares are lit here rather than marked.
   */
  setScene(groups: InstanceGroup[], roleOf: (index: number) => string) {
    const statics: GameGroup[] = [];
    const movers: GameGroup[] = [];
    this.dynamicOf.clear();
    groups.forEach((group, i) => {
      const role = roleOf(i);
      if (role === 'marker') return;
      if (role === 'board') { statics.push(asGameGroup(group)); return; }
      this.dynamicOf.set(i, movers.length);
      movers.push(asGameGroup(group));
    });
    this.renderer.setStatic(statics);
    this.renderer.setDynamic(movers);
    this.photo.setScene(groups);
  }

  /** Where the men stand now. */
  place(updates: Placed[]) {
    for (const placed of updates) {
      const index = this.dynamicOf.get(placed.group);
      if (index !== undefined) this.renderer.move(index, placed.matrices, placed.count);
    }
    if (this.photo.stage !== 'off') this.photo.restand(updates);
  }

  /** What the position wants lit. */
  light(lighting: Lighting) {
    this.lighting = lighting;
  }

  /** A puff of dust where a man is set down, or a spark where one is taken. */
  dust(at: [number, number, number], taken = false) {
    this.renderer.emit({
      position: [at[0], at[1], at[2] + 1],
      velocity: [0, 0, 26], spread: taken ? 34 : 18, count: taken ? 26 : 18,
      life: 0.5, lifeSpread: 0.4, size: 1.2, growth: 5,
      colour: taken ? [1, 0.42, 0.3] : [1, 0.92, 0.82], alpha: 0,
      gravity: 0.04, floor: at[2],
    });
  }

  /** Look at the board from behind one side's men. */
  face(azimuth: number, polar: number, radius: number) {
    this.orbit.setSpherical({ azimuth, polar, radius });
  }

  setEconomy(next: Partial<Economy>) {
    this.economy = { ...this.economy, ...next };
    this.renderer.economy = {
      ...this.renderer.economy,
      fog: this.economy.fog,
      particles: this.economy.particles,
      post: this.economy.post,
    };
    this.resize(true);
  }

  private resize(force = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * this.economy.scale;
    const width = Math.max(1, Math.round(this.host.clientWidth * dpr));
    const height = Math.max(1, Math.round(this.host.clientHeight * dpr));
    const canvas = this.ctx.canvas;
    if (!force && canvas.width === width && canvas.height === height) return;
    canvas.width = width; canvas.height = height;
    this.camera.aspect = width / height;
    this.renderer.resize(width, height);
    this.photo.resize(width, height);
  }

  /** Every light this frame: the pendant, the trays, and what the position asks for. */
  private lights(): number {
    const pool = this.pool;
    pool.clear();
    pool.add({
      position: LAMP.at, radius: 900, colour: [1, 0.93, 0.82], intensity: LAMP.intensity,
      direction: [-LAMP.at[0], -LAMP.at[1], TOP - LAMP.at[2]], cone: LAMP.cone,
    });
    // the trays, dimly: a set whose taken men are simply not there looks like
    // it is losing pieces rather than winning them
    for (const side of [1, -1]) {
      pool.add({
        position: [side * 190, 0, TOP + 150], radius: 260, colour: [0.85, 0.88, 1],
        intensity: 7, direction: [0, 0, -1], cone: [26, 52],
      });
    }
    const over = (x: number, y: number, z: number, kind: { colour: [number, number, number]; intensity: number }): PointLight => ({
      position: [x, y, z], radius: MOVES.radius, colour: kind.colour, intensity: kind.intensity,
      direction: [0, 0, -1], cone: MOVES.cone,
    });
    const l = this.lighting;
    for (const [x, y, z] of l.carried) pool.add(over(x, y, z + MOVES.height, MOVES.chosen));
    for (const [x, y] of l.quiet) pool.add(over(x, y, TOP + MOVES.height, MOVES.quiet));
    for (const [x, y] of l.capture) pool.add(over(x, y, TOP + MOVES.height, MOVES.capture));
    for (const [x, y] of l.chosen) pool.add(over(x, y, TOP + MOVES.height, MOVES.chosen));
    for (const [x, y] of l.last) pool.add(over(x, y, TOP + MOVES.height, MOVES.last));
    this.renderer.setLights(pool, [0]);
    return pool.count;
  }

  private tick = () => {
    this.resize();
    this.orbit.update();
    const now = performance.now();
    // a tab that was in the background hands back a step of seconds
    const dt = Math.min((now - this.lastFrame) / 1000, 1 / 15);
    this.lastFrame = now;
    this.opts.onTick?.(dt);

    const view = () => this.ctx.context.getCurrentTexture().createView();
    if (this.photo.stage === 'off') {
      this.lights();
      this.renderer.frame(view(), 'redraw', dt);
    } else {
      // the photograph is taken from wherever the game was being watched. The
      // threshold is a twentieth of a millimetre and not an epsilon: the orbit
      // eases toward its target and never exactly arrives, and a still
      // renderer told the view is moving never settles and never finishes.
      const turning = this.camera.position.some((v, i) => Math.abs(v - this.watched[i]) > 0.05);
      if (turning) this.photo.follow(this.camera);
      this.photo.render(view, turning);
    }
    this.watched = [...this.camera.position] as [number, number, number];
    if (!this.landed) {
      this.landed = true;
      this.opts.onFirstFrame?.(performance.now() - this.asked);
    }
    requestAnimationFrame(this.tick);
  };

  /**
   * What a frame costs, fenced on the queue at a size this names rather than
   * whatever the pane happens to be — a pane the browser is not showing lays
   * its canvas out at nothing, and a one-pixel frame reports the driver's
   * overhead as the scene's cost.
   */
  async measure(runs = 60, width = 1920, height = 1080): Promise<number> {
    const canvas = this.ctx.canvas;
    const was: [number, number] = [canvas.width, canvas.height];
    canvas.width = width; canvas.height = height;
    this.camera.aspect = width / height;
    this.renderer.resize(width, height);
    await this.ctx.device.queue.onSubmittedWorkDone();
    const start = performance.now();
    for (let i = 0; i < runs; i++) {
      this.lights();
      this.renderer.frame(this.ctx.context.getCurrentTexture().createView(), 'redraw', 1 / 60);
    }
    await this.ctx.device.queue.onSubmittedWorkDone();
    this.msPerFrame = (performance.now() - start) / runs;
    canvas.width = was[0]; canvas.height = was[1];
    this.camera.aspect = was[0] / was[1];
    this.renderer.resize(was[0], was[1]);
    this.photo.resize(was[0], was[1]);
    return this.msPerFrame;
  }

  /** Hand the board to the still-life renderer, or take it back. */
  async photograph(place: () => Placed[], bounds: { min: [number, number, number]; max: [number, number, number] }) {
    if (this.photo.stage !== 'off') { this.photo.close(); return false; }
    await this.photo.open(bounds, place, this.camera);
    return true;
  }

  trace() { this.photo.trace(); }
  get photographing() { return this.photo.stage !== 'off'; }
  get photoStatus() { return this.photo.status; }
}
