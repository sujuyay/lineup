import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import type { Player } from './types';
import { POSITION_COLORS, POSITION_ABBREV } from './types';
import type { DeepPartial, LineupSettings, MethodValidators } from './config';
import { SettingsContext, resolveSettings, PLAYER_COUNT } from './config';
import { Court } from './components/Court';
import { Bench } from './components/Bench';
import { RotationTracker } from './components/RotationTracker';
import { Toast } from './components/Toast';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import './App.css';

const STORAGE_KEY = 'volleyball-lineup-data-v3';

// All ids below are player ids that key into the lineup's `roster`. Empty string
// means "no player". Court is a fixed-length array (one entry per court slot);
// benches are variable-length and only hold filled positions.
type CourtSlot = {
  playerId: string;
  // 1-6, only set for the substitutions method. Seeded by the first rotation's
  // court index and stays with the player as they rotate around the court.
  rotationalPosition?: number;
};

type Rotation = {
  court: CourtSlot[];
  leftBench: string[];
  rightBench: string[];
  liberoBench: string[]; // for now always 0 or 1 element
  subsBench: string[];
};

// rotationalPosition seeded by the first rotation's court index:
//   front: left=4 middle=3 right=2   back: left=5 middle=6 right=1
const COURT_ROTATIONAL_POSITIONS = [4, 3, 2, 5, 6, 1];

export interface Lineup {
  minGirls: number;
  rotationMethod: 'bench' | 'substitutions';
  roster: Record<string, Player>;
  rotations: {
    serve: Rotation;
    receive: Rotation;
  }[];
}

interface StoredData {
  activeLineupIndex: number;
  lineups: Lineup[];
}

export type Phase = 'serve' | 'receive';

// The result of running every rotation-validity check against a rotation. When
// `valid` is false, `messages` explains each failed check.
type ValidationContext = {
  valid: boolean;
  messages: string[];
};

// A reference to any draggable/droppable slot in the app. `bench` is a side
// bench (left/right); `sub` is the substitutes bench.
type SlotRef =
  | { type: 'court'; index: number }
  | { type: 'bench'; side: 'left' | 'right'; index: number }
  | { type: 'sub'; index: number }
  | { type: 'libero' };

// The active formation resolved to player objects - what the UI renders and the
// drag/rotate logic operates on. Court entries may be null (empty slots); bench
// entries are always filled.
type View = {
  court: (Player | null)[];
  leftBench: Player[];
  rightBench: Player[];
  liberoBench: Player | null;
  subsBench: Player[];
  // Populated by resolveView (which has whole-lineup context); other View
  // constructions leave it undefined.
  validation?: ValidationContext;
};

function createEmptyRotation(): Rotation {
  return {
    court: Array.from({ length: PLAYER_COUNT }, () => ({ playerId: '' })),
    leftBench: [],
    rightBench: [],
    liberoBench: [],
    subsBench: [],
  };
}

function createEmptyLineup(settings: LineupSettings): Lineup {
  return {
    minGirls: settings.minGirls.default,
    rotationMethod: 'bench',
    roster: {},
    rotations: [{ serve: createEmptyRotation(), receive: createEmptyRotation() }],
  };
}

// Rotate a slot->position layout one step forward, mirroring how the court
// players rotate (ROTATION_MAP). The label travels with the player to its new
// slot, so a non-subbing player keeps the same number across rotations.
function rotateLayout(layout: number[]): number[] {
  const next = new Array<number>(PLAYER_COUNT);
  for (let s = 0; s < PLAYER_COUNT; s++) next[ROTATION_MAP.forward[s]] = layout[s];
  return next;
}

// For the substitutions method each court object carries a rotationalPosition
// (1-6). The position belongs to the court *slot*, not the player: the slot
// layout starts at COURT_ROTATIONAL_POSITIONS and rotates in lockstep with the
// players each rotation. Whoever occupies a serve slot takes its number, so a
// player who subs out keeps no position and a player coming on assumes the
// number of the slot (i.e. the player) it replaces. Receive keeps each player's
// serve number (receive is a tactical rearrangement of the same rotation). Bench
// lineups carry no positions.
function assignRotationalPositions(lineup: Lineup): Lineup {
  const clearPositions = (rot: Rotation): Rotation => ({
    ...rot,
    court: rot.court.map((c) => ({ playerId: c.playerId, rotationalPosition: undefined })),
  });

  if (lineup.rotationMethod !== 'substitutions') {
    return {
      ...lineup,
      rotations: lineup.rotations.map((r) => ({ serve: clearPositions(r.serve), receive: clearPositions(r.receive) })),
    };
  }

  let layout = [...COURT_ROTATIONAL_POSITIONS];
  const rotations = lineup.rotations.map((r, index) => {
    if (index > 0) layout = rotateLayout(layout);

    // The serve formation is the canonical rotational arrangement: slot j carries
    // layout[j]. Build the per-player numbers from it for the receive formation.
    const positionByPlayer = new Map<string, number>();
    r.serve.court.forEach((c, j) => {
      if (c.playerId) positionByPlayer.set(c.playerId, layout[j]);
    });

    return {
      serve: {
        ...r.serve,
        court: r.serve.court.map((c, j) => ({
          playerId: c.playerId,
          rotationalPosition: c.playerId ? layout[j] : undefined,
        })),
      },
      receive: {
        ...r.receive,
        court: r.receive.court.map((c) => ({
          playerId: c.playerId,
          rotationalPosition: c.playerId ? positionByPlayer.get(c.playerId) : undefined,
        })),
      },
    };
  });

  return { ...lineup, rotations };
}

// Write a resolved View back into a lineup at the given rotation/phase:
// registers the players into the roster, stores ids, and prunes unreferenced
// players. Pads the rotations array with empty rotations up to `rotationIndex`.
function writeView(lineup: Lineup, next: View, rotationIndex: number, phase: Phase, autoFulfillMinGirls: boolean): Lineup {
  const roster: Record<string, Player> = { ...lineup.roster };
  const register = (p: Player) => {
    roster[p.id] = p;
    return p.id;
  };

  const rotations = lineup.rotations.slice();
  while (rotations.length <= rotationIndex) {
    rotations.push({ serve: createEmptyRotation(), receive: createEmptyRotation() });
  }

  // Positions are recomputed from the rotating slot layout by
  // assignRotationalPositions (called via hydrateFrom), so just store the ids.
  const newView: Rotation = {
    court: next.court.map((p) => ({ playerId: p ? register(p) : '' })),
    leftBench: next.leftBench.map(register),
    rightBench: next.rightBench.map(register),
    liberoBench: next.liberoBench ? [register(next.liberoBench)] : [],
    subsBench: next.subsBench.map(register),
  };

  rotations[rotationIndex] = { ...rotations[rotationIndex], [phase]: newView };

  // Editing any rotation re-derives every rotation after it (predecessors stay).
  return hydrateFrom({ ...lineup, roster, rotations }, rotationIndex, phase, autoFulfillMinGirls);
}

function emptyView(): View {
  return { court: Array.from({ length: PLAYER_COUNT }, () => null), leftBench: [], rightBench: [], liberoBench: null, subsBench: [] };
}

// Resolve a single rotation's ids to player objects.
function resolveRotationView(rotation: Rotation, roster: Record<string, Player>): View {
  const liberoId = rotation.liberoBench[0];
  const toPlayers = (ids: string[]) => ids.map((id) => roster[id]).filter((p): p is Player => !!p);
  return {
    court: rotation.court.map((c) => roster[c.playerId] ?? null),
    leftBench: toPlayers(rotation.leftBench),
    rightBench: toPlayers(rotation.rightBench),
    liberoBench: liberoId ? roster[liberoId] ?? null : null,
    subsBench: toPlayers(rotation.subsBench),
  };
}

// Resolve a rotation's ids to player objects for rendering / logic. A rotation
// index past the end of the array (not built yet) resolves to an empty view.
function resolveView(lineup: Lineup, rotationIndex: number, phase: Phase, validators?: MethodValidators): View {
  const view = lineup.rotations[rotationIndex]?.[phase];
  const resolved = view ? resolveRotationView(view, lineup.roster) : emptyView();
  return { ...resolved, validation: validateRotation(lineup, rotationIndex, phase, validators) };
}

// Convert a resolved view back into id-based rotation data (players assumed to
// already live in the roster).
function viewToRotation(view: View): Rotation {
  return {
    court: view.court.map((p) => ({ playerId: p ? p.id : '' })),
    leftBench: view.leftBench.map((p) => p.id),
    rightBench: view.rightBench.map((p) => p.id),
    liberoBench: view.liberoBench ? [view.liberoBench.id] : [],
    subsBench: view.subsBench.map((p) => p.id),
  };
}

// Number of rotations a bench lineup cycles through: the players on court plus
// both side benches (the libero bench is not counted).
function fieldCount(view: View): number {
  const onCourt = view.court.filter((p) => p !== null).length;
  return onCourt + view.leftBench.length + view.rightBench.length;
}

// Swap the players occupying two slots within a view. Benches only hold filled
// positions, so any emptied bench slot is dropped.
function swapInView(view: View, a: SlotRef, b: SlotRef): View {
  const court = [...view.court];
  const left: (Player | null)[] = [...view.leftBench];
  const right: (Player | null)[] = [...view.rightBench];
  const subs: (Player | null)[] = [...view.subsBench];
  let liberoBench = view.liberoBench;

  const read = (slot: SlotRef): Player | null => {
    if (slot.type === 'court') return court[slot.index] ?? null;
    if (slot.type === 'bench') return (slot.side === 'left' ? left : right)[slot.index] ?? null;
    if (slot.type === 'sub') return subs[slot.index] ?? null;
    return liberoBench;
  };
  const write = (slot: SlotRef, player: Player | null) => {
    if (slot.type === 'court') court[slot.index] = player;
    else if (slot.type === 'bench') (slot.side === 'left' ? left : right)[slot.index] = player;
    else if (slot.type === 'sub') subs[slot.index] = player;
    else liberoBench = player;
  };

  const playerA = read(a);
  const playerB = read(b);
  write(a, playerB);
  write(b, playerA);

  const filled = (arr: (Player | null)[]) => arr.filter((p): p is Player => p !== null);
  return {
    court,
    leftBench: filled(left),
    rightBench: filled(right),
    liberoBench,
    subsBench: filled(subs),
  };
}

// The libero may only serve in place of a single player. Across every serve
// formation where the libero occupies the server slot (back-right court), the
// player it serves for (the one on the libero bench) must be the same. Returns
// a message when the libero would serve for more than one player, else null.
function liberoServeViolation(lineup: Lineup): string | null {
  const liberoId = Object.values(lineup.roster).find((p) => p.position === 'libero')?.id;
  if (!liberoId) return null;

  const serverIndex = PLAYER_COUNT - 1;
  let servedFor: string | null = null;
  for (const rotation of lineup.rotations) {
    const { serve } = rotation;
    if (serve.court[serverIndex]?.playerId !== liberoId) continue; // libero isn't serving here
    const benchId = serve.liberoBench[0];
    if (!benchId) continue;
    if (servedFor === null) servedFor = benchId;
    else if (servedFor !== benchId) return 'Libero can only serve for 1 player';
  }
  return null;
}

// Substitutions method: a non-libero player must stay in a single rotational
// position across every rotation (you can't sub a player into different spots).
// The libero is exempt - it subs in for different players and so takes different
// positions. Build a playerId -> rotationalPosition map while walking every
// rotation and flag the first contradiction.
function rotationalPositionViolation(lineup: Lineup): string | null {
  if (lineup.rotationMethod !== 'substitutions') return null;
  const liberoId = Object.values(lineup.roster).find((p) => p.position === 'libero')?.id;
  const positionByPlayer = new Map<string, number>();
  for (const rotation of lineup.rotations) {
    for (const phase of [rotation.serve, rotation.receive]) {
      for (const c of phase.court) {
        if (!c.playerId || c.playerId === liberoId || c.rotationalPosition === undefined) continue;
        const existing = positionByPlayer.get(c.playerId);
        if (existing === undefined) {
          positionByPlayer.set(c.playerId, c.rotationalPosition);
        } else if (existing !== c.rotationalPosition) {
          return 'A player can only play one position';
        }
      }
    }
  }
  return null;
}

// Run every rotation-validity check against a single rotation/phase and collect
// the failures. Mirrors the state checks enforced in swapDenial: the court must
// keep at least `minGirls` females, the libero may only serve for one player,
// and (in the substitutions method) no player may occupy two rotational
// positions. The last two are lineup-wide, so they surface on every rotation
// when violated. Empty/partial courts (e.g. the first rotation mid-setup) are
// not validated.
function validateRotation(
  lineup: Lineup,
  rotationIndex: number,
  phase: Phase,
  validators: MethodValidators = { bench: [], substitutions: [] },
): ValidationContext {
  const messages: string[] = [];
  const court = lineup.rotations[rotationIndex]?.[phase]?.court;

  // A full court must field at least `minGirls` females.
  if (court && court.every((c) => c.playerId)) {
    const courtFemales = court.filter((c) => lineup.roster[c.playerId]?.gender === 'female').length;
    if (courtFemales < lineup.minGirls) {
      messages.push(`Must have ${lineup.minGirls} female${lineup.minGirls === 1 ? '' : 's'} on court`);
    }
  }

  const liberoIssue = liberoServeViolation(lineup);
  if (liberoIssue) messages.push(liberoIssue);

  // Method-specific checks: built-in rules plus the custom validators configured
  // for that method.
  const runValidators = (list: MethodValidators[keyof MethodValidators]) => {
    for (const validate of list) messages.push(...validate(lineup, rotationIndex, phase).messages);
  };

  if (lineup.rotationMethod === 'bench') {
    runValidators(validators.bench);
  }

  if (lineup.rotationMethod === 'substitutions') {
    const positionIssue = rotationalPositionViolation(lineup);
    if (positionIssue) messages.push(positionIssue);
    runValidators(validators.substitutions);
  }

  return { valid: messages.length === 0, messages };
}

// Keep only roster entries still referenced by some rotation/phase.
function pruneRoster(roster: Record<string, Player>, rotations: Lineup['rotations']): Record<string, Player> {
  const referenced = new Set<string>();
  for (const r of rotations) {
    for (const phase of [r.serve, r.receive]) {
      phase.court.forEach((c) => c.playerId && referenced.add(c.playerId));
      phase.leftBench.forEach((id) => referenced.add(id));
      phase.rightBench.forEach((id) => referenced.add(id));
      phase.subsBench.forEach((id) => referenced.add(id));
      phase.liberoBench.forEach((id) => referenced.add(id));
    }
  }
  const pruned: Record<string, Player> = {};
  referenced.forEach((id) => {
    if (roster[id]) pruned[id] = roster[id];
  });
  return pruned;
}

function loadFromStorage(settings: LineupSettings): Lineup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as StoredData;
      if (Array.isArray(data?.lineups)) {
        const lineups = data.lineups.slice();
        while (lineups.length < settings.numLineups) {
          lineups.push(createEmptyLineup(settings));
        }
        return lineups;
      }
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return Array.from({ length: settings.numLineups }, () => createEmptyLineup(settings));
}

function loadActiveIndex(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredData = JSON.parse(stored);
      return data.activeLineupIndex ?? 0;
    }
  } catch {
    // ignore
  }
  return 0;
}

function saveToStorage(activeLineupIndex: number, lineups: Lineup[]): void {
  try {
    const data: StoredData = {
      activeLineupIndex,
      lineups,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// The court is a fixed 2x3 grid (front row near the net on top, back row below):
//   0 1 2   (front row)
//   3 4 5   (back row)

// Clockwise perimeter rotation and its reverse, keyed by current slot -> next slot.
const ROTATION_MAP: Record<'forward' | 'backward', Record<number, number>> = {
  forward: { 0: 1, 1: 2, 2: 5, 5: 4, 4: 3, 3: 0 },
  backward: { 1: 0, 2: 1, 5: 2, 4: 5, 3: 4, 0: 3 },
};

// Entry/exit court positions for subs coming off each side bench.
const SUB_POSITIONS: Record<'forward' | 'backward', { LEFT_ENTRY: number; LEFT_EXIT: number; RIGHT_ENTRY: number; RIGHT_EXIT: number }> = {
  forward: { LEFT_ENTRY: 0, LEFT_EXIT: 3, RIGHT_ENTRY: 5, RIGHT_EXIT: 2 },
  backward: { LEFT_ENTRY: 3, LEFT_EXIT: 0, RIGHT_ENTRY: 2, RIGHT_EXIT: 5 },
};

// Apply one rotation step to a formation, subbing in from both side benches and
// (when `autoFulfillMinGirls` is set) blocking female exits as needed to keep at
// least `minGirls` on the court. The libero is swapped to the libero bench when
// it would leave the back row.
function rotateView(view: View, minGirls: number, autoFulfillMinGirls: boolean, direction: 'forward' | 'backward'): View {
  const { leftBench, rightBench } = view;
  const rotationMap = ROTATION_MAP[direction];
  const { LEFT_ENTRY, LEFT_EXIT, RIGHT_ENTRY, RIGHT_EXIT } = SUB_POSITIONS[direction];

  // The libero only plays the back row. If it's sitting in the back-row slot
  // about to leave the back row (whether by rotating to the front or by subbing
  // out to a side bench), swap it to the libero bench first and let the libero
  // bench player rotate in its place.
  const frontRow = PLAYER_COUNT / 2;
  let backRowExit = -1;
  for (let s = frontRow; s < PLAYER_COUNT; s++) {
    if (rotationMap[s] < frontRow) {
      backRowExit = s;
      break;
    }
  }

  let currentPlayers = view.court;
  let liberoBench = view.liberoBench;
  if (backRowExit >= 0 && currentPlayers[backRowExit]?.position === 'libero') {
    const swapped = [...currentPlayers];
    liberoBench = swapped[backRowExit];        // libero goes to the libero bench
    swapped[backRowExit] = view.liberoBench;   // bench player comes onto the court
    currentPlayers = swapped;
  }

  // Forward: left bench top enters, right bench bottom enters (reversed for backward).
  const leftSubEntering = leftBench.length > 0
    ? (direction === 'forward' ? leftBench[0] : leftBench[leftBench.length - 1])
    : null;
  const rightSubEntering = rightBench.length > 0
    ? (direction === 'forward' ? rightBench[rightBench.length - 1] : rightBench[0])
    : null;

  const leftWillSub = !!leftSubEntering;
  const rightWillSub = !!rightSubEntering;

  const leftExitPlayer = currentPlayers[LEFT_EXIT];
  const rightExitPlayer = currentPlayers[RIGHT_EXIT];

  // Count girls that would remain after both potential exits
  let girlsRemaining = 0;
  for (let i = 0; i < PLAYER_COUNT; i++) {
    if (leftWillSub && i === LEFT_EXIT) continue;
    if (rightWillSub && i === RIGHT_EXIT) continue;
    if (currentPlayers[i]?.gender === 'female') girlsRemaining++;
  }

  let girlsEntering = 0;
  if (leftWillSub && leftSubEntering?.gender === 'female') girlsEntering++;
  if (rightWillSub && rightSubEntering?.gender === 'female') girlsEntering++;

  const totalGirlsAfter = girlsRemaining + girlsEntering;

  // Determine which exits need to be blocked to maintain min girls
  let blockLeftExit = false;
  let blockRightExit = false;

  if (autoFulfillMinGirls && totalGirlsAfter < minGirls) {
    const leftExitIsFemale = leftWillSub && leftExitPlayer?.gender === 'female';
    const rightExitIsFemale = rightWillSub && rightExitPlayer?.gender === 'female';

    const girlsIfBlockLeft = girlsRemaining + (leftExitIsFemale ? 1 : 0);
    const girlsIfBlockRight = girlsRemaining + (rightExitIsFemale ? 1 : 0);
    const girlsIfBlockBoth = girlsRemaining + (leftExitIsFemale ? 1 : 0) + (rightExitIsFemale ? 1 : 0);

    if (girlsIfBlockBoth + girlsEntering >= minGirls) {
      if (girlsIfBlockLeft + girlsEntering >= minGirls && leftExitIsFemale) {
        blockLeftExit = true;
      } else if (girlsIfBlockRight + girlsEntering >= minGirls && rightExitIsFemale) {
        blockRightExit = true;
      } else {
        if (leftExitIsFemale) blockLeftExit = true;
        if (rightExitIsFemale) blockRightExit = true;
      }
    } else {
      if (leftExitIsFemale) blockLeftExit = true;
      if (rightExitIsFemale) blockRightExit = true;
    }
  }

  const newPlayers: (Player | null)[] = new Array(PLAYER_COUNT).fill(null);

  const leftSubbing = leftWillSub && !blockLeftExit;
  const rightSubbing = rightWillSub && !blockRightExit;

  for (let slot = 0; slot < PLAYER_COUNT; slot++) {
    const player = currentPlayers[slot];

    if (slot === LEFT_EXIT) {
      if (blockLeftExit) {
        newPlayers[LEFT_ENTRY] = player;
      } else if (leftSubbing) {
        continue;
      } else {
        newPlayers[rotationMap[slot]] = player;
      }
      continue;
    }

    if (slot === RIGHT_EXIT) {
      if (blockRightExit) {
        newPlayers[RIGHT_ENTRY] = player;
      } else if (rightSubbing) {
        continue;
      } else {
        newPlayers[rotationMap[slot]] = player;
      }
      continue;
    }

    let nextSlot = rotationMap[slot];

    if (nextSlot === LEFT_ENTRY && (leftSubbing || blockLeftExit)) {
      nextSlot = rotationMap[LEFT_EXIT];
    }
    if (nextSlot === RIGHT_ENTRY && (rightSubbing || blockRightExit)) {
      nextSlot = rotationMap[RIGHT_EXIT];
    }

    newPlayers[nextSlot] = player;
  }

  if (leftSubbing && leftSubEntering) newPlayers[LEFT_ENTRY] = leftSubEntering;
  if (rightSubbing && rightSubEntering) newPlayers[RIGHT_ENTRY] = rightSubEntering;

  // Left bench - forward: top enters, exiting goes to bottom. backward: reversed.
  let newLeft = leftBench;
  if (leftSubbing && leftSubEntering && leftExitPlayer) {
    newLeft = direction === 'forward'
      ? [...leftBench.slice(1), leftExitPlayer]
      : [leftExitPlayer, ...leftBench.slice(0, -1)];
  }

  // Right bench - forward: bottom enters, exiting goes to top. backward: reversed.
  let newRight = rightBench;
  if (rightSubbing && rightSubEntering && rightExitPlayer) {
    newRight = direction === 'forward'
      ? [rightExitPlayer, ...rightBench.slice(0, -1)]
      : [...rightBench.slice(1), rightExitPlayer];
  }

  return { court: newPlayers, leftBench: newLeft, rightBench: newRight, liberoBench, subsBench: view.subsBench };
}

function cloneRotation(r: Rotation): Rotation {
  return {
    court: r.court.map((c) => ({ ...c })),
    leftBench: [...r.leftBench],
    rightBench: [...r.rightBench],
    liberoBench: [...r.liberoBench],
    subsBench: [...r.subsBench],
  };
}

// Re-derive every rotation that follows `startIndex` by applying rotate-forward
// from the phase that was edited, leaving rotations before `startIndex` intact.
// Editing serve mirrors into receive; editing receive leaves serve untouched.
// Followers are produced one per field player (serve/receive stored identically).
function hydrateFrom(lineup: Lineup, startIndex: number, phase: Phase, autoFulfillMinGirls: boolean): Lineup {
  const rotations = lineup.rotations.slice(0, startIndex + 1);

  const existing = rotations[startIndex] ?? { serve: createEmptyRotation(), receive: createEmptyRotation() };
  const startFormation = existing[phase];
  rotations[startIndex] = phase === 'serve'
    ? { serve: cloneRotation(startFormation), receive: cloneRotation(startFormation) }
    : { serve: existing.serve, receive: cloneRotation(startFormation) };

  let view = resolveRotationView(startFormation, lineup.roster);
  const total = Math.max(startIndex + 1, fieldCount(view) || 1);

  for (let i = startIndex + 1; i < total; i++) {
    view = rotateView(view, lineup.minGirls, autoFulfillMinGirls, 'forward');
    const formation = viewToRotation(view);
    rotations.push({ serve: formation, receive: cloneRotation(formation) });
  }

  return assignRotationalPositions({ ...lineup, roster: pruneRoster(lineup.roster, rotations), rotations });
}

interface AppProps {
  /** Override any subset of the default settings (e.g. when used as a package). */
  settings?: DeepPartial<LineupSettings>;
}

function App({ settings: settingsOverride }: AppProps = {}) {
  // Merge + validate consumer overrides exactly once, on first mount.
  const [settings] = useState(() => resolveSettings(settingsOverride));

  // Load all lineups from localStorage
  const [activeLineupIndex, setActiveLineupIndex] = useState(() => loadActiveIndex());
  const [lineups, setLineups] = useState<Lineup[]>(() => loadFromStorage(settings));

  // Which rotation/phase is currently being viewed and edited.
  const [activeRotation, setActiveRotation] = useState(0);
  const [activePhase, setActivePhase] = useState<Phase>('serve');

  // Get current lineup data
  const currentLineup = lineups[activeLineupIndex];
  console.log("currentLineup", currentLineup)
  const { minGirls, roster, rotationMethod } = currentLineup;

  // Resolve the active rotation to player objects for the UI / drag logic.
  const { court, leftBench, rightBench, liberoBench, subsBench, validation } = resolveView(currentLineup, activeRotation, activePhase, settings.validators);
  const courtRotationalPositions = currentLineup.rotations[activeRotation]?.[activePhase]?.court.map((c) => c.rotationalPosition) ?? [];

  // Per-rotation validity for the tracker (red border on invalid rotations).
  const rotationValidity = currentLineup.rotations.map((_, i) => validateRotation(currentLineup, i, activePhase, settings.validators).valid);

  // Players can only be added/edited/removed from the first rotation (both
  // methods). For the bench method, swaps are also locked on later rotations -
  // the only allowed action there is a libero replacement.
  const isModalLocked = activeRotation > 0;
  const isSwapLocked = rotationMethod === 'bench' && activeRotation > 0;

  // Transform the active rotation's resolved formation and write it back. Uses a
  // functional state update so multiple calls within one event compose.
  const updateView = (transform: (cur: View) => View) => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex
        ? writeView(lineup, transform(resolveView(lineup, activeRotation, activePhase)), activeRotation, activePhase, settings.minGirls.autoFulfill)
        : lineup
    ));
  };

  // One tracker step per stored rotation (which is derived from court + both
  // side benches). Hidden until the lineup has players.
  const rotationCount = Object.keys(roster).length > 0 ? currentLineup.rotations.length : 0;

  // Pick which phase to show when navigating to a rotation: prefer the invalid
  // phase so problems are visible. Default to serve (incl. when both are invalid
  // or both valid); only switch to receive when serve is valid but receive isn't.
  const preferredPhase = (index: number): Phase => {
    const serveValid = validateRotation(currentLineup, index, 'serve', settings.validators).valid;
    const receiveValid = validateRotation(currentLineup, index, 'receive', settings.validators).valid;
    return serveValid && !receiveValid ? 'receive' : 'serve';
  };

  const viewRotation = (index: number) => {
    setActiveRotation(index);
    setActivePhase(preferredPhase(index));
  };

  // minGirls affects how rotate-forward blocks female exits, so re-derive the
  // whole cascade from the base rotation.
  const setMinGirls = (min: number) =>
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? hydrateFrom({ ...lineup, minGirls: min }, 0, 'serve', settings.minGirls.autoFulfill) : lineup
    ));
  const setRotationMethod = (method: 'bench' | 'substitutions') => {
    setActiveRotation(0);
    setLineups(prev => prev.map((lineup, i) => {
      if (i !== activeLineupIndex || lineup.rotationMethod === method) return lineup;
      const updated = { ...lineup, rotationMethod: method };

      // Reslot the non-court players for the new method. Gather them (left bench,
      // then right bench, then subs) and redistribute:
      // - substitutions: all into the subs bench, side benches emptied.
      // - bench: fill the left bench (up to capacity), then the right; subs emptied.
      const base = resolveRotationView(updated.rotations[0].serve, updated.roster);
      const benchPlayers = [...base.leftBench, ...base.rightBench, ...base.subsBench];
      const moved: View = method === 'substitutions'
        ? { ...base, leftBench: [], rightBench: [], subsBench: benchPlayers }
        : {
          ...base,
          leftBench: benchPlayers.slice(0, settings.maxSizePerBench),
          rightBench: benchPlayers.slice(settings.maxSizePerBench),
          subsBench: [],
        };
      return writeView(updated, moved, 0, 'serve', settings.minGirls.autoFulfill);
    }));
  };
  const setCourt = (updater: (prev: (Player | null)[]) => (Player | null)[]) =>
    updateView(cur => ({ ...cur, court: updater(cur.court) }));
  const setLeftBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, leftBench: updater(cur.leftBench) }));
  const setRightBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, rightBench: updater(cur.rightBench) }));
  const setLibero = (player: Player | null) => updateView(cur => ({ ...cur, liberoBench: player }));
  const setSubsBench = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, subsBench: updater(cur.subsBench) }));

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveToStorage(activeLineupIndex, lineups);
  }, [activeLineupIndex, lineups]);

  // Check if there are any players
  const hasPlayers = Object.keys(roster).length > 0;

  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Reset all player data
  const handleResetClick = () => {
    setResetModalOpen(true);
  };

  const handleResetConfirm = () => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? createEmptyLineup(settings) : lineup
    ));
    setResetModalOpen(false);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{
    type: 'court' | 'bench' | 'newBench' | 'libero' | 'sub' | 'newSub';
    index: number;
    side?: 'left' | 'right';
  } | null>(null);

  // Check if all court slots are filled
  const isCourtFull = court.every((player) => player !== null);

  // Players can only be configured from rotation 1; later rotations are derived.
  const handleSlotClick = (slotIndex: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'court', index: slotIndex });
    setModalOpen(true);
  };

  const handleBenchClick = (side: 'left' | 'right', slotIndex: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'bench', index: slotIndex, side });
    setModalOpen(true);
  };

  const handleAddBench = (side: 'left' | 'right') => {
    if (isModalLocked) return;
    const bench = side === 'left' ? leftBench : rightBench;
    if (bench.length < settings.maxSizePerBench) {
      setEditingSlot({ type: 'newBench', index: bench.length, side });
      setModalOpen(true);
    }
  };

  const handleLiberoClick = () => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'libero', index: 0 });
    setModalOpen(true);
  };

  const handleSubClick = (index: number) => {
    if (isModalLocked) return;
    setEditingSlot({ type: 'sub', index });
    setModalOpen(true);
  };

  const handleAddSub = () => {
    if (isModalLocked) return;
    if (subsBench.length >= settings.maxSizePerBench * 2) return;
    setEditingSlot({ type: 'newSub', index: subsBench.length });
    setModalOpen(true);
  };

  const getCurrentPlayer = (): Player | null => {
    if (!editingSlot) return null;
    if (editingSlot.type === 'court') {
      return court[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'bench') {
      const bench = editingSlot.side === 'left' ? leftBench : rightBench;
      return bench[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'libero') {
      return liberoBench;
    } else if (editingSlot.type === 'sub') {
      return subsBench[editingSlot.index] ?? null;
    }
    return null; // newBench / newSub have no existing player
  };

  const handleSavePlayer = (playerData: Omit<Player, 'id'>) => {
    if (!editingSlot) return;

    const existingPlayer = getCurrentPlayer();
    const player: Player = {
      id: existingPlayer?.id || generateId(),
      ...playerData,
    };

    const appendOrReplace = (prev: Player[]) =>
      editingSlot.index >= prev.length
        ? [...prev, player]
        : prev.map((p, i) => (i === editingSlot.index ? player : p));

    if (editingSlot.type === 'court') {
      setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? player : p)));
    } else if (editingSlot.type === 'libero') {
      setLibero(player);
    } else if (editingSlot.type === 'sub' || editingSlot.type === 'newSub') {
      setSubsBench(appendOrReplace);
    } else {
      const setBench = editingSlot.side === 'left' ? setLeftBench : setRightBench;
      setBench(appendOrReplace);
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  const handleRemovePlayer = () => {
    if (!editingSlot) return;

    if (editingSlot.type === 'court') {
      // Find a replacement: left bench first (top to bottom), then right bench
      const fromLeft = leftBench.length > 0;
      const replacement = fromLeft ? leftBench[0] : rightBench[0] ?? null;

      if (replacement) {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? replacement : p)));
        if (fromLeft) {
          setLeftBench((prev) => prev.slice(1));
        } else {
          setRightBench((prev) => prev.slice(1));
        }
      } else {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? null : p)));
      }
    } else if (editingSlot.type === 'bench') {
      const setBench = editingSlot.side === 'left' ? setLeftBench : setRightBench;
      setBench((prev) => prev.filter((_, i) => i !== editingSlot.index));
    } else if (editingSlot.type === 'sub') {
      setSubsBench((prev) => prev.filter((_, i) => i !== editingSlot.index));
    } else if (editingSlot.type === 'libero') {
      setLibero(null);
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  // Step the viewed rotation forward/backward through the stored rotations,
  // wrapping around. Keeps the current serve/receive phase.
  const handleRotate = (direction: 'forward' | 'backward') => {
    const total = currentLineup.rotations.length;
    if (total <= 1) return;
    setActiveRotation((prev) =>
      direction === 'forward' ? (prev + 1) % total : (prev - 1 + total) % total
    );
    setActivePhase('serve');
  };

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  // Track the actively dragged player for overlay
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragPlayer, setActiveDragPlayer] = useState<Player | null>(null);
  // Message explaining why the current hover target can't be dropped on.
  const [dragToast, setDragToast] = useState<string | null>(null);

  // Parse slot ID helper
  const parseSlotId = (id: string): SlotRef | null => {
    if (id === 'libero') {
      return { type: 'libero' };
    } else if (id.startsWith('court-')) {
      return { type: 'court', index: parseInt(id.replace('court-', '')) };
    } else if (id.startsWith('bench-')) {
      const parts = id.replace('bench-', '').split('-');
      return { type: 'bench', side: parts[0] as 'left' | 'right', index: parseInt(parts[1]) };
    } else if (id.startsWith('sub-')) {
      return { type: 'sub', index: parseInt(id.replace('sub-', '')) };
    }
    return null;
  };

  // Get player from slot
  const getPlayerFromSlot = (slot: SlotRef): Player | null => {
    if (slot.type === 'court') {
      return court[slot.index] ?? null;
    } else if (slot.type === 'bench') {
      const bench = slot.side === 'left' ? leftBench : rightBench;
      return bench[slot.index] ?? null;
    } else if (slot.type === 'sub') {
      return subsBench[slot.index] ?? null;
    }
    return liberoBench;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);

    const slot = parseSlotId(id);
    if (slot) {
      setActiveDragPlayer(getPlayerFromSlot(slot) || null);
    }
  };

  // Court slots are laid out row-major in a 2x3 grid, so the back row is 3-5.
  const isBackRowCourtIndex = (index: number) => index >= PLAYER_COUNT / 2;

  // Why swapping `source` and `target` is not allowed, or null when it's fine.
  // Single source of truth for the drop handler, the drop-target highlight, and
  // the toast shown while dragging over an invalid target.
  const swapDenial = (source: SlotRef, target: SlotRef): string | null => {
    const sourcePlayer = getPlayerFromSlot(source);
    const targetPlayer = getPlayerFromSlot(target);

    const sourceIsLibero = sourcePlayer?.position === 'libero';
    const targetIsLibero = targetPlayer?.position === 'libero';
    const liberoInvolved = sourceIsLibero || targetIsLibero;
    const liberoBenchInvolved = source.type === 'libero' || target.type === 'libero';

    // On a locked (non-first bench) rotation, only libero replacements are allowed.
    if (isSwapLocked && !liberoInvolved) {
      return 'Order can only be changed from R1';
    }

    // Court players can't be dropped onto empty bench spots
    if (source.type === 'court' && target.type === 'bench' && !targetPlayer) {
      return 'Empty bench spot';
    }

    // Anything in/out of the libero bench has to involve the libero itself.
    if (liberoBenchInvolved && !liberoInvolved) {
      return 'Swap must include libero';
    }

    // When the libero is part of the swap (as the dragged or the replaced
    // player), it lands in the other slot - which must be the libero bench or a
    // back-row court slot, never the front row or a side bench.
    if (liberoInvolved) {
      const liberoDest = sourceIsLibero ? target : source;
      // The libero can only land on the libero bench or a back-row court slot.
      const landsOnBackRowCourt = liberoDest.type === 'court' && isBackRowCourtIndex(liberoDest.index);
      if (liberoDest.type !== 'libero' && !landsOnBackRowCourt) {
        return 'Libero must be back row';
      }
    }

    // The remaining rules are the same state checks used to validate any
    // rotation, so simulate the resulting lineup (the swap cascades into later
    // rotations) and reject the swap if the edited rotation fails validation.
    const after = writeView(
      currentLineup,
      swapInView({ court, leftBench, rightBench, liberoBench, subsBench }, source, target),
      activeRotation,
      activePhase,
      settings.minGirls.autoFulfill,
    );
    const { valid, messages } = validateRotation(after, activeRotation, activePhase, settings.validators);
    if (!valid) return messages[0];

    return null;
  };

  const canSwap = (source: SlotRef, target: SlotRef): boolean => swapDenial(source, target) === null;

  // Would dropping the active drag onto the slot with this id be accepted?
  // Used to drive the green drop-target highlight so it matches the drop logic.
  const canDropOnId = (id: string): boolean => {
    if (!activeId || activeId === id) return false;
    const source = parseSlotId(activeId);
    const target = parseSlotId(id);
    if (!source || !target) return false;
    return canSwap(source, target);
  };

  // While dragging, show a toast explaining why the hovered target is invalid.
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      setDragToast(null);
      return;
    }
    const source = parseSlotId(String(active.id));
    const target = parseSlotId(String(over.id));
    setDragToast(source && target ? swapDenial(source, target) : null);
  };

  // Drag was cancelled (e.g. dropped nowhere or Esc) - clear drag state + toast.
  const handleDragCancel = () => {
    setActiveDragPlayer(null);
    setDragToast(null);
  };

  // Handle drag end - every drop swaps the players in the two slots involved
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state
    setActiveId(null);
    setActiveDragPlayer(null);
    setDragToast(null);

    // Dropped outside any valid target, or back where it started - nothing to do
    if (!over || active.id === over.id) return;

    const activeSlot = parseSlotId(String(active.id));
    const overSlot = parseSlotId(String(over.id));
    if (!activeSlot || !overSlot) return;

    if (!canSwap(activeSlot, overSlot)) return;

    // Swap both slots' players in a single update so the rotations cascade once.
    updateView((cur) => swapInView(cur, activeSlot, overSlot));
  };

  // Render drag overlay content
  // Helper to create opaque background from position color
  const getOpaqueBackground = (hexColor: string) => {
    // Convert hex to RGB and blend with dark background
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    // Blend with dark bg (#1a1f2e) at ~15% and ~25% opacity
    const bgR = 26, bgG = 31, bgB = 46;
    const light = {
      r: Math.round(bgR + (r - bgR) * 0.15),
      g: Math.round(bgG + (g - bgG) * 0.15),
      b: Math.round(bgB + (b - bgB) * 0.15),
    };
    const dark = {
      r: Math.round(bgR + (r - bgR) * 0.25),
      g: Math.round(bgG + (g - bgG) * 0.25),
      b: Math.round(bgB + (b - bgB) * 0.25),
    };

    return `linear-gradient(135deg, rgb(${light.r}, ${light.g}, ${light.b}), rgb(${dark.r}, ${dark.g}, ${dark.b}))`;
  };

  const renderDragOverlay = () => {
    if (!activeDragPlayer) return null;

    const positionColor = activeDragPlayer.position ? POSITION_COLORS[activeDragPlayer.position] : '#4a5568';

    return (
      <div
        className="player-slot filled drag-overlay-item"
        style={{
          borderColor: positionColor,
          background: getOpaqueBackground(positionColor),
        }}
      >
        {activeDragPlayer.position && (
          <div
            className="player-position-badge"
            style={{ backgroundColor: positionColor }}
          >
            {POSITION_ABBREV[activeDragPlayer.position]}
          </div>
        )}
        <span className="player-name">{activeDragPlayer.name}</span>
        {activeId?.startsWith('court-') && (
          <span className="player-gender-label">
            {activeDragPlayer.gender === 'female' ? '(F)' : '(M)'}
          </span>
        )}
      </div>
    );
  };

  return (
    <SettingsContext.Provider value={settings}>
      <div className="app">
        <header className="header">
          <h1>Volleyball Lineup</h1>
        </header>

        <div className="lineup-tabs">
          {lineups.map((_, index) => (
            <button
              key={index}
              className={`lineup-tab ${index === activeLineupIndex ? 'active' : ''}`}
              onClick={() => {
                setActiveLineupIndex(index);
                viewRotation(0);
              }}
            >
              L{index + 1}
            </button>
          ))}
        </div>

        <main className="main">
          <RotationTracker
            count={rotationCount}
            activeIndex={activeRotation}
            onSelect={viewRotation}
            validity={rotationValidity}
          />
          {validation && !validation.valid && (
            <Toast messages={validation.messages} />
          )}
          <div className="container">
            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              onDragCancel={handleDragCancel}
            >
              <div className="arena-section">
                {rotationMethod === 'bench' && (
                  <Bench
                    label="BENCH"
                    className="left"
                    slotsClassName="side-bench-slots"
                    players={leftBench}
                    slotId={(i) => `bench-left-${i}`}
                    onSlotClick={(i) => handleBenchClick('left', i)}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={isCourtFull && !isModalLocked && leftBench.length < settings.maxSizePerBench}
                    onAdd={() => handleAddBench('left')}
                  />
                )}
                <div style={{ gridColumn: rotationMethod === 'bench' ? 'span 1' : 'span 3' }}>
                  <Court
                    court={court}
                    rotationalPositions={courtRotationalPositions}
                    onSlotClick={handleSlotClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    rotationNumber={activeRotation + 1}
                    phase={activePhase}
                    onPhaseChange={setActivePhase}
                  />
                </div>
                {rotationMethod === 'bench' && (
                  <Bench
                    label="BENCH"
                    className="right"
                    slotsClassName="side-bench-slots"
                    players={rightBench}
                    slotId={(i) => `bench-right-${i}`}
                    onSlotClick={(i) => handleBenchClick('right', i)}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={isCourtFull && !isModalLocked && rightBench.length < settings.maxSizePerBench}
                    onAdd={() => handleAddBench('right')}
                  />
                )}
              </div>
              <div className="arena-section">
                <div style={{ gridColumn: 'span 1' }}>
                  <Bench
                    label="LIBERO"
                    labelClassName="libero-bench-label"
                    slotsClassName="libero-slot"
                    players={liberoBench ? [liberoBench] : []}
                    slotId={() => 'libero'}
                    onSlotClick={handleLiberoClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={isCourtFull && !isModalLocked && !liberoBench}
                    onAdd={handleLiberoClick}
                  />
                </div>
                {rotationMethod === 'substitutions' && (
                  <Bench
                    label="SUBS"
                    className="subs-bench"
                    slotsClassName="subs-slots"
                    players={subsBench}
                    slotId={(i) => `sub-${i}`}
                    onSlotClick={handleSubClick}
                    draggingPlayerId={activeDragPlayer?.id}
                    canDropOnId={canDropOnId}
                    canAdd={isCourtFull && subsBench.length < settings.maxSizePerBench * 2 && !isModalLocked}
                    onAdd={handleAddSub}
                  />
                )}
              </div>
              <DragOverlay dropAnimation={null}>
                {activeId ? renderDragOverlay() : null}
              </DragOverlay>
            </DndContext>
            <Controls
              minGirls={minGirls}
              onMinGirlsChange={setMinGirls}
              onRotate={handleRotate}
              canRotate={rotationCount >= 6}
              rotationNumber={activeRotation + 1}
              rotationMethod={rotationMethod}
              onRotationMethodChange={setRotationMethod}
              onReset={handleResetClick}
              showReset={hasPlayers}
              lineupNumber={activeLineupIndex + 1}
            />
          </div>
        </main>

        <AddPlayerModal
          key={editingSlot ? `${editingSlot.type}-${editingSlot.side ?? ''}-${editingSlot.index}` : 'closed'}
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingSlot(null);
          }}
          onSave={handleSavePlayer}
          onRemove={getCurrentPlayer() ? handleRemovePlayer : undefined}
          existingPlayer={getCurrentPlayer()}
          isLibero={editingSlot?.type === 'libero'}
        />

        {/* Reset Confirmation Modal */}
        {resetModalOpen && (
          <div className="modal-overlay" onClick={() => setResetModalOpen(false)}>
            <div className="modal-content confirm-modal" onClick={(e) => e.stopPropagation()}>
              <button className="modal-close" onClick={() => setResetModalOpen(false)}>×</button>
              <h2>Reset Lineup {activeLineupIndex + 1}?</h2>
              <p className="confirm-message">All player data will be cleared. This cannot be undone.</p>
              <div className="confirm-actions">
                <button className="btn-confirm-reset" onClick={handleResetConfirm}>
                  Reset
                </button>
              </div>
            </div>
          </div>
        )}

        {dragToast && (
          <div className="toast-container" role="status">
            <Toast messages={dragToast} />
          </div>
        )}
      </div>
    </SettingsContext.Provider>
  );
}

export default App;
