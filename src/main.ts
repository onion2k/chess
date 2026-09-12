/**
 * A game of chess on artshape's renderer.
 *
 * There are no rendering controls: the lamp, the mist and the film are set
 * once, in `stage/`, and then left alone. Everything the page does after that
 * is chess — which man is where, which squares he may go to, and whose turn
 * it is.
 *
 * The set is drawn on the library's game path, every frame, so a man can be
 * carried to his square and a taken man swept off to his tray; the squares he
 * may go to are lit rather than marked. The still-life path is still here,
 * behind the Photograph button: the same position on the same table under the
 * same lamp, with the enamel, the stones and the reflections the game path
 * cannot hold, and the tracer after that.
 */

import { detail, setDetail } from 'artshape-render/mesh/detail';
import { Stage, type Lighting } from './stage';
import {
  colourOf, legalMoves, square, squareFromName, squareName, toFen, typeOf,
  type Colour, type Move, type PieceType,
} from './chess/board';
import { Game } from './chess/game';
import { LEVELS } from './chess/engine';
import type { Answer, Ask } from './chess/engine.worker';
import { A1, DEFAULT_LIVERY, LIFT, SQUARE, SetScene, TOP, squareCentre, type Livery, type Standing } from './scene/scene';
import { onPlane, rayThrough, throughCylinder } from './ray';

// --- the graphics -------------------------------------------------------

/**
 * How much is asked of the machine: one of the renderer's tiers, or `auto`,
 * which is whichever the machine measures itself into — `balanced` on a
 * desktop, `fast` on a laptop with an integrated GPU. The choice is kept
 * across visits. Detail must be set before any mesh is built, which is before
 * the scene below is put together, so the choice is read first of all.
 */
/**
 * What the machine is asked for. The still-life path had a ladder of its own,
 * measured and climbed as a frame allowed; the game path draws a frame in
 * about two milliseconds at 1080p, so there is nothing to climb — only three
 * settings, and a measurement to pick between them.
 */
export type Tier = 'fast' | 'balanced' | 'fine';
interface TierSpec {
  /** How much of the small stuff each man is cast with. */
  detail: number;
  /** Pixels drawn, as a fraction of the pane. */
  scale: number;
  /** The mist over the board: the dearest thing in the frame, and the first to go. */
  fog: boolean;
  particles: boolean;
  post: boolean;
}
const TIERS: Record<Tier, TierSpec> = {
  fast: { detail: 0.4, scale: 0.75, fog: false, particles: true, post: false },
  balanced: { detail: 0.7, scale: 1, fog: true, particles: true, post: true },
  fine: { detail: 1, scale: 1, fog: true, particles: true, post: true },
};
/** Milliseconds a 1080p frame, fenced, above which the next tier down is drawn at. */
const TIER_BUDGET: Array<[Tier, number]> = [['fine', 3], ['balanced', 7]];

type Graphics = Tier | 'auto';
const GRAPHICS_KEY = 'chess.graphics';
const GRAPHICS: Graphics[] = ['auto', 'fast', 'balanced', 'fine'];

function storedGraphics(): Graphics {
  try {
    const v = localStorage.getItem(GRAPHICS_KEY) as Graphics | null;
    return v && GRAPHICS.includes(v) ? v : 'auto';
  } catch { return 'auto'; }
}

let graphics: Graphics = storedGraphics();
/** The tier drawn at: the choice, or what the machine measured when the choice is `auto`. */
let tier: Tier = graphics === 'auto' ? 'balanced' : graphics;
setDetail(TIERS[tier].detail);

const stage = document.getElementById('stage') as HTMLElement;
const panel = {
  sides: document.getElementById('sides') as HTMLElement,
  level: document.getElementById('level') as HTMLSelectElement,
  graphics: document.getElementById('graphics') as HTMLSelectElement,
  graphicsNote: document.getElementById('graphics-note') as HTMLElement,
  fresh: document.getElementById('new') as HTMLButtonElement,
  undo: document.getElementById('undo') as HTMLButtonElement,
  randomise: document.getElementById('randomise') as HTMLButtonElement,
  reset: document.getElementById('reset') as HTMLButtonElement,
  metals: document.getElementById('metals') as HTMLElement,
  photo: document.getElementById('photo') as HTMLButtonElement,
  photoNote: document.getElementById('photo-note') as HTMLElement,
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

/** The wait for the first frame, told what it is waiting on; gone once a frame has landed. */
const loading = document.getElementById('loading') as HTMLElement;
const waitingOn = (what: string) => { loading.querySelector('.what')!.textContent = what; };

waitingOn('Casting the set…');
performance.mark('chess:casting');
// the panel gets a paint before the cast, which holds the thread
await new Promise((r) => setTimeout(r, 0));
let scene = new SetScene();
performance.mark('chess:cast');
/** Seconds until the photograph's line of status is written again. */
let noteDue = 0;

waitingOn('Compiling the shaders…');
const board = await Stage.create(stage, {
  onLost: (info) => {
    panel.status.querySelector('.who')!.textContent = 'The graphics device was lost';
    panel.status.querySelector('.note')!.textContent = info.message || 'reload the page';
  },
  onFirstFrame: (ms) => {
    performance.mark('chess:first-frame');
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 500);
    console.info(`first frame ${ms.toFixed(0)} ms after submit; ${(performance.now() / 1000).toFixed(2)} s from the page's start`);
  },
  // the men in flight are moved here, once a frame, and nothing else is
  onTick: (dt) => {
    if (carrying(dt)) { place(); board.light(lighting()); }
    // the photograph settles over a few seconds, and says so as it goes
    if (board.photographing && (noteDue -= dt) <= 0) { noteDue = 0.25; drawPanel(); }
  },
});
board.setScene(scene.groups, (i) => scene.roleOf(i));
applyEconomy();

/** What the tier asks of the renderer, short of recasting the men. */
function applyEconomy() {
  const spec = TIERS[tier];
  board.setEconomy({ fog: spec.fog, particles: spec.particles, post: spec.post, scale: spec.scale });
}

/**
 * Draw at a tier. The pixels and the passes take at once; a change of detail
 * means every man cast again, which is a second or so, and only happens when
 * the detail actually differs.
 */
function applyTier(next: Tier) {
  tier = next;
  applyEconomy();
  if (TIERS[tier].detail !== detail()) {
    setDetail(TIERS[tier].detail);
    scene = new SetScene();
    scene.relivery(livery);
    board.setScene(scene.groups, (i) => scene.roleOf(i));
    refresh();
  }
  drawGraphics();
}

function chooseGraphics(next: Graphics) {
  graphics = next;
  try { localStorage.setItem(GRAPHICS_KEY, next); } catch { /* kept for this visit only */ }
  if (next === 'auto') {
    // measured in draft, at the working detail, which is what the verdict is a verdict on
    if (tier === 'fine') applyTier('balanced');
    calibrate();
  } else applyTier(next);
}

/**
 * Time a few frames of the set, fenced on the queue and at a size named here
 * rather than whatever the pane is, and choose a tier from the cost. A pane
 * the browser is not showing lays its canvas out at nothing, so a hidden page
 * waits to be shown rather than measuring a frame one pixel across and
 * reporting the driver's overhead as the scene's.
 */
function calibrate() {
  if (document.hidden) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) calibrate(); }, { once: true });
    return;
  }
  board.measure().then((ms) => {
    if (graphics === 'auto') applyTier(TIER_BUDGET.find(([, budget]) => ms < budget)?.[0] ?? 'fast');
    drawGraphics();
  }, (err) => console.warn('calibration failed:', err));
}

/** The picker and its note: the adapter, its measured cost, and the tier being drawn at. */
function drawGraphics() {
  panel.graphics.value = graphics;
  const a = board.ctx.adapter;
  const name = [a.vendor, a.architecture].filter(Boolean).join(' ') || 'unknown GPU';
  const measured = board.msPerFrame ? `${board.msPerFrame.toFixed(1)} ms a frame at 1080p` : 'measuring…';
  const spec = TIERS[tier];
  const at = spec.scale < 1 ? `, at ${Math.round(spec.scale * 100)}%` : '';
  const without = [!spec.fog && 'the mist', !spec.post && 'the film'].filter(Boolean);
  panel.graphicsNote.textContent = `${name}: ${measured}${graphics === 'auto' ? ` → ${tier}` : ''}${at}`
    + (without.length ? `, without ${without.join(' or ')}` : '');
}

GRAPHICS.forEach((g) => {
  const option = document.createElement('option');
  option.value = g;
  option.textContent = g;
  panel.graphics.append(option);
});
panel.graphics.addEventListener('change', () => chooseGraphics(panel.graphics.value as Graphics));
// the note copies the viewer's report: one paste from a machine that is elsewhere
panel.graphicsNote.title = 'click to copy a report of what this machine measured';
panel.graphicsNote.addEventListener('click', () => {
  const report = reportOf();
  navigator.clipboard.writeText(report).then(
    () => { panel.graphicsNote.textContent = 'report copied'; },
    () => {
      // no clipboard — a page without focus, or a browser that asks — so the report opens as text instead
      panel.graphicsNote.textContent = 'report opened';
      window.open(URL.createObjectURL(new Blob([report], { type: 'text/plain' })));
    },
  );
  setTimeout(drawGraphics, 1200);
});

/** One paste from a machine that is elsewhere: what it is, and what it measured. */
function reportOf() {
  const a = board.ctx.adapter;
  return [
    `chess, ${new Date().toISOString()}`,
    `adapter: ${[a.vendor, a.architecture, a.device].filter(Boolean).join(' ') || 'unknown'}`,
    `frame:   ${board.msPerFrame ? `${board.msPerFrame.toFixed(2)} ms at 1920×1080, fenced` : 'not measured'}`,
    `drawn:   ${tier}${graphics === 'auto' ? ' (auto)' : ''}, detail ${detail().toFixed(2)}, ${TIERS[tier].fog ? 'with' : 'without'} the mist`,
    `pane:    ${board.canvas.width}×${board.canvas.height}`,
  ].join('\n');
}

/** The board with its border and a little air, which the camera has to hold. */
const BOARD_BOUNDS = { min: [-150, -150, 0] as [number, number, number], max: [150, 150, 34] as [number, number, number] };

// --- the metals ----------------------------------------------------------

/**
 * The metals the two armies may be made of. One side stays a warm metal and
 * the other a white one, however they are dealt, because that is what tells a
 * player whose man is whose across a board — and it is the difference the set
 * was drawn around: white's men are enamelled cobalt and set with sapphire,
 * black's ruby with ruby.
 */
const WARM = ['gold', 'copper', 'rose gold', 'brass', 'bronze'];
const WHITE_METALS = ['silver', 'platinum', 'blackened steel'];
/** The board can be any of them: it is enamel and stone over its ground. */
const GROUNDS = [...WARM, ...WHITE_METALS];

let livery: Livery = { ...DEFAULT_LIVERY };

function wear(next: Livery) {
  livery = next;
  scene.relivery(livery);
  board.setScene(scene.groups, (i) => scene.roleOf(i));
  place();
}

/** One of these, but not the one it is already wearing. */
function other(from: string[], than: string): string {
  const rest = from.filter((m) => m !== than);
  return rest[Math.floor(Math.random() * rest.length)];
}

function randomise() {
  wear({
    board: other(GROUNDS, livery.board),
    w: other(WHITE_METALS, livery.w),
    b: other(WARM, livery.b),
  });
  drawPanel();
}

// --- the game ------------------------------------------------------------

let game = new Game();
let human: Colour = 'w';
let level = 2;
/** The square of the man in hand, chosen by a click or held in a drag. */
let chosen: number | null = null;
/**
 * The man in the player's hand, while the pointer carries him. He is not a
 * `Carry`: a carry is a man the page is moving on its own, and this one goes
 * where the pointer goes.
 */
let held: { from: number; at: [number, number, number]; travelled: number } | null = null;
let lastMove: Move | null = null;
/** A promotion waiting on the player's choice. */
let promoting: { moves: Move[]; at?: [number, number, number] } | null = null;
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
    animate(move);
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

/**
 * A man on his way somewhere: lifted off one square and set down on another,
 * or swept off the board to his side's tray.
 *
 * The rules do not wait for him. The move is played the moment it is made —
 * the position, the turn and the legal moves are all correct at once — and
 * this only changes where the men are *drawn* while the hand is still moving.
 * An animation the rules wait on is an animation that can lose a click.
 */
interface Carry {
  colour: Colour;
  type: PieceType;
  from: [number, number, number];
  to: [number, number, number];
  turn: number;
  lift: number;
  t: number;
  span: number;
  /** The square he is bound for, so the man the rules already put there is not drawn twice. */
  hides: number | null;
  /** A man being taken is not one being moved. */
  swept: boolean;
}

const carries: Carry[] = [];

/** Smooth at both ends: a hand does not start or stop at speed. */
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

/** Where a man is, this far through his carry. */
function along(c: Carry): [number, number, number] {
  const k = ease(Math.min(1, c.t / c.span));
  const hump = Math.sin(Math.PI * Math.min(1, c.t / c.span)) ** 0.8;
  return [
    c.from[0] + (c.to[0] - c.from[0]) * k,
    c.from[1] + (c.to[1] - c.from[1]) * k,
    c.from[2] + (c.to[2] - c.from[2]) * k + c.lift * hump,
  ];
}

const facing = (colour: Colour) => (colour === 'b' ? Math.PI : 0);
const onSquare = (sq: number): [number, number, number] => [...squareCentre(sq), TOP] as [number, number, number];

function carryOne(colour: Colour, type: PieceType, from: [number, number, number], to: [number, number, number], opts: { lift: number; hides: number | null; swept?: boolean }) {
  const span = 0.18 + Math.hypot(to[0] - from[0], to[1] - from[1]) / 1100;
  carries.push({ colour, type, from, to, turn: facing(colour), lift: opts.lift, t: 0, span, hides: opts.hides, swept: opts.swept ?? false });
}

/**
 * Set every man a move touches moving: the man himself, the rook of a
 * castling, and the man taken, who is lifted out and carried to his tray
 * rather than vanishing under the man who took him. Called before the move is
 * played, while the board still says who stands where.
 *
 * `held` is where the man already is when a player has dragged him there: he
 * is carried on from the pointer rather than snapped back to his square.
 */
function animate(move: Move, held?: [number, number, number]) {
  const colour = colourOf(move.piece);
  if (move.captured) {
    const taken = { colour: colourOf(move.captured), type: typeOf(move.captured) };
    const index = game.captured().filter((m) => m.colour === taken.colour).length;
    carryOne(taken.colour, taken.type, onSquare(move.capturedAt), trayPlace(taken.colour, index), { lift: LIFT * 0.8, hides: null, swept: true });
  }
  // a promoted pawn is carried as the pawn he still is; the queen the rules
  // have already made of him is what is set down
  carryOne(colour, typeOf(move.piece), held ?? onSquare(move.from), onSquare(move.to), { lift: held ? LIFT * 0.35 : LIFT, hides: move.to });
  if (move.castle) {
    carryOne(colour, 'r', onSquare(move.castle.rookFrom), onSquare(move.castle.rookTo), { lift: LIFT * 0.6, hides: move.castle.rookTo });
  }
}

/**
 * Advance every carry and set down those that have arrived, each raising a
 * little dust where it lands. Returns whether any man is still in the air, so
 * the frame knows whether to stand the set again.
 */
function carrying(dt: number): boolean {
  if (!carries.length) return false;
  for (let i = carries.length - 1; i >= 0; i--) {
    const c = carries[i];
    c.t += dt;
    if (c.t < c.span) continue;
    board.dust(c.to, c.swept);
    carries.splice(i, 1);
  }
  return true;
}

/**
 * Every man to draw: those standing on their squares, those set down in a
 * tray, the one in the player's hand, and those in flight. A man bound for a
 * square is drawn by his carry and not by the square — the rules have already
 * put him where he is going, and he would otherwise be in two places.
 */
function standing(): Standing[] {
  const men: Standing[] = [];
  const hidden = new Set(carries.map((c) => c.hides).filter((sq): sq is number => sq !== null));
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = square(file, rank);
      const piece = game.position.board[sq];
      if (!piece || hidden.has(sq)) continue;
      const colour = colourOf(piece);
      const [x, y] = squareCentre(sq);
      const at: [number, number, number] = held && held.from === sq ? held.at : [x, y, TOP];
      men.push({ colour, type: typeOf(piece), at, turn: facing(colour) });
    }
  }
  const taken = { w: 0, b: 0 };
  const sweeping = carries.filter((c) => c.swept).length;
  const done = game.captured();
  done.slice(0, done.length - sweeping).forEach((man) => {
    men.push({ ...man, at: trayPlace(man.colour, taken[man.colour]++), turn: facing(man.colour) });
  });
  for (const c of carries) men.push({ colour: c.colour, type: c.type, at: along(c), turn: c.turn });
  return men;
}

/** The squares the man in hand may go to, as moves. */
function movesFrom(sq: number | null): Move[] {
  if (sq === null || game.position.turn !== human || game.outcome().over) return [];
  return game.legal().filter((m) => m.from === sq);
}

/** Stand the men where they stand. */
function place() {
  board.place(scene.place(standing()));
}

/**
 * What the position wants lit. The squares a man may go to are pools of light
 * on the board rather than markers laid on it — green for a quiet move, red
 * for a capture, amber under the man in hand, and blue at both ends of the
 * last move — and a man being carried takes his own light with him, which is
 * what says a move is happening rather than having happened.
 */
function lighting(): Lighting {
  const options = movesFrom(chosen);
  const quiet = new Set<number>(), capture = new Set<number>();
  // one pool per destination square, not per move: four promotions are one square
  for (const move of options) (move.captured ? capture : quiet).add(move.to);
  const at = (sq: number): [number, number] => squareCentre(sq);
  const carried: Array<[number, number, number]> = carries.filter((c) => !c.swept).map((c) => along(c));
  if (held) carried.push(held.at);
  return {
    chosen: chosen !== null && options.length && !held ? [at(chosen)] : [],
    quiet: [...quiet].map(at),
    capture: [...capture].map(at),
    last: lastMove ? [at(lastMove.from), at(lastMove.to)] : [],
    carried,
  };
}

/**
 * Everything on screen, from the position. `silent` leaves the panel alone: a
 * man being carried moves many times a second and nothing in the panel is
 * changing while he does.
 */
function refresh(silent = false) {
  place();
  board.light(lighting());
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
  // which side you play is settled once a move has been made: changing it
  // mid-game would mean handing your position to the engine
  for (const b of [...panel.sides.children] as HTMLButtonElement[]) {
    b.classList.toggle('on', b.dataset.side === human);
    b.disabled = game.history.length > 0 || thinking;
  }
  panel.randomise.disabled = thinking;
  panel.photoNote.textContent = board.photographing ? `${board.photoStatus} · t to trace` : '';
  panel.metals.textContent = metalNote();
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

/** What the set is made of, for the panel to say under the two buttons. */
function metalNote() {
  return `${livery.w} against ${livery.b}, on ${livery.board}`;
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
  const tan = Math.tan((board.camera.fov * Math.PI) / 360);
  const aspect = Math.max(0.2, stage.clientWidth / Math.max(1, stage.clientHeight));
  const across = 205 / (tan * aspect);
  const up = (158 * Math.sin(ELEVATION) + 24) / tan;
  return Math.max(across, up) * 1.06;
}

function faceTheBoard() {
  // the player looks down the board from behind his own men. The orbit is
  // spherical about the zenith, so the elevation above the table is a polar
  // angle down from it.
  board.face(human === 'w' ? -Math.PI / 2 : Math.PI / 2, Math.PI / 2 - ELEVATION, distanceForBoard());
}

// a pane that changes shape changes what fits: the board is reframed, but only
// as far as the distance, so a view the player has turned stays turned
new ResizeObserver(() => board.face(board.orbit.currentAzimuth, board.orbit.currentPolar, distanceForBoard())).observe(stage);

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
  const ray = rayThrough(board.camera, stage, event.clientX, event.clientY);
  if (!ray) return null;

  let best: { t: number; square: number } | null = null;
  if (!boardOnly) for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const sq = square(file, rank);
      const piece = game.position.board[sq];
      if (!piece || (held && held.from === sq)) continue;
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
  const ray = rayThrough(board.camera, stage, event.clientX, event.clientY);
  const point = ray && onPlane(ray, TOP + LIFT);
  if (!point) return held!.at;
  const clamp = (v: number) => Math.max(A1 - SQUARE, Math.min(-A1 + SQUARE, v));
  return [clamp(point[0]), clamp(point[1]), TOP + LIFT];
}

/**
 * Play a move, or ask which piece a promoting pawn becomes. `at` is where the
 * man already is when he has been dragged there, so he is carried on from the
 * pointer rather than snapping back to his square first.
 */
function attempt(from: number, to: number, at?: [number, number, number]) {
  const moves = game.legal().filter((m) => m.from === from && m.to === to);
  if (!moves.length) return false;
  if (moves.length > 1 && moves[0].promotion) {
    promoting = { moves, at };
    panel.promotion.classList.add('open');
    return true;
  }
  playHuman(moves[0], at);
  return true;
}

function playHuman(move: Move, at?: [number, number, number]) {
  animate(move, at);
  lastMove = move;
  game.play(move);
  chosen = null;
  held = null;
  engineNote = '';
  refresh();
  maybeThink();
}

/**
 * The view moves only while the meta key is held.
 *
 * The orbit binds its own listeners to the canvas, which is a child of the
 * stage, so a press reaches it before anything here in the bubble. These two
 * run in the capture phase instead, ahead of it: with the key held they let
 * the press or the wheel through and the orbit turns, dollies or pans as it
 * always did; without it they stop the event where it is, and the board is
 * free for picking men up and putting them down.
 */
stage.addEventListener('wheel', (event: WheelEvent) => {
  if (!event.metaKey) event.stopPropagation();
}, { capture: true });

stage.addEventListener('pointerdown', (event: PointerEvent) => {
  if (event.metaKey) return;   // the view's, not the board's
  event.stopPropagation();

  if (event.button !== 0 || promoting) return;
  if (event.target !== stage && !(event.target instanceof HTMLCanvasElement)) return;
  if (game.outcome().over || game.position.turn !== human || thinking) return;

  const sq = squareUnder(event);
  if (sq === null) return;

  // a square already offered: this is the second click of a click and a click
  if (chosen !== null && movesFrom(chosen).some((m) => m.to === sq)) {
    attempt(chosen, sq);
    return;
  }

  const piece = game.position.board[sq];
  if (!piece || colourOf(piece) !== human) { chosen = null; refresh(); return; }

  chosen = sq;
  const [x, y] = squareCentre(sq);
  held = { from: sq, at: [x, y, TOP + LIFT], travelled: 0 };
  stage.classList.add('grabbing');
  // a synthesised pointer has no capture to take; the drag works without it
  try { stage.setPointerCapture(event.pointerId); } catch { /* not a real pointer */ }
  refresh();
}, { capture: true });

stage.addEventListener('pointermove', (event: PointerEvent) => {
  if (held) {
    held.travelled += Math.abs(event.movementX) + Math.abs(event.movementY);
    held.at = carriedTo(event);
    refresh(true);
    return;
  }
  if (event.metaKey || promoting || thinking || game.position.turn !== human) { stage.classList.remove('grab'); return; }
  const sq = squareUnder(event);
  const piece = sq === null ? 0 : game.position.board[sq];
  const overOwn = !!piece && colourOf(piece) === human;
  const overTarget = sq !== null && chosen !== null && movesFrom(chosen).some((m) => m.to === sq);
  stage.classList.toggle('grab', overOwn || overTarget);
});

stage.addEventListener('pointerup', (event: PointerEvent) => {
  if (!held) return;
  stage.classList.remove('grabbing');
  const drag = held;
  const sq = squareUnder(event, true);
  held = null;
  // a press that went nowhere leaves the man chosen, waiting for the square to
  // be clicked; a real drag either lands or puts him back
  if (drag.travelled < 6) { refresh(); return; }
  if (sq !== null && sq !== drag.from && attempt(drag.from, sq, drag.at)) return;
  chosen = null;
  refresh();
});

// --- the panel's controls ------------------------------------------------

panel.sides.addEventListener('click', (event) => {
  const side = (event.target as HTMLElement).dataset.side as Colour | undefined;
  if (!side || side === human) return;
  human = side;
  // the board is always seen from your own side, so it turns round with you
  restart(true);
});

/**
 * The photograph: the same position handed to the still-life renderer, over
 * the same device and the same canvas. It is built the first time it is asked
 * for, so a game that is never photographed pays nothing for it; the picture
 * is there at once and sharpens over about four seconds as the bakes land,
 * and `t` asks for the traced version after that.
 */
async function photograph() {
  const open = await board.photograph(() => scene.place(standing()), BOARD_BOUNDS);
  panel.photo.textContent = open ? 'Back to the game' : 'Photograph';
  if (!open) panel.photoNote.textContent = '';
  drawPanel();
}

panel.photo.addEventListener('click', () => { void photograph(); });
window.addEventListener('keydown', (event) => {
  if (event.key === 'p' && !event.metaKey && !event.ctrlKey) void photograph();
  if (event.key === 't' && board.photographing) board.trace();
});

panel.level.addEventListener('change', () => { level = Number(panel.level.value); drawPanel(); });
panel.fresh.addEventListener('click', () => restart());
panel.randomise.addEventListener('click', () => randomise());

// everything back to how the page opens: the men on their squares, the metals
// they were cast in, and the view from behind your own men
panel.reset.addEventListener('click', () => {
  wear({ ...DEFAULT_LIVERY });
  restart(true);
});

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
  const at = promoting.at;
  promoting = null;
  panel.promotion.classList.remove('open');
  if (move) playHuman(move, at); else refresh();
});

/**
 * A fresh game. `reframe` puts the camera back behind your own men, which a
 * new game does not do on its own — a view you have turned to is yours to
 * keep — but changing sides and the reset button both do.
 */
function restart(reframe = false) {
  asked++;
  thinking = false;
  game = new Game();
  carries.length = 0;
  chosen = null;
  held = null;
  lastMove = null;
  promoting = null;
  engineNote = '';
  panel.promotion.classList.remove('open');
  if (reframe) faceTheBoard();
  refresh();
  maybeThink();
}

restart(true);
// the men are where they stand and the page knows its own state: draw
board.start();
drawGraphics();
// the set is on screen: measure it, and draw at what this machine can manage
if (graphics === 'auto') calibrate();

// a game in progress is worth keeping across a reload while the page is being
// worked on; the tools that look at it want a handle on the state
Object.assign(window, {
  chess: {
    get game() { return game; },
    get fen() { return toFen(game.position); },
    get chosen() { return chosen; },
    get held() { return held; },
    get thinking() { return thinking; },
    set level(v: number) { level = v; panel.level.value = String(v); },
    board,
    get scene() { return scene; },
    get tier() { return tier; },
    moves: () => legalMoves(game.position).map((m) => squareName(m.from) + squareName(m.to)),
    /** Set up a position, for a test or a puzzle. */
    setup: (fen: string) => { asked++; thinking = false; game = new Game(fen); chosen = null; held = null; lastMove = null; engineNote = ''; refresh(); maybeThink(); },
    probe: (x: number, y: number) => {
      const ray = rayThrough(board.camera, stage, x, y);
      const sq = squareUnder({ clientX: x, clientY: y });
      return { ray, square: sq === null ? null : squareName(sq), plane: ray && onPlane(ray, TOP) };
    },
  },
});
