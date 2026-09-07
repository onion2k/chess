# Chess

A game of chess played on a precious-metals set: Staunton men, six in
silver and six in gold, standing on an art deco board on a walnut table,
drawn by artshape — the renderer, vendored, with no editor and no
controls.

Played at **https://onion2k.github.io/chess/**, or run it yourself:

    npm install
    npm run dev

Needs WebGPU: a current Chrome, Edge or Safari.

## Playing

Pick a side and a level, and move. A man can be dragged — press on him
and he lifts off the board and follows the pointer — or clicked and then
clicked again on the square he is to go to. Either way the squares he may
go to light: a green disc for an empty square, a red ring round a man who
may be taken. The last move played keeps a blue-green ring at each end.

The view only moves while the meta key is held: ⌘-drag turns the board,
⌘-scroll comes closer, ⌘-right-drag pans. Without it the pointer belongs
to the board, so a drag across it never turns the view by accident. The
board is always seen from your own side, and turns round when you change
sides — which you may do until the first move is played, and not after.

All the rules are here: castling, taking in passing, promotion (the piece
is asked for), checkmate, stalemate, the fifty-move rule, threefold
repetition, and a draw when neither side has the material to mate. Men
taken are set down on the table beside the board.

**New game** starts again with the side, level and metals you have, and
leaves the view where you turned it. **Randomise** recasts the set: a new
metal for the board and one for each army, always a white metal against a
warm one so it is still plain whose man is whose — silver, platinum or
blackened steel against gold, copper, rose gold, brass or bronze. Only
the metal changes; the enamel, the pearls and the stones are as drawn.
**Reset** puts everything back to how the page opens: the opening
position, silver against gold on a gold board, and the view from behind
your own men.

## Graphics

The page measures the machine it opens on: once the set is on screen it
times a few frames and chooses. **Auto** is that choice — `balanced` on a
desktop, `fast` on a laptop with an integrated GPU, where the men are cast
with fewer triangles and drawn at fewer pixels. **Fine** is the renderer's
final quality at full detail, for looking at rather than playing on, and
is only ever chosen. The choice is kept across visits, and so is the
measurement, so the page opens at the right size before its first frame.
The note under the picker says what was measured, in milliseconds per
megapixel — and, below whichever tier is chosen, what the renderer has
had to give up to keep up: it times its frames as it goes, draws at fewer
pixels first, and then, one at a time, without the supersample, with
coarser soft shadows, without the contact shading, and with the men cast
at fewer triangles. It gives each back when there is room.

## The opponent

Five levels, in `src/chess/engine.ts`. All five are the same alpha-beta
search over the same move generator; what changes is how deep it looks,
whether it follows the exchanges to a quiet position, and how much noise
is added to its score — which is what makes a weak level miss things
rather than merely play slowly.

| Level | Depth | Quiescence | Noise | Budget |
| --- | --- | --- | --- | --- |
| Beginner | 1 | no | ±130cp | — |
| Casual | 2 | no | ±55cp | — |
| Club | 3 | yes | ±18cp | — |
| Strong | 4 | yes | none | 2s |
| Advanced | to 7 | yes | none | 4s |

The top two deepen while there is time and keep the last completed
depth. A mate that is seen is always played, however noisy the level.
The search runs in a worker, so the board stays turnable while it thinks.

## How it is put together

    src/chess/     the rules, the notation, the game, the engine, its worker
    src/scene/     the set as artshape sketches, and the set on the renderer
    src/ray.ts     a point on the canvas into a ray in the board's millimetres
    src/main.ts    the page: the look, the pointer, the panel
    vendor/        artshape, copied — see vendor/artshape/README.md

## The set

The men are Staunton: a stepped base under a hollow flare, a turned
baluster, and then the head that says what the man is — a ball for the
pawn, a battlement for the rook, a horse for the knight, a slit mitre for
the bishop, a coronet of points for the queen, a crown under a cross for
the king. They stand in the traditional order, the king half again as
tall as a square is wide and the rest stepped down from him, which a test
holds them to. The horse is cut the way a carver cuts one: a flat slab in
the piece's own plane, bent up the neck, over the poll and down the face.

The step in the base is cut deep enough to leave a shelf, and a ring of
enamel is let into it — cobalt for white, ruby for black. It is the one
colour on an otherwise plain man, and it is what tells the two armies
apart across the board where the metals alone read poorly at a low angle.
Nothing else on a man is enamelled and nothing is stone-set, so
**Randomise** recasts the whole man rather than part of him; the ring
keeps its colour, since that colour is which side he is on. The board
keeps its enamel squares and its onyx corners.

The board is in millimetres, as artshape's own sketches are: squares are
22 apart, their tops 6.8 above the table, a1 at (-77, -77).

The renderer draws instance groups, and a group's count is fixed once it
is built. So `src/scene/scene.ts` allocates every group once, at the
largest number of that man the rules allow — ten knights, if eight pawns
promote to knights — and gives a placement not in use a matrix of zero
scale. Moving a man is then writing matrices, never rebuilding a scene.
The men's groups are `dynamic`, which keeps them out of the sky occlusion
bake, so a move costs no bake at all.

## Checking it

    npm test          the rules, the notation, the engine, the game, the scene
    npm run typecheck

The move generator is held to perft: the opening position to depth 4,
and three of the standard awkward positions — Kiwipete, and two more full
of pins, en passant and promotion — to depth 3. Those counts are the one
test that catches a move generator's every lie, and they pass. The scene
is checked in node, which needs no GPU: the sketches compile, every man
stands with his foot on zero and inside his own square, and a move
reports only the groups it actually changed.

What the tests cannot see is the picture, which was checked in the
browser: the set stands and is lit, a man lifts and lands, the markers
fall on the right squares, the promotion is asked for, a takeback undoes
both plies, and the board turns round when you play black.

## What it costs to load

The bundle is 344 kB, 110 kB over the wire, and the game is on screen in
well under a tenth of a second on a warm device. Three things got it
there, and the numbers are worth keeping because each was measured rather
than guessed:

- **Only the men standing are drawn.** Every kind of man is allocated at
  the most of him the rules allow — nine queens, ten knights — but a game
  uses a third of that, and the renderer was drawing the whole pool every
  frame. `InstanceGroup.count` says how many placements are live, and the
  scene sets it as men are placed: **1.31M triangles a frame to 186k.**
- **The parts say how finely to build themselves.** Left to the defaults,
  a knight's ear 2.4 mm long came out at 2,808 triangles and a collar at
  3,584. Every part now names its `segments`, `sections` or `sides`:
  **145k distinct triangles to 59k**, and the meshes build in 38 ms rather
  than 70. Nothing shows at the distance the game is played from; the
  numbers were chosen by looking, close up and at the board.
- **The shaders are stripped of their comments at build time.** The WGSL
  carries a running commentary that is the best thing in the file to read
  and the worst thing to send — a fifth of the bundle, which the GPU never
  sees. `wgsl-minify.ts` takes it out of a production build only:
  **378 kB to 344 kB**, 123 kB to 110 kB gzipped.

## Deploying

Every push to `main` builds the game and puts it on GitHub Pages, by the
workflow in `.github/workflows/pages.yml`. The tests run first and the
build typechecks, so a push that breaks either never reaches the page.
Nothing in CI needs a GPU: the node suite covers the rules, the engine
and the scene, and the renderer is only exercised in a browser.

The built game is served from a project page, so `vite.config.ts` sets
`base` to `/chess/` for a build and leaves the dev server at the root.

## Licence

MIT — see [LICENSE](LICENSE). That covers the vendored copy of artshape
under `vendor/` as well as the game itself.
