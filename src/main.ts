/**
 * A game of chess on artshape's renderer.
 *
 * There are no rendering controls: the light, the table, the lens and the film
 * are set once, to the values the artshape page opens with, and then left
 * alone. Everything the page does after that is chess — which man is where,
 * which squares he may go to, and whose turn it is.
 */

import { Viewer } from '../vendor/artshape/render/viewer';
import { setDetail } from '../vendor/artshape/mesh/detail';
import {
  colourOf, legalMoves, square, squareFromName, squareName, toFen, typeOf,
  type Colour, type Move, type PieceType,
} from './chess/board';
import { Game } from './chess/game';
import { LEVELS } from './chess/engine';
import type { Answer, Ask } from './chess/engine.worker';
import { A1, LIFT, SQUARE, SetScene, TOP, squareCentre, type MarkerKind, type Standing } from './scene/scene';
import { onPlane, rayThrough, throughCylinder } from './ray';

// Draft detail: half the triangles on every part. It must be set before any
// mesh is built, which is before the scene below is put together.
setDetail(0.5);

const stage = document.getElementById('stage') as HTMLElement;
const panel = {
  sides: document.getElementById('sides') as HTMLElement,
  level: document.getElementById('level') as HTMLSelectElement,
  fresh: document.getElementById('new') as HTMLButtonElement,
  undo: document.getElementById('undo') as HTMLButtonElement,
  status: document.getElementById('status') as HTMLElement,
  moves: document.getElementById('moves') as HTMLElement,
  promotion: document.getElementById('promotion') as HTMLElement,
};

LEVELS.forEach((level, i) => {
  const option = document.createElement('option');
  option.value = String(i);
  option.textContent = level.name;
  panel.level.append(option);
});

const viewer = await Viewer.create(stage, (info) => {
  panel.status.querySelector('.who')!.textContent = 'The graphics device was lost';
  panel.status.querySelector('.note')!.textContent = info.message || 'reload the page';
});

// the look, once: the artshape page's own opening settings
viewer.setQuality('draft');
viewer.setEnvironment('studio');
viewer.setEnvStrength(0.3);
viewer.setKeyLight({ elevation: Math.PI / 4, azimuth: -Math.PI / 4, strength: 1, warmth: 0.3, size: 0.08 });
// matte, not one of the wood or cloth tables: at this size — a board three
// hundred millimetres across — the procedural tables render the whole frame
// black, in artshape's own page as well as here
viewer.setTable('matte');
viewer.setLens(46);
viewer.setFilm({ tonemap: 1, vignette: 0.3, grain: 0.25, fringe: 0.3 });

const scene = new SetScene();
viewer.setInstanced(scene.groups);

/** The board with its border and a little air, which the camera has to hold. */
const BOARD_BOUNDS = { min: [-150, -150, 0] as [number, number, number], max: [150, 150, 34] as [number, number, number] };

// --- the game ------------------------------------------------------------

let game = new Game();
let human: Colour = 'w';
let level = 2;
/** The square of the man in hand, chosen by a click or held in a drag. */
let chosen: number | null = null;
/** Where the man in hand is, while the pointer carries him. */
let carrying: { from: number; at: [number, number, number]; travelled: number } | null = null;
let lastMove: Move | null = null;
/** A promotion waiting on the player's choice. */
let promoting: { moves: Move[] } | null = null;
let thinking = false;

const worker = new Worker(new URL('./chess/engine.worker.ts', import.meta.url), { type: 'module' });
/** Numbers each question to the engine: an answer to a question since abandoned is dropped. */
let asked = 0;

worker.addEventListener('message', (e: MessageEvent<Answer>) => {
  const answer = e.data;
  // an answer to a question since abandoned — a new game, a takeback, a change
  // of side — is dropped, and does not clear a search that has replaced it
  if (answer.id !== asked) return;
  thinking = false;
  if (!answer.move) { refresh(); return; }
  const from = squareFromName(answer.move.slice(0, 2));
  const to = squareFromName(answer.move.slice(2, 4));
  const promotion = answer.move[4] as PieceType | undefined;
  const move = game.legal().find((m) => m.from === from && m.to === to && m.promotion === promotion);
  if (move) {
    lastMove = move;
    game.play(move);
    engineNote = `${LEVELS[level].name}: depth ${answer.depth}, ${answer.nodes.toLocaleString()} positions in ${Math.round(answer.ms)} ms`;
  }
  refresh();
  maybeThink();
});

let engineNote = '';

function maybeThink() {
  if (game.outcome().over || game.position.turn === human || thinking) return;
  thinking = true;
  const ask: Ask = { fen: toFen(game.position), level, id: ++asked };
  worker.postMessage(ask);
  refresh();
}

// --- what stands where ---------------------------------------------------

/** Where a man taken from the board is set down, beside the board on his own side. */
function trayPlace(colour: Colour, index: number): [number, number, number] {
  const column = Math.floor(index / 8);
  const side = colour === 'w' ? 1 : -1;
  return [side * (168 + column * 22), (77 - (index % 8) * 22) * side, 0];
}

function standing(): Standing[] {
  const men: Standing[] = [];
  const turn = (colour: Colour) => (colour === 'b' ? Math.PI : 0);
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = square(file, rank);
      const piece = game.position.board[sq];
      if (!piece) continue;
      const colour = colourOf(piece);
      const [x, y] = squareCentre(sq);
      const at: [number, number, number] = carrying && carrying.from === sq ? carrying.at : [x, y, TOP];
      men.push({ colour, type: typeOf(piece), at, turn: turn(colour) });
    }
  }
  const taken = { w: 0, b: 0 };
  for (const man of game.captured()) {
    men.push({ ...man, at: trayPlace(man.colour, taken[man.colour]++), turn: turn(man.colour) });
  }
  return men;
}

/** The squares the man in hand may go to, as moves. */
function movesFrom(sq: number | null): Move[] {
  if (sq === null || game.position.turn !== human || game.outcome().over) return [];
  return game.legal().filter((m) => m.from === sq);
}

function markSquares(kind: MarkerKind, squares: number[], lift: number) {
  const group = scene.mark(kind, squares.map((sq) => {
    const [x, y] = squareCentre(sq);
    return [x, y, TOP + lift] as [number, number, number];
  }));
  if (group >= 0) viewer.move(group, scene.groups[group].matrices);
}

/**
 * Everything on screen, from the position. `silent` leaves the panel alone: a
 * man being carried moves many times a second and nothing in the panel is
 * changing while he does.
 */
function refresh(silent = false) {
  viewer.moveAll(scene.place(standing()).map((group) => ({ group, matrices: scene.groups[group].matrices })));

  const options = movesFrom(chosen);
  markSquares('last', lastMove ? [lastMove.from, lastMove.to] : [], 0.25);
  markSquares('chosen', chosen !== null && options.length ? [chosen] : [], 0.45);
  // one marker per destination square, not per move: four promotions are one square
  const quiet = new Set<number>(), capture = new Set<number>();
  for (const move of options) (move.captured ? capture : quiet).add(move.to);
  markSquares('quiet', [...quiet], 0.45);
  markSquares('capture', [...capture], 0.45);

  viewer.requestRender();
  if (!silent) drawPanel();
}

// --- the panel -----------------------------------------------------------

function drawPanel() {
  const outcome = game.outcome();
  const who = panel.status.querySelector('.who') as HTMLElement;
  const note = panel.status.querySelector('.note') as HTMLElement;
  panel.status.classList.toggle('over', outcome.over);
  if (outcome.over) {
    who.textContent = outcome.reason === 'checkmate'
      ? `${outcome.winner === human ? 'You win' : 'You lose'} — checkmate`
      : `Drawn — ${outcome.reason}`;
    note.textContent = `${game.history.length} moves played`;
  } else if (thinking) {
    who.textContent = `${LEVELS[level].name} is thinking…`;
    note.textContent = engineNote;
  } else {
    const yours = game.position.turn === human;
    who.textContent = yours ? 'Your move' : 'Their move';
    note.textContent = engineNote;
  }

  panel.undo.disabled = !game.history.length || thinking;
  [...panel.sides.children].forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.side === human));
  panel.level.value = String(level);

  const rows: string[] = [];
  for (let i = 0; i < game.history.length; i += 2) {
    const latest = i + 2 > game.history.length - 1;
    rows.push(`<tr${latest ? ' class="latest"' : ''}><td class="n">${i / 2 + 1}.</td>`
      + `<td class="m${i === game.history.length - 1 ? ' live' : ''}">${game.history[i].san}</td>`
      + `<td class="m${i + 1 === game.history.length - 1 ? ' live' : ''}">${game.history[i + 1]?.san ?? ''}</td></tr>`);
  }
  panel.moves.innerHTML = rows.length ? `<table>${rows.join('')}</table>` : '';
  panel.moves.scrollTop = panel.moves.scrollHeight;
}

// --- the camera ----------------------------------------------------------

/** How high the camera stands over the board, in radians from the table. */
const ELEVATION = 0.72;

/**
 * How far back everything fits, in this pane, at this lens. Across the frame
 * that is the board and the two trays of taken men beside it; up it is the
 * board seen at a slant, which is shorter than the board is deep.
 */
function distanceForBoard() {
  const tan = Math.tan((viewer.camera.fov * Math.PI) / 360);
  const aspect = Math.max(0.2, stage.clientWidth / Math.max(1, stage.clientHeight));
  const across = 205 / (tan * aspect);
  const up = (158 * Math.sin(ELEVATION) + 24) / tan;
  return Math.max(across, up) * 1.06;
}

function faceTheBoard() {
  // the player looks down the board from behind his own men
  viewer.frameBounds(BOARD_BOUNDS);
  viewer.setView({ elevation: ELEVATION, azimuth: human === 'w' ? -Math.PI / 2 : Math.PI / 2, distance: distanceForBoard() });
}

// a pane that changes shape changes what fits: the board is reframed, but only
// as far as the distance, so a view the player has turned stays turned
new ResizeObserver(() => viewer.setView({ distance: distanceForBoard() })).observe(stage);

// --- the pointer ---------------------------------------------------------

/**
 * The square under the pointer: the man standing on it if the ray meets one,
 * and otherwise the square of the board the ray crosses.
 *
 * `boardOnly` skips the men, for a man already in hand. Where he lands should
 * follow the pointer over the board and nothing else — a tall king standing
 * between the pointer and the square he is being carried to must not steal
 * the drop.
 */
function squareUnder(event: { clientX: number; clientY: number }, boardOnly = false): number | null {
  const ray = rayThrough(viewer.camera, stage, event.clientX, event.clientY);
  if (!ray) return null;

  let best: { t: number; square: number } | null = null;
  if (!boardOnly) for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = square(file, rank);
      const piece = game.position.board[sq];
      if (!piece || (carrying && carrying.from === sq)) continue;
      const { radius, height } = scene.extent(colourOf(piece), typeOf(piece));
      const [x, y] = squareCentre(sq);
      const t = throughCylinder(ray, x, y, TOP, Math.min(radius, SQUARE / 2), height);
      if (t !== null && (!best || t < best.t)) best = { t, square: sq };
    }
  }
  if (best) return best.square;


  const point = onPlane(ray, TOP);
  if (!point) return null;
  const file = Math.round((point[0] - A1) / SQUARE);
  const rank = Math.round((point[1] - A1) / SQUARE);
  return file >= 0 && file < 8 && rank >= 0 && rank < 8 ? square(file, rank) : null;
}

/** Where the man in hand should hang: over the board at the pointer, a lift above it. */
function carriedTo(event: PointerEvent): [number, number, number] {
  const ray = rayThrough(viewer.camera, stage, event.clientX, event.clientY);
  const point = ray && onPlane(ray, TOP + LIFT);
  if (!point) return carrying!.at;
  const clamp = (v: number) => Math.max(A1 - SQUARE, Math.min(-A1 + SQUARE, v));
  return [clamp(point[0]), clamp(point[1]), TOP + LIFT];
}

/** Play a move, or ask which piece a promoting pawn becomes. */
function attempt(from: number, to: number) {
  const moves = game.legal().filter((m) => m.from === from && m.to === to);
  if (!moves.length) return false;
  if (moves.length > 1 && moves[0].promotion) {
    promoting = { moves };
    panel.promotion.classList.add('open');
    return true;
  }
  playHuman(moves[0]);
  return true;
}

function playHuman(move: Move) {
  lastMove = move;
  game.play(move);
  chosen = null;
  carrying = null;
  engineNote = '';
  refresh();
  maybeThink();
}

stage.addEventListener('pointerdown', (event: PointerEvent) => {
  if (event.button !== 0 || promoting) return;
  if (event.target !== stage && !(event.target instanceof HTMLCanvasElement)) return;
  if (game.outcome().over || game.position.turn !== human || thinking) return;

  const sq = squareUnder(event);
  if (sq === null) return;

  // a square already offered: this is the second click of a click and a click
  if (chosen !== null && movesFrom(chosen).some((m) => m.to === sq)) {
    event.stopPropagation();
    attempt(chosen, sq);
    return;
  }

  const piece = game.position.board[sq];
  if (!piece || colourOf(piece) !== human) { chosen = null; refresh(); return; }

  // his own man: pick him up. The orbit never sees this press, so dragging
  // over the board carries the man rather than turning the view
  event.stopPropagation();
  chosen = sq;
  const [x, y] = squareCentre(sq);
  carrying = { from: sq, at: [x, y, TOP + LIFT], travelled: 0 };
  stage.classList.add('grabbing');
  // a synthesised pointer has no capture to take; the drag works without it
  try { stage.setPointerCapture(event.pointerId); } catch { /* not a real pointer */ }
  refresh();
});

stage.addEventListener('pointermove', (event: PointerEvent) => {
  if (carrying) {
    carrying.travelled += Math.abs(event.movementX) + Math.abs(event.movementY);
    carrying.at = carriedTo(event);
    refresh(true);
    return;
  }
  if (promoting || thinking || game.position.turn !== human) { stage.classList.remove('grab'); return; }
  const sq = squareUnder(event);
  const piece = sq === null ? 0 : game.position.board[sq];
  const overOwn = !!piece && colourOf(piece) === human;
  const overTarget = sq !== null && chosen !== null && movesFrom(chosen).some((m) => m.to === sq);
  stage.classList.toggle('grab', overOwn || overTarget);
});

stage.addEventListener('pointerup', (event: PointerEvent) => {
  if (!carrying) return;
  stage.classList.remove('grabbing');
  const held = carrying;
  const sq = squareUnder(event, true);
  carrying = null;
  // a press that went nowhere leaves the man chosen, waiting for the square to
  // be clicked; a real drag either lands or puts him back
  if (held.travelled < 6) { refresh(); return; }
  if (sq !== null && sq !== held.from && attempt(held.from, sq)) return;
  chosen = null;
  refresh();
});

// --- the panel's controls ------------------------------------------------

panel.sides.addEventListener('click', (event) => {
  const side = (event.target as HTMLElement).dataset.side as Colour | undefined;
  if (!side || side === human) return;
  human = side;
  restart();
});

panel.level.addEventListener('change', () => { level = Number(panel.level.value); drawPanel(); });
panel.fresh.addEventListener('click', () => restart());

panel.undo.addEventListener('click', () => {
  // back to the player's own turn: his move and the answer to it
  asked++;
  thinking = false;
  do { if (!game.undo()) break; } while (game.position.turn !== human);
  lastMove = game.history.length ? game.history[game.history.length - 1].move : null;
  chosen = null;
  engineNote = '';
  refresh();
  // taking back the first move of a game the player joined as black leaves the
  // engine to open again
  maybeThink();
});

panel.promotion.addEventListener('click', (event) => {
  const choice = (event.target as HTMLElement).dataset.promote as PieceType | undefined;
  if (!choice || !promoting) return;
  const move = promoting.moves.find((m) => m.promotion === choice);
  promoting = null;
  panel.promotion.classList.remove('open');
  if (move) playHuman(move); else refresh();
});

function restart() {
  asked++;
  thinking = false;
  game = new Game();
  chosen = null;
  carrying = null;
  lastMove = null;
  promoting = null;
  engineNote = '';
  panel.promotion.classList.remove('open');
  faceTheBoard();
  refresh();
  maybeThink();
}

restart();

// a game in progress is worth keeping across a reload while the page is being
// worked on; the tools that look at it want a handle on the state
Object.assign(window, {
  chess: {
    get game() { return game; },
    get fen() { return toFen(game.position); },
    get chosen() { return chosen; },
    get carrying() { return carrying; },
    get thinking() { return thinking; },
    set level(v: number) { level = v; panel.level.value = String(v); },
    viewer, scene,
    moves: () => legalMoves(game.position).map((m) => squareName(m.from) + squareName(m.to)),
    /** Set up a position, for a test or a puzzle. */
    setup: (fen: string) => { asked++; thinking = false; game = new Game(fen); chosen = null; carrying = null; lastMove = null; engineNote = ''; refresh(); maybeThink(); },
    probe: (x: number, y: number) => {
      const ray = rayThrough(viewer.camera, stage, x, y);
      const sq = squareUnder({ clientX: x, clientY: y });
      return { ray, square: sq === null ? null : squareName(sq), plane: ray && onPlane(ray, TOP) };
    },
  },
});
