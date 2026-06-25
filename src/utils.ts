// Framework-agnostic lineup logic, extracted from App so it can be unit-tested
// independently of React.
import type { Player } from './types';
import type { Rotation, Lineup, View, Phase, SlotRef, StoredData, ValidationContext, RotationPair } from './types';
import type { LineupSettings, ColorScheme, Theme, MethodValidators } from './config';
import { DEFAULT_SETTINGS, PLAYER_COUNT } from './config';
import { STORAGE_KEY, THEME_KEY, COURT_ROTATIONAL_POSITIONS, ROTATION_MAP, SUB_POSITIONS } from './constants';
import type { ShareLineup } from './share';

// Light mode reuses the configured accent/gender/position colours but swaps the
// dark backgrounds/text for light ones.
export function lightPalette(dark: ColorScheme): ColorScheme {
  return {
    ...dark,
    bgPrimary: '#f4f6fb',
    bgSecondary: '#ffffff',
    bgTertiary: '#e4e9f2',
    courtBg: '#e9f2ef',
    courtLines: '#bcdcd4',
    textPrimary: '#0f1419',
    textSecondary: '#52606d',
    textMuted: '#8a97a6',
    titleColor: '#0f1419',
    // Light tints of each position colour for the card backgrounds.
    positionBackgrounds: {
      setter: '#f8eac6',
      outside_hitter: '#c6d4f8',
      opposite_hitter: '#ffd6d6',
      libero: '#c4f1d7',
      middle_blocker: '#e3d0eb',
      defensive_specialist: '#f8dbc1',
    },
  };
}

// Stored preference wins; otherwise fall back to the configured default theme.
export function loadTheme(fallback: Theme): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function createEmptyRotation(): Rotation {
  return {
    court: Array.from({ length: PLAYER_COUNT }, () => ({ playerId: '' })),
    leftBench: [],
    rightBench: [],
    liberoBench: [],
    subsBench: [],
  };
}

export function createEmptyLineup(settings: LineupSettings): Lineup {
  return {
    minGirls: settings.minGirls.default,
    rotationMethod: 'bench',
    roster: {},
    rotations: [{ serve: createEmptyRotation(), receive: createEmptyRotation() }],
  };
}

// A lineup with no players - an unused slot, safe to import into without prompting.
export function isEmptyLineup(lineup: Lineup): boolean {
  return Object.keys(lineup.roster).length === 0;
}

// Rotate a slot->position layout one step forward, mirroring how the court
// players rotate (ROTATION_MAP). The label travels with the player to its new
// slot, so a non-subbing player keeps the same number across rotations.
export function rotateLayout(layout: number[]): number[] {
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
export function assignRotationalPositions(lineup: Lineup): Lineup {
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

    // Receive keeps each player's serve number. A player subbed in only on
    // receive isn't on the serve court, so it inherits the position of a player
    // that's on serve but not receive (the one it replaced), paired in order.
    const onReceive = new Set(r.receive.court.map((c) => c.playerId).filter(Boolean));
    const replacedPositions = r.serve.court
      .filter((c) => c.playerId && !onReceive.has(c.playerId))
      .map((c) => positionByPlayer.get(c.playerId));
    let nextReplaced = 0;
    const receivePositionFor = (playerId: string): number | undefined =>
      positionByPlayer.has(playerId) ? positionByPlayer.get(playerId) : replacedPositions[nextReplaced++];

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
          rotationalPosition: c.playerId ? receivePositionFor(c.playerId) : undefined,
        })),
      },
    };
  });

  return { ...lineup, rotations };
}

// Write a resolved View back into a lineup at the given rotation/phase:
// registers the players into the roster, stores ids, and prunes unreferenced
// players. Pads the rotations array with empty rotations up to `rotationIndex`.
export function writeView(lineup: Lineup, next: View, rotationIndex: number, phase: Phase, autoFulfillMinGirls: boolean): Lineup {
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

export function emptyView(): View {
  return { court: Array.from({ length: PLAYER_COUNT }, () => null), leftBench: [], rightBench: [], liberoBench: null, subsBench: [] };
}

// Resolve a single rotation's ids to player objects.
export function resolveRotationView(rotation: Rotation, roster: Record<string, Player>): View {
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
export function resolveView(lineup: Lineup, rotationIndex: number, phase: Phase, settings?: LineupSettings): View {
  const view = lineup.rotations[rotationIndex]?.[phase];
  const resolved = view ? resolveRotationView(view, lineup.roster) : emptyView();
  return { ...resolved, validation: validateRotation(lineup, rotationIndex, phase, settings) };
}

// Convert a resolved view back into id-based rotation data (players assumed to
// already live in the roster).
export function viewToRotation(view: View): Rotation {
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
export function fieldCount(view: View): number {
  const onCourt = view.court.filter((p) => p !== null).length;
  return onCourt + view.leftBench.length + view.rightBench.length;
}

// Swap the players occupying two slots within a view. Benches only hold filled
// positions, so any emptied bench slot is dropped.
export function swapInView(view: View, a: SlotRef, b: SlotRef): View {
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
export function liberoServeViolation(lineup: Lineup): string | null {
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
export function rotationalPositionViolation(lineup: Lineup): string | null {
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
export function validateRotation(
  lineup: Lineup,
  rotationIndex: number,
  phase: Phase,
  settings: LineupSettings = DEFAULT_SETTINGS,
): ValidationContext {
  const messages: string[] = [];
  const court = lineup.rotations[rotationIndex]?.[phase]?.court;

  // Only validate once the court is fully configured with 6 players; a partially
  // filled court (e.g. mid-setup) is treated as valid.
  if (!court || !court.every((c) => c.playerId)) {
    return { valid: true, messages };
  }

  // The roster may never exceed the configured maximum.
  if (Object.keys(lineup.roster).length > settings.maxRosterSize) {
    messages.push(`Roster cannot exceed ${settings.maxRosterSize} players`);
  }

  // The court must field at least `minGirls` females.
  const courtFemales = court.filter((c) => lineup.roster[c.playerId]?.gender === 'female').length;
  if (courtFemales < lineup.minGirls) {
    messages.push(`Must have ${lineup.minGirls} female${lineup.minGirls === 1 ? '' : 's'} on court`);
  }

  const liberoIssue = liberoServeViolation(lineup);
  if (liberoIssue) messages.push(liberoIssue);

  // Method-specific checks: built-in rules plus the custom validators configured
  // for that method.
  const runValidators = (list: MethodValidators[keyof MethodValidators]) => {
    for (const validate of list) messages.push(...validate(lineup, rotationIndex, phase).messages);
  };

  if (lineup.rotationMethod === 'bench') {
    runValidators(settings.validators.bench);
  }

  if (lineup.rotationMethod === 'substitutions') {
    const positionIssue = rotationalPositionViolation(lineup);
    if (positionIssue) messages.push(positionIssue);
    runValidators(settings.validators.substitutions);
  }

  return { valid: messages.length === 0, messages };
}

// Keep only roster entries still referenced by some rotation/phase.
export function pruneRoster(roster: Record<string, Player>, rotations: Lineup['rotations']): Record<string, Player> {
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

// When minGirls isn't user-editable, the control to change it isn't shown, so
// any value carried in by stored or shared data is meaningless - force it back
// to the configured default.
export function enforceMinGirls(lineup: Lineup, settings: LineupSettings): Lineup {
  if (settings.minGirls.editable) return lineup;
  return { ...lineup, minGirls: settings.minGirls.default };
}

export function loadFromStorage(settings: LineupSettings): Lineup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data = JSON.parse(stored) as StoredData;
      if (Array.isArray(data?.lineups)) {
        const lineups = data.lineups.slice();
        while (lineups.length < settings.numLineups) {
          lineups.push(createEmptyLineup(settings));
        }
        return lineups.map((l) => enforceMinGirls(l, settings));
      }
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return Array.from({ length: settings.numLineups }, () => createEmptyLineup(settings));
}

export function loadActiveIndex(): number {
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

export function saveToStorage(activeLineupIndex: number, lineups: Lineup[]): void {
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

export function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Apply one rotation step to a formation, subbing in from both side benches and
// (when `autoFulfillMinGirls` is set) blocking female exits as needed to keep at
// least `minGirls` on the court. The libero is swapped to the libero bench when
// it would leave the back row.
export function rotateView(view: View, minGirls: number, autoFulfillMinGirls: boolean, direction: 'forward' | 'backward'): View {
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

export function cloneRotation(r: Rotation): Rotation {
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
export function hydrateFrom(lineup: Lineup, startIndex: number, phase: Phase, autoFulfillMinGirls: boolean): Lineup {
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

// ----- Share encoding: store only rotations that aren't derivable from rot 0 -----

// Every rotation the app would produce by cascading rotation 0 forward.
export function deriveAllFromFirst(lineup: Lineup, autoFulfill: boolean): Lineup['rotations'] {
  if (lineup.rotations.length === 0) return [];
  return hydrateFrom({ ...lineup, rotations: [lineup.rotations[0]] }, 0, 'serve', autoFulfill).rotations;
}

// Compare two rotations by player placement only (rotationalPosition is derived).
export function sameRotation(a: RotationPair, b: RotationPair): boolean {
  const idsEq = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const sameForm = (x: Rotation, y: Rotation) =>
    x.court.length === y.court.length &&
    x.court.every((c, i) => c.playerId === y.court[i].playerId) &&
    idsEq(x.leftBench, y.leftBench) &&
    idsEq(x.rightBench, y.rightBench) &&
    idsEq(x.liberoBench, y.liberoBench) &&
    idsEq(x.subsBench, y.subsBench);
  return sameForm(a.serve, b.serve) && sameForm(a.receive, b.receive);
}

// Drop rotations equal to what rotation 0 would derive; keep custom ones.
export function minimizeLineup(lineup: Lineup, autoFulfill: boolean): ShareLineup {
  const derived = deriveAllFromFirst(lineup, autoFulfill);
  return {
    minGirls: lineup.minGirls,
    rotationMethod: lineup.rotationMethod,
    roster: lineup.roster,
    rotations: lineup.rotations.map((r, i) =>
      i > 0 && derived[i] && sameRotation(r, derived[i]) ? null : { serve: r.serve, receive: r.receive },
    ),
  };
}

// Rebuild a full lineup: derive from rotation 0, overlay the explicit rotations,
// then recompute rotational positions.
export function expandLineup(share: ShareLineup, autoFulfill: boolean): Lineup {
  const first = share.rotations[0];
  const base: Lineup = {
    minGirls: share.minGirls,
    rotationMethod: share.rotationMethod,
    roster: share.roster,
    rotations: [first ?? { serve: createEmptyRotation(), receive: createEmptyRotation() }],
  };
  const derived = deriveAllFromFirst(base, autoFulfill);
  const rotations = share.rotations
    .map((r, i) => r ?? derived[i])
    .filter((r): r is RotationPair => !!r);
  return assignRotationalPositions({ ...base, rotations });
}
