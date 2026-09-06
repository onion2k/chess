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

Worth sending back to artshape: `moveAll` is a plain win for anything
whose subject is made of parts that move together.

## A bug found, not fixed

Every table but `matte` — oak, walnut, slate, linen, velvet, silk —
renders the whole frame black when the subject is as large as a
chessboard. It reproduces in artshape's own page on the `chess` example,
so it is not something this copy did; the game asks for `matte`.
