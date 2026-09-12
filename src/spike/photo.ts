/**
 * Photo mode: the same position, handed to the still-life renderer.
 *
 * The game path draws a lit room every frame and knows nothing about tables,
 * cushions, enamel or a path tracer. `render/` knows all four and is far too
 * dear to run at sixty frames a second — eleven milliseconds a megapixel on
 * the pixels it covers. So: play on one, photograph on the other, and the
 * switch between them is this file.
 *
 * Both renderers share one device and one canvas. The still path takes a
 * callback for the view it draws into rather than owning a canvas of its own,
 * which is what makes that possible — nothing here copies a frame anywhere.
 *
 * It is built on the first photograph and not before. A chess game that is
 * never photographed pays nothing for this; one that is pays a second or so,
 * once, and the tracer is fetched later still, only when a traced frame is
 * asked for. That is the same staging the library uses for the tracer itself.
 */

import type { Gpu } from 'artshape-render/gpu/context';
import type { Camera } from 'artshape-render/gpu/camera';
import { Renderer as StillRenderer, type InstanceGroup } from 'artshape-render/render/renderer';
import type { Box3 } from 'artshape-render/geom/types';

/** What a group's placements look like when the set says a man has moved. */
export interface Placed { group: number; matrices: Float32Array; count?: number }

export type Stage = 'off' | 'building' | 'raster' | 'tracing';

export class Photo {
  private renderer: StillRenderer | null = null;
  private built: Promise<StillRenderer> | null = null;
  stage: Stage = 'off';
  /**
   * What the shutter costs: building the renderer the first time, and the
   * time from asking for a photograph to the picture having stopped
   * changing — the bakes land in chunks, so the second is the one a player
   * would feel. Both in milliseconds.
   */
  timings = { build: 0, settle: 0 };
  private openedAt = 0;

  constructor(private ctx: Gpu, private canvas: HTMLCanvasElement) {}

  /**
   * Build the still renderer, once. The groups are the set's own — the same
   * meshes the game path draws, with the materials it cannot hold: enamel,
   * nacre, the stones, and a finish per part.
   */
  private build(groups: InstanceGroup[], bounds: Box3): Promise<StillRenderer> {
    if (this.built) return this.built;
    this.stage = 'building';
    const started = performance.now();
    this.built = (async () => {
      const renderer = new StillRenderer(this.ctx, {});
      await renderer.ready;
      renderer.setSize(this.canvas.width, this.canvas.height);
      // a bench, not a room: the piece on a table under a studio rig, which
      // is what this renderer is for and what the game path cannot do
      renderer.setEnvironment('studio');
      renderer.setTable('walnut');
      renderer.setKeyLight({ elevation: 0.72, azimuth: -0.6, strength: 1.15, warmth: 0.25, size: 0.22 });
      renderer.setFilm({ tonemap: 1, vignette: 0.28, grain: 0.18, fringe: 0.25 });
      renderer.setInstanced(groups);
      renderer.frameBounds(bounds);
      this.renderer = renderer;
      this.timings.build = performance.now() - started;
      return renderer;
    })();
    return this.built;
  }

  /**
   * Take over: build if this is the first time, stand the men where they
   * stand, and point the camera where the game's camera was pointing.
   */
  async open(groups: InstanceGroup[], bounds: Box3, place: () => Placed[], from: Camera) {
    const renderer = await this.build(groups, bounds);
    renderer.moveAll(place());
    this.follow(from);
    renderer.setQuality('final');
    renderer.requestRender();
    this.stage = 'raster';
    this.openedAt = performance.now();
    // timed afresh every photograph: the first pays for the bakes from
    // nothing, and a later one only for what the moved men changed
    this.timings.settle = 0;
  }

  close() {
    this.stage = 'off';
    this.renderer?.setQuality('draft');
  }

  /** The photograph is taken from where the game was being watched. */
  follow(from: Camera) {
    const r = this.renderer;
    if (!r) return;
    r.camera.position = [...from.position] as [number, number, number];
    r.camera.target = [...from.target] as [number, number, number];
    r.camera.fov = from.fov;
    r.requestRender();
  }

  /** Ask for the traced frame. It fetches the tracer the first time. */
  trace() {
    if (!this.renderer || this.stage === 'off') return;
    this.renderer.setQuality('traced');
    this.renderer.requestRender();
    this.stage = 'tracing';
  }

  resize(width: number, height: number) {
    this.renderer?.setSize(width, height);
  }

  /** One frame, if one is due. The still path is dirty-driven: it draws nothing when nothing changed. */
  render(view: () => GPUTextureView, moving: boolean): boolean {
    const r = this.renderer;
    if (!r || this.stage === 'off' || this.stage === 'building') return false;
    r.setMoving(moving);
    const drew = r.render(view);
    // the bakes land in chunks with gaps where nothing is due, so what is
    // timed is the whole settling and not the first frame of it
    if (!r.pending && !this.timings.settle && this.openedAt) this.timings.settle = performance.now() - this.openedAt;
    return drew;
  }

  /** What to say about it, for the page's own line of text. */
  get status(): string {
    const r = this.renderer;
    if (this.stage === 'building') return 'photo: building the bench…';
    if (!r) return '';
    const build = this.timings.settle
      ? `${Math.round(this.timings.build)} ms to build, ${Math.round(this.timings.settle)} to settle`
      : `built in ${Math.round(this.timings.build)} ms`;
    if (this.stage === 'tracing') {
      return r.traceSamples
        ? `photo: traced, ${r.traceSamples}/${r.traceLimit} samples · ${build}`
        : `photo: fetching the tracer… · ${build}`;
    }
    return r.pending ? `photo: settling… · ${build}` : `photo: still · ${build} · t to trace`;
  }
}
