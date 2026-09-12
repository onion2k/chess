# Chess

[![Pages](https://github.com/onion2k/chess/actions/workflows/pages.yml/badge.svg)](https://github.com/onion2k/chess/actions/workflows/pages.yml)

A game of chess played on a precious-metals set: Staunton men, six in
silver and six in gold, standing on an art deco board on a walnut table,
drawn by artshape-render, with no editor and no controls.

Played at **https://onion2k.github.io/chess/**, or run it yourself:

    npm install
    npm run dev

Needs WebGPU: a current Chrome, Edge or Safari.

## Playing

Pick a side and a level, and move. A man can be dragged — press on him
and he lifts off the board and follows the pointer — or clicked and then
clicked again on the square he is to go to. Either way the squares he may
go to light — and they are lit, not marked: a pool of green over an empty
square, red over a man who may be taken, amber under the man in hand, and
a dim blue at both ends of the last move played. He is then carried to
his square rather than appearing on it, and a man taken is swept off to
the tray beside the board.

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
times sixty frames, fenced on the queue and at 1920×1080 rather than at
whatever the pane happens to be, and chooses. **Auto** is that choice —
`fine` under three milliseconds a frame, `balanced` under seven, `fast`
past that, where the men are cast with fewer triangles, the mist over the
board is turned off and the frame is drawn at three quarters of the
pixels. The choice is kept across visits. The note under the picker says
what was measured and what is being given up for it; clicking it copies a
report — the adapter, the frame time, the tier, the detail — to paste to
whoever is tuning it.

There is no ladder. The still-life renderer had one, climbed and given
back as a frame allowed, because a still frame of this set cost some
twenty milliseconds; the game path draws one in two or three, and a thing
that never runs out of room does not need a ladder to climb.

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
    src/scene/     the set as sketches, and the set on the renderer
    src/stage/     where it is drawn: the game path, and the photograph
    src/ray.ts     a point on the canvas into a ray in the board's millimetres
    src/main.ts    the page: the game, the pointer, the panel

The drawing is all `artshape-render`, a dependency: the parts, the
assembly, the language and the renderer. It was vendored into `vendor/`
until September 2026, when it became a repository of its own — this game
having been the argument that it was a library.

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

The bundle is 428 kB, 137 kB over the wire, and the game is on screen in
about a quarter of a second on a warm device. It carries both renderers:
the game path the set is played on and the still-life path it is
photographed on, the second of which is built only when the Photograph
button is first pressed. It sends none of the path
tracer: the renderer fetches that on the first traced frame, and the game
asks for one from nowhere, so its 46 kB sits on the server unread. Three
things got the rest of it there, and the numbers are worth keeping
because each was measured rather than guessed:

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
  **a tenth of the bundle**, and it costs the reader nothing.

## How it is drawn

The set is drawn on the library's **game path** — `game/`, which draws
every frame — and photographed on its **still-life path**, `render/`,
which draws one picture beautifully. Both live in `src/stage/`, over one
device and one canvas.

**Playing.** A pendant hangs over a far corner of the board and is tilted
back at the middle: a cone with a shadow map of its own, so the men throw
wedges that soften with the distance from the lamp, and with a little
mist in the air the beam is visible over the board. Where it hangs is not
a detail — dead centre and aimed straight down, every man's shadow falls
under his own base, where his base covers it, and the board looks unlit
by anything with a direction.

The legal squares are **lit rather than marked**: a small cone hung a
hand's breadth over each, green for a quiet move, red for a capture,
amber under the man in hand and blue at both ends of the last move. Two
things had to be right. The pendant must not light the whole board, or a
pool has nothing to be brighter than; and a pool must be saturated rather
than bright, because at three times the pendant its middle clips to white
and a capture reads like a quiet move.

And the men **move**: lifted, carried along an eased arc and set down,
the rook going with his king in a castling, the man taken swept off to
his tray rather than vanishing under the man who took him, and a little
dust where each lands. The rules do not wait for any of it — the move is
played the moment it is made, and only the drawing lags, because an
animation the rules wait on is an animation that can lose a click.

What that costs, fenced at 1920×1080, medians of five runs of sixty
frames with the set standing at the opening position: **1.61 ms a frame**
with everything on, 0.80 without the mist, 0.70 without the film as well.
So the mist is half the frame and everything else together is the other
half, and a machine that cannot hold sixty frames a second here is a
machine that cannot draw a board at all. The
still-life path's shader is about 11 ms a megapixel — some 23 ms at that
size — which it affords by drawing only when something changes.

**Photographing.** The Photograph button hands the same position to
`render/`: the same table, the same lamp, and the enamel over its metal,
the stones, the contact shadow and the table's reflection that one albedo
and one roughness a placement cannot hold. `t` then fetches the path
tracer and accumulates toward a thousand samples. The still renderer is
built on the first photograph and not before — 63 ms to build, the
picture at once, four seconds or so for the bakes to settle, 1.2 s to the
first traced sample — so a game that is never photographed pays nothing
for it.

**One trap, written down because it cost an hour.** The orbit eases
toward its target and never exactly arrives, so a test for "has the
camera moved at all" answers yes for ever, and a still renderer told the
view is moving never settles, never bakes and never finishes its picture.
The threshold is a twentieth of a millimetre, not an epsilon.

## Deploying

Every push to `main` builds the game and puts it on GitHub Pages, by the
workflow in `.github/workflows/pages.yml`. The tests run first and the
build typechecks, so a push that breaks either never reaches the page.
Nothing in CI needs a GPU: the node suite covers the rules, the engine
and the scene, and the renderer is only exercised in a browser.

The built game is served from a project page, so `vite.config.ts` sets
`base` to `/chess/` for a build and leaves the dev server at the root.

## Licence

MIT — see [LICENSE](LICENSE).
