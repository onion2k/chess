# Chess

A game of chess played on a precious-metals set: six men in silver and
six in gold, enamelled and stone-set, standing on an art deco board,
drawn by [artshape](https://github.com/) — the renderer, vendored, with
no editor and no controls.

    npm install
    npm run dev

Needs WebGPU: a current Chrome, Edge or Safari.

## Playing

Pick a side and a level, and move. A man can be dragged — press on him
and he lifts off the board and follows the pointer — or clicked and then
clicked again on the square he is to go to. Either way the squares he may
go to light: a green disc for an empty square, a red ring round a man who
may be taken. The last move played keeps a blue-green ring at each end.

Dragging anywhere but on your own man turns the view; the right button
pans, the wheel comes closer. The board is always seen from your own
side, and turns round when you change sides.

All the rules are here: castling, taking in passing, promotion (the piece
is asked for), checkmate, stalemate, the fifty-move rule, threefold
repetition, and a draw when neither side has the material to mate. Men
taken are set down on the table beside the board.

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
