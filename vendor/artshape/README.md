# artshape, vendored

A copy of the artshape renderer and the language that feeds it, taken so
this game can be built and deployed on its own. Nothing here is chess.

Taken from `artshape`, and kept current with it; the render, gpu, geom,
mesh, parts, pattern, assembly and dsl trees are copied whole. Level with
`69ee383`: the calibration and its ladder, the report, the first frame fenced,
every pipeline compiled off the main thread, the bakes following the
verdict, and the tracer fetched only when it is asked for.

## What was copied

`src/{gpu,geom,mesh,parts,pattern,assembly,render,dsl}`, verbatim, less
their `__tests__` directories. The editor, the spike catalogue and the
page are not here: the game writes its own sketches and drives the viewer
itself.

## What was changed

One edit. Everything else, `render/renderer.ts` and `render/viewer.ts`
included, is byte-identical to artshape's, so keeping this copy current
is a copy and never a patch.

1. **`dsl/examples.ts` is gone**, and `dsl/index.ts` no longer falls back
   to it when resolving a `use`. The game's own sketches live in
   `src/scene/sketches.ts`. This is the last difference, and it is really
   a fault upstream — the language defaulting to the page's own example
   sketches is the library reaching up into the application — so it should
   end with that default rather than with a local edit.
2. **Nothing else.** The path tracer was deleted here until artshape made
   it load on demand; `render/{tracer,bvh,scene.worker}.ts` are copied now
   and never fetched, since the game draws in raster and asks for a traced
   frame from nowhere. They cost the deployed site 59 kB it never sends
   and save every future change to `renderer.ts` from being applied twice
   by hand.

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
