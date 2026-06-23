import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import type { Player } from './types';
import { POSITION_COLORS, POSITION_ABBREV } from './types';
import type { DeepPartial, LineupSettings } from './config';
import { SettingsContext, resolveSettings, PLAYER_COUNT } from './config';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { LiberoBench } from './components/LiberoBench';
import { RotationTracker } from './components/RotationTracker';
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

interface Lineup {
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

type Phase = 'serve' | 'receive';

// A reference to any draggable/droppable slot in the app.
type SlotRef =
  | { type: 'court'; index: number }
  | { type: 'sub'; side: 'left' | 'right'; index: number }
  | { type: 'libero' };

// The active formation resolved to player objects - what the UI renders and the
// drag/rotate logic operates on. Court entries may be null (empty slots); bench
// entries are always filled.
type View = {
  court: (Player | null)[];
  leftSubs: Player[];
  rightSubs: Player[];
  libero: Player | null;
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

// For the substitutions method each court object carries a rotationalPosition
// (1-6) that follows the player: positions are seeded by the first rotation's
// court index, and every other rotation reuses the same player's position. Bench
// lineups carry no positions.
function assignRotationalPositions(lineup: Lineup): Lineup {
  const applyPositions = (rot: Rotation, positionFor: (playerId: string) => number | undefined): Rotation => ({
    ...rot,
    court: rot.court.map((c) => ({
      playerId: c.playerId,
      rotationalPosition: c.playerId ? positionFor(c.playerId) : undefined,
    })),
  });

  if (lineup.rotationMethod !== 'substitutions') {
    return {
      ...lineup,
      rotations: lineup.rotations.map((r) => ({
        serve: applyPositions(r.serve, () => undefined),
        receive: applyPositions(r.receive, () => undefined),
      })),
    };
  }

  const positionByPlayer = new Map<string, number>();
  lineup.rotations[0]?.serve.court.forEach((c, i) => {
    if (c.playerId) positionByPlayer.set(c.playerId, COURT_ROTATIONAL_POSITIONS[i]);
  });
  const positionFor = (playerId: string) => positionByPlayer.get(playerId);

  return {
    ...lineup,
    rotations: lineup.rotations.map((r) => ({
      serve: applyPositions(r.serve, positionFor),
      receive: applyPositions(r.receive, positionFor),
    })),
  };
}

// Write a resolved View back into a lineup at the given rotation/phase:
// registers the players into the roster, stores ids, and prunes unreferenced
// players. Pads the rotations array with empty rotations up to `rotationIndex`.
function writeView(lineup: Lineup, next: View, rotationIndex: number, phase: Phase): Lineup {
  const roster: Record<string, Player> = { ...lineup.roster };
  const register = (p: Player) => {
    roster[p.id] = p;
    return p.id;
  };

  const rotations = lineup.rotations.slice();
  while (rotations.length <= rotationIndex) {
    rotations.push({ serve: createEmptyRotation(), receive: createEmptyRotation() });
  }

  const prevView = rotations[rotationIndex][phase];
  const newView: Rotation = {
    court: next.court.map((p) => ({ playerId: p ? register(p) : '' })),
    leftBench: next.leftSubs.map(register),
    rightBench: next.rightSubs.map(register),
    liberoBench: next.libero ? [register(next.libero)] : [],
    subsBench: prevView.subsBench,
  };

  rotations[rotationIndex] = { ...rotations[rotationIndex], [phase]: newView };

  // Editing any rotation re-derives every rotation after it (predecessors stay).
  return hydrateFrom({ ...lineup, roster, rotations }, rotationIndex, phase);
}

function emptyView(): View {
  return { court: Array.from({ length: PLAYER_COUNT }, () => null), leftSubs: [], rightSubs: [], libero: null };
}

// Resolve a single rotation's ids to player objects.
function resolveRotationView(rotation: Rotation, roster: Record<string, Player>): View {
  const liberoId = rotation.liberoBench[0];
  return {
    court: rotation.court.map((c) => roster[c.playerId] ?? null),
    leftSubs: rotation.leftBench.map((id) => roster[id]).filter((p): p is Player => !!p),
    rightSubs: rotation.rightBench.map((id) => roster[id]).filter((p): p is Player => !!p),
    libero: liberoId ? roster[liberoId] ?? null : null,
  };
}

// Resolve a rotation's ids to player objects for rendering / logic. A rotation
// index past the end of the array (not built yet) resolves to an empty view.
function resolveView(lineup: Lineup, rotationIndex: number, phase: Phase): View {
  const view = lineup.rotations[rotationIndex]?.[phase];
  return view ? resolveRotationView(view, lineup.roster) : emptyView();
}

// Convert a resolved view back into id-based rotation data (players assumed to
// already live in the roster).
function viewToRotation(view: View, subsBench: string[] = []): Rotation {
  return {
    court: view.court.map((p) => ({ playerId: p ? p.id : '' })),
    leftBench: view.leftSubs.map((p) => p.id),
    rightBench: view.rightSubs.map((p) => p.id),
    liberoBench: view.libero ? [view.libero.id] : [],
    subsBench,
  };
}

// Number of rotations a bench lineup cycles through: the players on court plus
// both side benches (the libero bench is not counted).
function fieldCount(view: View): number {
  const onCourt = view.court.filter((p) => p !== null).length;
  return onCourt + view.leftSubs.length + view.rightSubs.length;
}

// Swap the players occupying two slots within a view. Benches only hold filled
// positions, so any emptied bench slot is dropped.
function swapInView(view: View, a: SlotRef, b: SlotRef): View {
  const court = [...view.court];
  const left: (Player | null)[] = [...view.leftSubs];
  const right: (Player | null)[] = [...view.rightSubs];
  let libero = view.libero;

  const read = (slot: SlotRef): Player | null => {
    if (slot.type === 'court') return court[slot.index] ?? null;
    if (slot.type === 'sub') return (slot.side === 'left' ? left : right)[slot.index] ?? null;
    return libero;
  };
  const write = (slot: SlotRef, player: Player | null) => {
    if (slot.type === 'court') court[slot.index] = player;
    else if (slot.type === 'sub') (slot.side === 'left' ? left : right)[slot.index] = player;
    else libero = player;
  };

  const playerA = read(a);
  const playerB = read(b);
  write(a, playerB);
  write(b, playerA);

  return {
    court,
    leftSubs: left.filter((p): p is Player => p !== null),
    rightSubs: right.filter((p): p is Player => p !== null),
    libero,
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
// blocking female exits as needed to keep at least `minGirls` on the court. The
// libero is swapped to the libero bench when it would leave the back row.
function rotateView(view: View, minGirls: number, direction: 'forward' | 'backward'): View {
  const { leftSubs, rightSubs } = view;
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
  let libero = view.libero;
  if (backRowExit >= 0 && currentPlayers[backRowExit]?.position === 'libero') {
    const swapped = [...currentPlayers];
    libero = swapped[backRowExit];        // libero goes to the libero bench
    swapped[backRowExit] = view.libero;   // bench player comes onto the court
    currentPlayers = swapped;
  }

  // Forward: left bench top enters, right bench bottom enters (reversed for backward).
  const leftSubEntering = leftSubs.length > 0
    ? (direction === 'forward' ? leftSubs[0] : leftSubs[leftSubs.length - 1])
    : null;
  const rightSubEntering = rightSubs.length > 0
    ? (direction === 'forward' ? rightSubs[rightSubs.length - 1] : rightSubs[0])
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

  if (totalGirlsAfter < minGirls) {
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
  let newLeft = leftSubs;
  if (leftSubbing && leftSubEntering && leftExitPlayer) {
    newLeft = direction === 'forward'
      ? [...leftSubs.slice(1), leftExitPlayer]
      : [leftExitPlayer, ...leftSubs.slice(0, -1)];
  }

  // Right bench - forward: bottom enters, exiting goes to top. backward: reversed.
  let newRight = rightSubs;
  if (rightSubbing && rightSubEntering && rightExitPlayer) {
    newRight = direction === 'forward'
      ? [rightExitPlayer, ...rightSubs.slice(0, -1)]
      : [...rightSubs.slice(1), rightExitPlayer];
  }

  return { court: newPlayers, leftSubs: newLeft, rightSubs: newRight, libero };
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
function hydrateFrom(lineup: Lineup, startIndex: number, phase: Phase): Lineup {
  const rotations = lineup.rotations.slice(0, startIndex + 1);

  const existing = rotations[startIndex] ?? { serve: createEmptyRotation(), receive: createEmptyRotation() };
  const startFormation = existing[phase];
  rotations[startIndex] = phase === 'serve'
    ? { serve: cloneRotation(startFormation), receive: cloneRotation(startFormation) }
    : { serve: existing.serve, receive: cloneRotation(startFormation) };

  let view = resolveRotationView(startFormation, lineup.roster);
  const total = Math.max(startIndex + 1, fieldCount(view) || 1);

  for (let i = startIndex + 1; i < total; i++) {
    view = rotateView(view, lineup.minGirls, 'forward');
    const formation = viewToRotation(view, startFormation.subsBench);
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
  const { court, leftSubs, rightSubs, libero } = resolveView(currentLineup, activeRotation, activePhase);

  // Players can only be added/edited/removed from the first rotation (both
  // methods). For the bench method, swaps are also locked on later rotations -
  // the only allowed action there is a libero replacement.
  const LOCK_MESSAGE = 'Lineup must be modified from rotation 1';
  const isModalLocked = activeRotation > 0;
  const isSwapLocked = rotationMethod === 'bench' && activeRotation > 0;

  // Transform the active rotation's resolved formation and write it back. Uses a
  // functional state update so multiple calls within one event compose.
  const updateView = (transform: (cur: View) => View) => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex
        ? writeView(lineup, transform(resolveView(lineup, activeRotation, activePhase)), activeRotation, activePhase)
        : lineup
    ));
  };

  // One tracker step per stored rotation (which is derived from court + both
  // side benches). Hidden until the lineup has players.
  const rotationCount = Object.keys(roster).length > 0 ? currentLineup.rotations.length : 0;

  const viewRotation = (index: number) => {
    setActiveRotation(index);
    setActivePhase('serve');
  };

  // minGirls affects how rotate-forward blocks female exits, so re-derive the
  // whole cascade from the base rotation.
  const setMinGirls = (min: number) =>
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? hydrateFrom({ ...lineup, minGirls: min }, 0, 'serve') : lineup
    ));
  const setRotationMethod = (method: 'bench' | 'substitutions') =>
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? assignRotationalPositions({ ...lineup, rotationMethod: method }) : lineup
    ));
  const setCourt = (updater: (prev: (Player | null)[]) => (Player | null)[]) =>
    updateView(cur => ({ ...cur, court: updater(cur.court) }));
  const setLeftSubs = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, leftSubs: updater(cur.leftSubs) }));
  const setRightSubs = (updater: (prev: Player[]) => Player[]) =>
    updateView(cur => ({ ...cur, rightSubs: updater(cur.rightSubs) }));
  const setLibero = (player: Player | null) => updateView(cur => ({ ...cur, libero: player }));

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
    type: 'court' | 'sub' | 'newSub' | 'libero';
    index: number;
    side?: 'left' | 'right';
  } | null>(null);

  // Check if all court slots are filled
  const isCourtFull = court.every((player) => player !== null);

  const handleSlotClick = (slotIndex: number) => {
    setEditingSlot({ type: 'court', index: slotIndex });
    setModalOpen(true);
  };

  const handleSubClick = (side: 'left' | 'right', slotIndex: number) => {
    setEditingSlot({ type: 'sub', index: slotIndex, side });
    setModalOpen(true);
  };

  const handleAddSub = (side: 'left' | 'right') => {
    const subs = side === 'left' ? leftSubs : rightSubs;
    if (subs.length < settings.maxSizePerBench) {
      setEditingSlot({ type: 'newSub', index: subs.length, side });
      setModalOpen(true);
    }
  };

  const handleLiberoClick = () => {
    setEditingSlot({ type: 'libero', index: 0 });
    setModalOpen(true);
  };

  const getCurrentPlayer = (): Player | null => {
    if (!editingSlot) return null;
    if (editingSlot.type === 'court') {
      return court[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'sub') {
      const subs = editingSlot.side === 'left' ? leftSubs : rightSubs;
      return subs[editingSlot.index] ?? null;
    } else if (editingSlot.type === 'libero') {
      return libero;
    }
    return null; // newSub type has no existing player
  };

  const handleSavePlayer = (playerData: Omit<Player, 'id'>) => {
    if (!editingSlot) return;

    const existingPlayer = getCurrentPlayer();
    const player: Player = {
      id: existingPlayer?.id || generateId(),
      ...playerData,
    };

    if (editingSlot.type === 'court') {
      setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? player : p)));
    } else if (editingSlot.type === 'libero') {
      setLibero(player);
    } else {
      const setSubs = editingSlot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs((prev) =>
        editingSlot.index >= prev.length
          ? [...prev, player]
          : prev.map((p, i) => (i === editingSlot.index ? player : p))
      );
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  const handleRemovePlayer = () => {
    if (!editingSlot) return;

    if (editingSlot.type === 'court') {
      // Find a replacement: left bench first (top to bottom), then right bench
      const fromLeft = leftSubs.length > 0;
      const replacement = fromLeft ? leftSubs[0] : rightSubs[0] ?? null;

      if (replacement) {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? replacement : p)));
        if (fromLeft) {
          setLeftSubs((prev) => prev.slice(1));
        } else {
          setRightSubs((prev) => prev.slice(1));
        }
      } else {
        setCourt((prev) => prev.map((p, i) => (i === editingSlot.index ? null : p)));
      }
    } else if (editingSlot.type === 'sub') {
      const setSubs = editingSlot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs((prev) => prev.filter((_, i) => i !== editingSlot.index));
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
    } else if (id.startsWith('sub-')) {
      const parts = id.replace('sub-', '').split('-');
      return { type: 'sub', side: parts[0] as 'left' | 'right', index: parseInt(parts[1]) };
    }
    return null;
  };

  // Get player from slot
  const getPlayerFromSlot = (slot: SlotRef): Player | null => {
    if (slot.type === 'court') {
      return court[slot.index] ?? null;
    } else if (slot.type === 'sub') {
      const subs = slot.side === 'left' ? leftSubs : rightSubs;
      return subs[slot.index] ?? null;
    }
    return libero;
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
      return LOCK_MESSAGE;
    }

    // Court players can't be dropped onto empty bench spots
    if (source.type === 'court' && target.type === 'sub' && !targetPlayer) {
      return 'Empty bench spot';
    }

    // Anything in/out of the libero bench has to involve the libero itself.
    if (liberoBenchInvolved && !liberoInvolved) {
      return 'Bench swap must include libero';
    }

    // When the libero is part of the swap (as the dragged or the replaced
    // player), it lands in the other slot - which must be the libero bench or a
    // back-row court slot, never the front row or a side bench.
    if (liberoInvolved) {
      const liberoDest = sourceIsLibero ? target : source;
      if (liberoDest.type === 'sub' || (liberoDest.type === 'court' && !isBackRowCourtIndex(liberoDest.index))) {
        return 'Libero must be back row';
      }
    }

    // A swap must keep at least `minGirls` females across the court positions
    const isFemale = (p: Player | null) => p?.gender === 'female';
    let courtFemales = court.filter(isFemale).length;
    if (source.type === 'court') {
      courtFemales += (isFemale(targetPlayer) ? 1 : 0) - (isFemale(sourcePlayer) ? 1 : 0);
    }
    if (target.type === 'court') {
      courtFemales += (isFemale(sourcePlayer) ? 1 : 0) - (isFemale(targetPlayer) ? 1 : 0);
    }
    if (courtFemales < minGirls) {
      return `Must have ${minGirls} female${minGirls === 1 ? '' : 's'} on court`;
    }

    // The libero may only serve for one player across all rotations. Simulate the
    // resulting lineup (the swap cascades into later rotations) and check.
    if (Object.values(roster).some((p) => p.position === 'libero')) {
      const after = writeView(
        currentLineup,
        swapInView({ court, leftSubs, rightSubs, libero }, source, target),
        activeRotation,
        activePhase,
      );
      const liberoIssue = liberoServeViolation(after);
      if (liberoIssue) return liberoIssue;
    }

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
          />
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="arena">
              <SubBench
                players={leftSubs}
                side="left"
                onSubClick={handleSubClick}
                onAddSub={handleAddSub}
                canAddSubs={isCourtFull}
                draggingPlayerId={activeDragPlayer?.id}
                canDropOnId={canDropOnId}
              />
              <Court
                court={court}
                onSlotClick={handleSlotClick}
                draggingPlayerId={activeDragPlayer?.id}
                canDropOnId={canDropOnId}
                rotationNumber={activeRotation + 1}
                phase={activePhase}
                onPhaseChange={setActivePhase}
              />
              <SubBench
                players={rightSubs}
                side="right"
                onSubClick={handleSubClick}
                onAddSub={handleAddSub}
                canAddSubs={isCourtFull}
                draggingPlayerId={activeDragPlayer?.id}
                canDropOnId={canDropOnId}
              />
            </div>
            <LiberoBench
              libero={libero}
              onClick={handleLiberoClick}
              canAdd={isCourtFull}
              isBeingDragged={activeId === 'libero'}
              isValidDropTarget={canDropOnId('libero')}
            />
            <DragOverlay dropAnimation={null}>
              {activeId ? renderDragOverlay() : null}
            </DragOverlay>
          </DndContext>

          <Controls
            minGirls={minGirls}
            onMinGirlsChange={setMinGirls}
            onRotate={handleRotate}
            canRotate={rotationCount >= 6}
            rotationMethod={rotationMethod}
            onRotationMethodChange={setRotationMethod}
            onReset={handleResetClick}
            showReset={hasPlayers}
            lineupNumber={activeLineupIndex + 1}
          />
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
          disabledReason={isModalLocked ? LOCK_MESSAGE : undefined}
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
          <div className="drag-toast-container" role="status">
            <div className="drag-toast">
              {dragToast}
            </div>
          </div>
        )}
      </div>
    </SettingsContext.Provider>
  );
}

export default App;
