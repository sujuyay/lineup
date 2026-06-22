import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import type { Player, CourtSlot, SubSlot } from './types';
import { POSITION_COLORS, POSITION_ABBREV } from './types';
import type { DeepPartial, LineupSettings } from './config';
import { SettingsContext, resolveSettings, PLAYER_COUNT } from './config';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { LiberoBench } from './components/LiberoBench';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import './App.css';

const STORAGE_KEY = 'volleyball-lineup-data-v2';

interface Lineup {
  minGirls: number;
  courtSlots: CourtSlot[];
  leftSubs: SubSlot[];
  rightSubs: SubSlot[];
  libero: Player | null;
}

interface StoredData {
  activeLineupIndex: number;
  lineups: Lineup[];
}

// A reference to any draggable/droppable slot in the app.
type SlotRef =
  | { type: 'court'; index: number }
  | { type: 'sub'; side: 'left' | 'right'; index: number }
  | { type: 'libero' };

function createEmptyLineup(settings: LineupSettings): Lineup {
  return {
    minGirls: settings.minGirls.default,
    courtSlots: Array.from({ length: PLAYER_COUNT }, (_, i) => ({ player: null, slotIndex: i })),
    leftSubs: [],
    rightSubs: [],
    libero: null,
  };
}

function migrateLineup(lineup: Lineup): Lineup {
  // Remove empty sub slots from old format - we now only store filled subs
  lineup.leftSubs = lineup.leftSubs.filter(s => s.player !== null);
  lineup.rightSubs = lineup.rightSubs.filter(s => s.player !== null);
  // Older saved lineups predate the libero slot
  lineup.libero = lineup.libero ?? null;
  // Normalize to a fixed six-player court (older data could be 4 or 5)
  const slots = (lineup.courtSlots ?? []).slice(0, PLAYER_COUNT);
  while (slots.length < PLAYER_COUNT) slots.push({ player: null, slotIndex: slots.length });
  lineup.courtSlots = slots.map((s, i) => ({ player: s.player, slotIndex: i }));
  return lineup;
}

function loadFromStorage(settings: LineupSettings): Lineup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredData = JSON.parse(stored);
      const lineups = data.lineups.map(migrateLineup);
      // Ensure we have all lineups
      while (lineups.length < settings.numLineups) {
        lineups.push(createEmptyLineup(settings));
      }
      return lineups;
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

// Helper to compact subs (remove empty slots)
function compactSubs(subs: SubSlot[]): SubSlot[] {
  return subs.filter((s) => s.player !== null);
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

  // Get current lineup data
  const currentLineup = lineups[activeLineupIndex];
  console.log("currentLineup", currentLineup)
  const { minGirls, courtSlots, leftSubs, rightSubs, libero } = currentLineup;

  // Update functions that modify the current lineup
  const updateCurrentLineup = (updates: Partial<Lineup>) => {
    setLineups(prev => prev.map((lineup, i) =>
      i === activeLineupIndex ? { ...lineup, ...updates } : lineup
    ));
  };

  const setMinGirls = (min: number) => updateCurrentLineup({ minGirls: min });
  const setCourtSlots = (updater: CourtSlot[] | ((prev: CourtSlot[]) => CourtSlot[])) => {
    setLineups(prev => prev.map((lineup, i) => {
      if (i !== activeLineupIndex) return lineup;
      const newSlots = typeof updater === 'function' ? updater(lineup.courtSlots) : updater;
      return { ...lineup, courtSlots: newSlots };
    }));
  };
  const setLeftSubs = (updater: SubSlot[] | ((prev: SubSlot[]) => SubSlot[])) => {
    setLineups(prev => prev.map((lineup, i) => {
      if (i !== activeLineupIndex) return lineup;
      const newSubs = typeof updater === 'function' ? updater(lineup.leftSubs) : updater;
      return { ...lineup, leftSubs: newSubs };
    }));
  };
  const setRightSubs = (updater: SubSlot[] | ((prev: SubSlot[]) => SubSlot[])) => {
    setLineups(prev => prev.map((lineup, i) => {
      if (i !== activeLineupIndex) return lineup;
      const newSubs = typeof updater === 'function' ? updater(lineup.rightSubs) : updater;
      return { ...lineup, rightSubs: newSubs };
    }));
  };
  const setLibero = (player: Player | null) => updateCurrentLineup({ libero: player });

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveToStorage(activeLineupIndex, lineups);
  }, [activeLineupIndex, lineups]);

  // Check if there are any players
  const hasPlayers = courtSlots.some(s => s.player !== null) ||
    leftSubs.some(s => s.player !== null) ||
    rightSubs.some(s => s.player !== null) ||
    libero !== null;

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
  const isCourtFull = courtSlots.every((slot) => slot.player !== null);

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
      return courtSlots[editingSlot.index]?.player || null;
    } else if (editingSlot.type === 'sub') {
      const subs = editingSlot.side === 'left' ? leftSubs : rightSubs;
      return subs[editingSlot.index]?.player || null;
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
      setCourtSlots((prev) =>
        prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player } : slot
        )
      );
    } else if (editingSlot.type === 'libero') {
      setLibero(player);
    } else {
      const setSubs = editingSlot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs((prev) => {
        // If adding a new sub (index equals array length), push new slot
        if (editingSlot.index >= prev.length) {
          return [...prev, { player }];
        }
        // Otherwise update existing slot
        return prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player } : slot
        );
      });
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  const handleRemovePlayer = () => {
    if (!editingSlot) return;

    if (editingSlot.type === 'court') {
      // Find a replacement sub: left side first (top to bottom), then right side (top to bottom)
      const leftFilledSub = leftSubs.find((s) => s.player !== null);
      const rightFilledSub = rightSubs.find((s) => s.player !== null);
      const replacementSub = leftFilledSub || rightFilledSub;

      if (replacementSub) {
        // Replace court player with sub
        setCourtSlots((prev) =>
          prev.map((slot, i) =>
            i === editingSlot.index ? { ...slot, player: replacementSub.player } : slot
          )
        );

        // Remove sub from bench (first filled sub was used)
        if (leftFilledSub) {
          setLeftSubs((prev) => prev.slice(1));
        } else {
          setRightSubs((prev) => prev.slice(1));
        }
      } else {
        // No subs available, just remove the player
        setCourtSlots((prev) =>
          prev.map((slot, i) =>
            i === editingSlot.index ? { ...slot, player: null } : slot
          )
        );
      }
    } else if (editingSlot.type === 'sub') {
      const setSubs = editingSlot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs((prev) => {
        const updated = prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player: null } : slot
        );
        // Compact the subs to remove gaps
        return compactSubs(updated);
      });
    } else if (editingSlot.type === 'libero') {
      setLibero(null);
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  // Rotation logic supporting both sides subbing in simultaneously
  const handleRotate = (direction: 'forward' | 'backward') => {
    const currentPlayers = courtSlots.map((slot) => slot.player);
    const rotationMap = ROTATION_MAP[direction];

    const { LEFT_ENTRY, LEFT_EXIT, RIGHT_ENTRY, RIGHT_EXIT } = SUB_POSITIONS[direction];

    // Get filled subs on each side
    const leftFilledSubs = leftSubs.filter((s) => s.player !== null);
    const rightFilledSubs = rightSubs.filter((s) => s.player !== null);

    // Forward rotation:
    //   LEFT side: top sub enters, exiting player goes to bottom
    //   RIGHT side: bottom sub enters, exiting player goes to top
    // Backward rotation (reversed):
    //   LEFT side: bottom sub enters, exiting player goes to top
    //   RIGHT side: top sub enters, exiting player goes to bottom
    const leftSubEntering = leftFilledSubs.length > 0
      ? (direction === 'forward' ? leftFilledSubs[0] : leftFilledSubs[leftFilledSubs.length - 1])
      : null;
    const rightSubEntering = rightFilledSubs.length > 0
      ? (direction === 'forward' ? rightFilledSubs[rightFilledSubs.length - 1] : rightFilledSubs[0])
      : null;

    // Determine which sides will sub based on availability
    const leftWillSub = !!leftSubEntering;
    const rightWillSub = !!rightSubEntering;

    // Get players at exit positions
    const leftExitPlayer = currentPlayers[LEFT_EXIT];
    const rightExitPlayer = currentPlayers[RIGHT_EXIT];

    // Count girls that would remain after both potential exits
    let girlsRemaining = 0;
    for (let i = 0; i < PLAYER_COUNT; i++) {
      if (leftWillSub && i === LEFT_EXIT) continue;
      if (rightWillSub && i === RIGHT_EXIT) continue;
      if (currentPlayers[i]?.gender === 'female') girlsRemaining++;
    }

    // Count girls coming in from subs
    let girlsEntering = 0;
    if (leftWillSub && leftSubEntering?.player?.gender === 'female') girlsEntering++;
    if (rightWillSub && rightSubEntering?.player?.gender === 'female') girlsEntering++;

    // Check if rotation would violate min girls
    const totalGirlsAfter = girlsRemaining + girlsEntering;

    // Determine which exits need to be blocked to maintain min girls
    let blockLeftExit = false;
    let blockRightExit = false;

    if (totalGirlsAfter < minGirls) {
      const leftExitIsFemale = leftWillSub && leftExitPlayer?.gender === 'female';
      const rightExitIsFemale = rightWillSub && rightExitPlayer?.gender === 'female';

      // Calculate girls we'd have if we block various combinations
      const girlsIfBlockLeft = girlsRemaining + (leftExitIsFemale ? 1 : 0);
      const girlsIfBlockRight = girlsRemaining + (rightExitIsFemale ? 1 : 0);
      const girlsIfBlockBoth = girlsRemaining + (leftExitIsFemale ? 1 : 0) + (rightExitIsFemale ? 1 : 0);

      // Try to find minimum blocking needed to maximize girls on court
      // Even if we can't meet minGirls, we should still block female exits to keep as many girls as possible
      if (girlsIfBlockBoth + girlsEntering >= minGirls) {
        // Blocking can satisfy the requirement - find minimum needed
        if (girlsIfBlockLeft + girlsEntering >= minGirls && leftExitIsFemale) {
          blockLeftExit = true;
        } else if (girlsIfBlockRight + girlsEntering >= minGirls && rightExitIsFemale) {
          blockRightExit = true;
        } else {
          // Need to block both
          if (leftExitIsFemale) blockLeftExit = true;
          if (rightExitIsFemale) blockRightExit = true;
        }
      } else {
        // Can't satisfy requirement even with blocking, but still block all female exits
        // to keep as many girls on court as possible
        if (leftExitIsFemale) blockLeftExit = true;
        if (rightExitIsFemale) blockRightExit = true;
      }
    }

    // Create new player positions
    const newPlayers: (Player | null)[] = new Array(PLAYER_COUNT).fill(null);

    const leftSubbing = leftWillSub && !blockLeftExit;
    const rightSubbing = rightWillSub && !blockRightExit;

    // Apply rotation
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

    // Place subs at entry positions
    if (leftSubbing && leftSubEntering) {
      newPlayers[LEFT_ENTRY] = leftSubEntering.player;
    }
    if (rightSubbing && rightSubEntering) {
      newPlayers[RIGHT_ENTRY] = rightSubEntering.player;
    }

    // Update left subs based on direction
    // Forward: top enters, exiting goes to bottom. [A, B] -> [B, X]
    // Backward: bottom enters, exiting goes to top. [A, B] -> [X, A]
    if (leftSubbing && leftSubEntering && leftExitPlayer) {
      setLeftSubs((prev) => {
        const players = prev.map((s) => s.player).filter((p): p is Player => p !== null);
        let newPlayers: Player[];

        if (direction === 'forward') {
          // Remove first (top), add exiting to end (bottom)
          newPlayers = [...players.slice(1), leftExitPlayer];
        } else {
          // Remove last (bottom), add exiting to start (top)
          newPlayers = [leftExitPlayer, ...players.slice(0, -1)];
        }

        return newPlayers.map((player) => ({ player }));
      });
    }

    // Update right subs based on direction
    // Forward: bottom enters, exiting goes to top. [A, B, C] -> [X, A, B]
    // Backward: top enters, exiting goes to bottom. [A, B, C] -> [B, C, X]
    if (rightSubbing && rightSubEntering && rightExitPlayer) {
      setRightSubs((prev) => {
        const players = prev.map((s) => s.player).filter((p): p is Player => p !== null);
        let newPlayers: Player[];

        if (direction === 'forward') {
          // Remove last (bottom), add exiting to start (top)
          newPlayers = [rightExitPlayer, ...players.slice(0, -1)];
        } else {
          // Remove first (top), add exiting to end (bottom)
          newPlayers = [...players.slice(1), rightExitPlayer];
        }

        return newPlayers.map((player) => ({ player }));
      });
    }

    // Update court slots
    setCourtSlots((prev) =>
      prev.map((slot, i) => ({
        ...slot,
        player: newPlayers[i],
      }))
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
      return courtSlots[slot.index]?.player ?? null;
    } else if (slot.type === 'sub') {
      const subs = slot.side === 'left' ? leftSubs : rightSubs;
      return subs[slot.index]?.player ?? null;
    }
    return libero;
  };

  // Write a single player into a slot (used by the swap below)
  const writePlayerToSlot = (slot: SlotRef, player: Player | null) => {
    if (slot.type === 'court') {
      setCourtSlots(prev => prev.map((s, i) => (i === slot.index ? { ...s, player } : s)));
    } else if (slot.type === 'sub') {
      const setSubs = slot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs(prev => prev.map((s, i) => (i === slot.index ? { ...s, player } : s)));
    } else {
      setLibero(player);
    }
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

  // Whether swapping the players in `source` and `target` is allowed. Single
  // source of truth for both the drop handler and the drop-target highlight.
  const canSwap = (source: SlotRef, target: SlotRef): boolean => {
    const sourcePlayer = getPlayerFromSlot(source);
    const targetPlayer = getPlayerFromSlot(target);

    // Court players can't be dropped onto empty bench spots
    if (source.type === 'court' && target.type === 'sub' && !targetPlayer) return false;

    const sourceIsLibero = sourcePlayer?.position === 'libero';
    const targetIsLibero = targetPlayer?.position === 'libero';

    // Every swap touching the libero bench must be driven by the libero itself
    // (so a player who got bumped onto the bench can't leave on their own), and
    // the libero bench only ever pairs with a court slot.
    if (source.type === 'libero' || target.type === 'libero') {
      if (!sourceIsLibero) return false;
      const other = source.type === 'libero' ? target : source;
      if (other.type !== 'court') return false;
    }
    // An on-court libero may only swap with the libero bench - never with another
    // court player or side bench (regardless of which side initiates the drag).
    if (sourceIsLibero && source.type === 'court' && target.type !== 'libero') return false;
    if (targetIsLibero && target.type === 'court' && source.type !== 'libero') return false;

    // The libero may only play the back row, so it can only be swapped onto a
    // back-row court player.
    if (sourceIsLibero && source.type === 'libero' && target.type === 'court' && !isBackRowCourtIndex(target.index)) {
      return false;
    }

    // A swap must keep at least `minGirls` females across the court positions
    const isFemale = (p: Player | null) => p?.gender === 'female';
    let courtFemales = courtSlots.filter(s => isFemale(s.player)).length;
    if (source.type === 'court') {
      courtFemales += (isFemale(targetPlayer) ? 1 : 0) - (isFemale(sourcePlayer) ? 1 : 0);
    }
    if (target.type === 'court') {
      courtFemales += (isFemale(sourcePlayer) ? 1 : 0) - (isFemale(targetPlayer) ? 1 : 0);
    }
    if (courtFemales < minGirls) return false;

    return true;
  };

  // Would dropping the active drag onto the slot with this id be accepted?
  // Used to drive the green drop-target highlight so it matches the drop logic.
  const canDropOnId = (id: string): boolean => {
    if (!activeId || activeId === id) return false;
    const source = parseSlotId(activeId);
    const target = parseSlotId(id);
    if (!source || !target) return false;
    return canSwap(source, target);
  };

  // Handle drag end - every drop swaps the players in the two slots involved
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Clear drag state
    setActiveId(null);
    setActiveDragPlayer(null);

    // Dropped outside any valid target, or back where it started - nothing to do
    if (!over || active.id === over.id) return;

    const activeSlot = parseSlotId(String(active.id));
    const overSlot = parseSlotId(String(over.id));
    if (!activeSlot || !overSlot) return;

    if (!canSwap(activeSlot, overSlot)) return;

    // Swap the two slots' players. Functional updaters compose, so two writes to
    // the same underlying array (e.g. same-bench sub swap) apply correctly.
    writePlayerToSlot(activeSlot, getPlayerFromSlot(overSlot));
    writePlayerToSlot(overSlot, getPlayerFromSlot(activeSlot));
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
              onClick={() => setActiveLineupIndex(index)}
            >
              L{index + 1}
            </button>
          ))}
        </div>

        <main className="main">
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="arena">
              <SubBench
                subs={leftSubs}
                side="left"
                onSubClick={handleSubClick}
                onAddSub={handleAddSub}
                canAddSubs={isCourtFull}
                draggingPlayerId={activeDragPlayer?.id}
                canDropOnId={canDropOnId}
              />
              <Court
                slots={courtSlots}
                onSlotClick={handleSlotClick}
                draggingPlayerId={activeDragPlayer?.id}
                canDropOnId={canDropOnId}
              />
              <SubBench
                subs={rightSubs}
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
      </div>
    </SettingsContext.Provider>
  );
}

export default App;
