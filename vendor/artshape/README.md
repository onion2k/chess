# artshape, vendored

A copy of the artshape renderer and the language that feeds it, taken so
this game can be built and deployed on its own. Nothing here is chess.

Taken from `artshape` at commit `15f701eadc9213aaec8bcdc3276841e4789f482c`, September 2026.

## What was copied

`src/{gpu,geom,mesh,parts,pattern,assembly,render,dsl}`, verbatim, less
their `__tests__` directories. The editor, the spike catalogue and the
page are not here: the game writes its own sketches and drives the viewer
itself.

## What was changed

Four edits, all of them removals, so a later `diff` against artshape
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
4. **`Renderer.moveAll` was added** (and forwarded from the viewer), with
   `move` becoming a call to it. It writes several groups' matrices and
   then does what follows a placement — the scene bounds, the lights, the
   probe, the shadows — once rather than once per group. A man being
   dragged is a dozen meshes moving together, and a dozen separate
   `move` calls re-measured the whole scene a dozen times for every
   movement of the pointer: 15 ms a pointermove became 1.3 ms.

5. **A per-group draw count was added.** `InstanceGroup` takes an optional
   `count`: how many of its placements to draw, from the first. A program
   that keeps a pool of instances — room for every man a chess set could
   have, of which a third are ever on the board — now allocates the pool
   once and draws only the live end of it. Every pass honours it (the
   scene, the prepass, both shadow bakes, the cushion, the probe, the
   contact depth), as do `pick` and the scene's bounds. `move` and
   `moveAll` take a new count alongside the matrices, so a move can change
   how many are drawn in the same call. Here it took the geometry submitted
   each frame from 1.31M triangles to 186k.

Worth sending back to artshape: `moveAll` and `count` are both plain wins
for anything whose subject is a pool of parts that move together.

## A fix sent back

The black-frame bug this game found — every table but matte rendering the
whole frame black — was a real defect in `render/shaders.ts`, and it is
fixed in artshape as well as here. `seen` guarded its reflection ray with
`dir.z >= -1e-4`, a test a NaN passes rather than fails, so a ray that was
not a direction reached the table and every surface that reads the point it
is given answered NaN; that reached the light probe, which is prefiltered
and read by everything, and the picture went black. The guard is now
written so a NaN fails it. See artshape's ROADMAP for the whole account.
