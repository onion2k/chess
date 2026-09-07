# artshape, vendored

A copy of the artshape renderer and the language that feeds it, taken so
this game can be built and deployed on its own. Nothing here is chess.

Taken from `artshape` at commit `15f701eadc9213aaec8bcdc3276841e4789f482c`, September 2026;
`gpu/context.ts`, `render/viewer.ts`, `render/calibrate.ts`,
`render/shaders.ts` and the calibration's edits to `render/renderer.ts`
(two getters, the economy, the frame's `shadowTaps`) brought up to
`56a7490`: the calibration, the ladder, `pending` counting a bake between its chunks, and a fallback adapter starting low.

## What was copied

`src/{gpu,geom,mesh,parts,pattern,assembly,render,dsl}`, verbatim, less
their `__tests__` directories. The editor, the spike catalogue and the
page are not here: the game writes its own sketches and drives the viewer
itself.

## What was changed

Three edits, all of them removals, so a later `diff` against artshape
stays readable:

1. **The path tracer is gone.** `render/tracer.ts`, `render/bvh.ts` and
   `render/scene.worker.ts` were deleted, along with everything in
   `render/renderer.ts` that reached for them: the imports, the
   `traced` member of `Quality`, the scene-building and sample steps,
   and the `pathTracer` accessor. The game draws in draft raster and
   would never have started a trace.
2. **`render/viewer.ts`** lost the two getters that reported the tracer's
   sample count.
3. **`dsl/examples.ts` is gone**, and `dsl/index.ts` no longer falls back
   to it when resolving a `use`. The game's own sketches live in
   `src/scene/sketches.ts`.
4. **Nothing else.** `Renderer.moveAll` and the per-group draw `count` were
   written here first and are now upstream in artshape, with tests, so they
   are no longer differences — the code either side is the same but for the
   tracer line in `moveAll`, which only artshape has.

## Sent back

Three things this game found or grew have gone into artshape itself.

`Renderer.moveAll` writes several groups' matrices and then does what
follows a placement once. One man is a dozen meshes, and a dozen separate
`move` calls re-measured the whole scene a dozen times for every movement
of the pointer: 15 ms a pointermove, 1.3 ms with the batch.

`InstanceGroup.count` says how many of a group's placements are live. The
pool here is three times what a game uses — room for nine queens, standing
one — and the rest were hidden at zero scale, which draws them all the
same: no pixels, every vertex, every frame. 1.31M triangles a frame to
186k.

And the black-frame bug this game found — every table but matte rendering the
whole frame black — was a real defect in `render/shaders.ts`, and it is
fixed in artshape as well as here. `seen` guarded its reflection ray with
`dir.z >= -1e-4`, a test a NaN passes rather than fails, so a ray that was
not a direction reached the table and every surface that reads the point it
is given answered NaN; that reached the light probe, which is prefiltered
and read by everything, and the picture went black. The guard is now
written so a NaN fails it. See artshape's ROADMAP for the whole account.
