import { useState, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, TouchSensor } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Player, CourtSlot, SubSlot } from './types';
import { POSITION_COLORS, POSITION_ABBREV } from './types';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import './App.css';

const STORAGE_KEY = 'volleyball-lineup-data-v2';
const NUM_LINEUPS = 6;
const MAX_SUBS_PER_SIDE = 4;

interface Lineup {
  playerCount: number;
  minGirls: number;
  courtSlots: CourtSlot[];
  leftSubs: SubSlot[];
  rightSubs: SubSlot[];
}

interface StoredData {
  activeLineupIndex: number;
  lineups: Lineup[];
}

function createEmptyLineup(): Lineup {
  return {
    playerCount: 6,
    minGirls: 2,
    courtSlots: Array.from({ length: 6 }, (_, i) => ({ player: null, slotIndex: i })),
    leftSubs: [],
    rightSubs: [],
  };
}

function migrateLineup(lineup: Lineup): Lineup {
  // Remove empty sub slots from old format - we now only store filled subs
  lineup.leftSubs = lineup.leftSubs.filter(s => s.player !== null);
  lineup.rightSubs = lineup.rightSubs.filter(s => s.player !== null);
  return lineup;
}

function loadFromStorage(): Lineup[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredData = JSON.parse(stored);
      const lineups = data.lineups.map(migrateLineup);
      // Ensure we have all lineups
      while (lineups.length < NUM_LINEUPS) {
        lineups.push(createEmptyLineup());
      }
      return lineups;
    }
  } catch (e) {
    console.error('Failed to load from localStorage:', e);
  }
  return Array.from({ length: NUM_LINEUPS }, () => createEmptyLineup());
}

function loadActiveIndex(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const data: StoredData = JSON.parse(stored);
      return data.activeLineupIndex ?? 0;
    }
  } catch (e) {
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

// Get grid layout based on player count (matches Court.tsx)
function getGridLayout(playerCount: number) {
  if (playerCount <= 3) {
    return { rows: 1, cols: playerCount };
  } else if (playerCount === 4) {
    return { rows: 2, cols: 2 };
  } else if (playerCount <= 6) {
    return { rows: 2, cols: 3 };
  }
  return { rows: 2, cols: 3 }; // Default for safety
}

// Generate clockwise rotation path for any grid layout
// Clockwise: top row L→R, then down right side, bottom row R→L, then up left side
function generateClockwiseRotation(playerCount: number): Record<number, number> {
  if (playerCount <= 1) return { 0: 0 };
  
  const { rows, cols } = getGridLayout(playerCount);
  const path: number[] = [];
  
  if (rows === 1) {
    // Single row: just go left to right, wrap around
    for (let i = 0; i < playerCount; i++) path.push(i);
  } else {
    // Multi-row: perimeter clockwise
    // Top row (left to right)
    for (let c = 0; c < cols; c++) path.push(c);
    // Right side going down (skip top-right, already added)
    for (let r = 1; r < rows; r++) {
      const idx = r * cols + (cols - 1);
      if (idx < playerCount) path.push(idx);
    }
    // Bottom row (right to left, skip bottom-right, already added)
    for (let c = cols - 2; c >= 0; c--) {
      const idx = (rows - 1) * cols + c;
      if (idx < playerCount) path.push(idx);
    }
    // Left side going up (skip bottom-left and top-left, already added)
    for (let r = rows - 2; r >= 1; r--) {
      const idx = r * cols;
      if (idx < playerCount) path.push(idx);
    }
  }
  
  // Remove duplicates while maintaining order
  const uniquePath = [...new Set(path)];
  
  // Create rotation map: each slot maps to the next slot in path
  const rotationMap: Record<number, number> = {};
  for (let i = 0; i < uniquePath.length; i++) {
    const current = uniquePath[i];
    const next = uniquePath[(i + 1) % uniquePath.length];
    rotationMap[current] = next;
  }
  
  return rotationMap;
}

// Generate counter-clockwise rotation (reverse of clockwise)
function generateCounterClockwiseRotation(playerCount: number): Record<number, number> {
  const clockwise = generateClockwiseRotation(playerCount);
  const counterClockwise: Record<number, number> = {};
  
  // Reverse the mapping
  for (const [from, to] of Object.entries(clockwise)) {
    counterClockwise[Number(to)] = Number(from);
  }
  
  return counterClockwise;
}

// Get entry/exit positions for subs based on player count and direction
function getSubPositions(playerCount: number, direction: 'forward' | 'backward') {
  const { rows, cols } = getGridLayout(playerCount);
  
  // LEFT sub positions: front-left (0) and back-left (first slot of last row)
  const frontLeft = 0;
  const backLeft = (rows - 1) * cols;
  
  // RIGHT sub positions: front-right (last of first row) and back-right (last slot)
  const frontRight = cols - 1;
  const backRight = Math.min((rows - 1) * cols + (cols - 1), playerCount - 1);
  
  if (direction === 'forward') {
    return {
      LEFT_ENTRY: frontLeft,
      LEFT_EXIT: backLeft < playerCount ? backLeft : frontLeft,
      RIGHT_ENTRY: backRight,
      RIGHT_EXIT: frontRight,
    };
  } else {
    return {
      LEFT_ENTRY: backLeft < playerCount ? backLeft : frontLeft,
      LEFT_EXIT: frontLeft,
      RIGHT_ENTRY: frontRight,
      RIGHT_EXIT: backRight,
    };
  }
}

// Helper to compact subs (remove empty slots)
function compactSubs(subs: SubSlot[]): SubSlot[] {
  return subs.filter((s) => s.player !== null);
}

function App() {
  // Load all lineups from localStorage
  const [activeLineupIndex, setActiveLineupIndex] = useState(() => loadActiveIndex());
  const [lineups, setLineups] = useState<Lineup[]>(() => loadFromStorage());

  // Get current lineup data
  const currentLineup = lineups[activeLineupIndex];
  const { playerCount, minGirls, courtSlots, leftSubs, rightSubs } = currentLineup;

  // Update functions that modify the current lineup
  const updateCurrentLineup = (updates: Partial<Lineup>) => {
    setLineups(prev => prev.map((lineup, i) => 
      i === activeLineupIndex ? { ...lineup, ...updates } : lineup
    ));
  };

  const setPlayerCount = (count: number) => updateCurrentLineup({ playerCount: count });
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

  // Save to localStorage whenever state changes
  useEffect(() => {
    saveToStorage(activeLineupIndex, lineups);
  }, [activeLineupIndex, lineups]);

  // Check if there are any players
  const hasPlayers = courtSlots.some(s => s.player !== null) || 
    leftSubs.some(s => s.player !== null) || 
    rightSubs.some(s => s.player !== null);

  const [resetModalOpen, setResetModalOpen] = useState(false);

  // Reset all player data
  const handleResetClick = () => {
    setResetModalOpen(true);
  };

  const handleResetConfirm = () => {
    setLineups(prev => prev.map((lineup, i) => 
      i === activeLineupIndex ? createEmptyLineup() : lineup
    ));
    setResetModalOpen(false);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{
    type: 'court' | 'sub' | 'newSub';
    index: number;
    side?: 'left' | 'right';
  } | null>(null);

  // Check if all court slots are filled
  const isCourtFull = courtSlots.every((slot) => slot.player !== null);

  // Update court slots when player count changes
  const handlePlayerCountChange = (count: number) => {
    const oldCount = playerCount;
    setPlayerCount(count);
    
    if (count > oldCount) {
      // Increasing: fill new slots from subs (left top to bottom, then right top to bottom)
      const newSlotCount = count - oldCount;
      const leftPlayers = leftSubs.map(s => s.player).filter((p): p is Player => p !== null);
      const rightPlayers = rightSubs.map(s => s.player).filter((p): p is Player => p !== null);
      const availablePlayers = [...leftPlayers, ...rightPlayers];
      
      const playersToMove = availablePlayers.slice(0, newSlotCount);
      const leftSubsToRemove = Math.min(leftPlayers.length, newSlotCount);
      const rightSubsToRemove = Math.max(0, newSlotCount - leftPlayers.length);
      
      setCourtSlots((prev) => {
        const newSlots = Array.from({ length: newSlotCount }, (_, i) => ({
          player: playersToMove[i] || null,
          slotIndex: oldCount + i,
        }));
        return [...prev, ...newSlots];
      });
      
      // Remove subs that moved to court
      if (leftSubsToRemove > 0) {
        setLeftSubs((prev) => prev.slice(leftSubsToRemove));
      }
      if (rightSubsToRemove > 0) {
        setRightSubs((prev) => prev.slice(rightSubsToRemove));
      }
    } else if (count < oldCount) {
      // Decreasing: prioritize displacing men over women, but keep original order
      const numToDisplace = oldCount - count;
      const allPlayers = courtSlots
        .map((s, i) => ({ player: s.player, originalIndex: i }))
        .filter((s): s is { player: Player; originalIndex: number } => s.player !== null);
      
      // Select players to displace: men first (from end), then women (from end)
      const men = allPlayers.filter(p => p.player.gender === 'male').reverse();
      const women = allPlayers.filter(p => p.player.gender === 'female').reverse();
      const toDisplaceIndices = new Set<number>();
      
      // Add men first (from end of court)
      for (const p of men) {
        if (toDisplaceIndices.size >= numToDisplace) break;
        toDisplaceIndices.add(p.originalIndex);
      }
      // Then women if needed (from end of court)
      for (const p of women) {
        if (toDisplaceIndices.size >= numToDisplace) break;
        toDisplaceIndices.add(p.originalIndex);
      }
      
      // Keep players in original order, excluding displaced
      const playersToKeep = allPlayers
        .filter(p => !toDisplaceIndices.has(p.originalIndex))
        .map(p => p.player);
      const displacedPlayers = allPlayers
        .filter(p => toDisplaceIndices.has(p.originalIndex))
        .map(p => p.player);
      
      // Rebuild court with kept players in original order
      setCourtSlots((prev) => 
        prev.slice(0, count).map((slot, i) => ({ 
          ...slot, 
          slotIndex: i,
          player: playersToKeep[i] || null,
        }))
      );
      
      // Add displaced players to sub benches
      if (displacedPlayers.length > 0) {
        const leftAvailable = MAX_SUBS_PER_SIDE - leftSubs.length;
        const rightAvailable = MAX_SUBS_PER_SIDE - rightSubs.length;
        
        const toLeft = displacedPlayers.slice(0, leftAvailable);
        const toRight = displacedPlayers.slice(leftAvailable, leftAvailable + rightAvailable);
        
        if (toLeft.length > 0) {
          setLeftSubs((prev) => [
            ...prev,
            ...toLeft.map((player) => ({ player }))
          ]);
        }
        if (toRight.length > 0) {
          setRightSubs((prev) => [
            ...prev,
            ...toRight.map((player) => ({ player }))
          ]);
        }
      }
    }
    
    setMinGirls(Math.min(minGirls, count));
  };

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
    if (subs.length < MAX_SUBS_PER_SIDE) {
      setEditingSlot({ type: 'newSub', index: subs.length, side });
      setModalOpen(true);
    }
  };

  const getCurrentPlayer = (): Player | null => {
    if (!editingSlot) return null;
    if (editingSlot.type === 'court') {
      return courtSlots[editingSlot.index]?.player || null;
    } else if (editingSlot.type === 'sub') {
      const subs = editingSlot.side === 'left' ? leftSubs : rightSubs;
      return subs[editingSlot.index]?.player || null;
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
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  // Rotation logic supporting both sides subbing in simultaneously
  const handleRotate = (direction: 'forward' | 'backward') => {
    const currentPlayers = courtSlots.map((slot) => slot.player);
    const rotationMap = direction === 'forward' 
      ? generateClockwiseRotation(playerCount) 
      : generateCounterClockwiseRotation(playerCount);
    
    // Get dynamic entry/exit positions based on player count
    const { LEFT_ENTRY, LEFT_EXIT, RIGHT_ENTRY, RIGHT_EXIT } = getSubPositions(playerCount, direction);
    
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
    for (let i = 0; i < playerCount; i++) {
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
    const newPlayers: (Player | null)[] = new Array(playerCount).fill(null);
    
    const leftSubbing = leftWillSub && !blockLeftExit;
    const rightSubbing = rightWillSub && !blockRightExit;
    
    // Apply rotation
    for (let slot = 0; slot < playerCount; slot++) {
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
  const [originalCourtSlots, setOriginalCourtSlots] = useState<CourtSlot[] | null>(null);
  const [originalSlotIndex, setOriginalSlotIndex] = useState<number | null>(null);

  // Parse slot ID helper
  const parseSlotId = (id: string) => {
    if (id.startsWith('court-')) {
      return { type: 'court' as const, index: parseInt(id.replace('court-', '')) };
    } else if (id.startsWith('sub-')) {
      const parts = id.replace('sub-', '').split('-');
      return { type: 'sub' as const, side: parts[0] as 'left' | 'right', index: parseInt(parts[1]) };
    }
    return null;
  };

  // Get player from slot
  const getPlayerFromSlot = (slot: { type: 'court'; index: number } | { type: 'sub'; side: 'left' | 'right'; index: number }) => {
    if (slot.type === 'court') {
      return courtSlots[slot.index]?.player;
    } else {
      const subs = slot.side === 'left' ? leftSubs : rightSubs;
      return subs[slot.index]?.player;
    }
  };

  // Check if moving a player to sub would violate min girls requirement
  const wouldViolateMinGirls = (player: Player | null | undefined, incomingSub: Player | null | undefined) => {
    if (!player || player.gender !== 'female') return false;
    
    // Count current girls on court
    const currentGirls = courtSlots.filter(s => s.player?.gender === 'female').length;
    
    // If incoming sub is also female, no violation
    if (incomingSub?.gender === 'female') return false;
    
    // Would removing this female violate the requirement?
    return currentGirls - 1 < minGirls;
  };

  // Handle drag start
  const handleDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    setActiveId(id);
    
    const slot = parseSlotId(id);
    if (slot) {
      const player = getPlayerFromSlot(slot);
      setActiveDragPlayer(player || null);
      
      // Save original state for court drags so we can restore if dropped back at original position
      if (slot.type === 'court') {
        setOriginalCourtSlots([...courtSlots]);
        setOriginalSlotIndex(slot.index);
      }
    }
  };

  // Handle drag over - for live reordering of court slots
  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    
    const activeSlot = parseSlotId(String(active.id));
    
    // Helper to restore court to original state if needed
    const restoreOriginalIfNeeded = () => {
      if (originalCourtSlots && activeDragPlayer && originalSlotIndex !== null) {
        const currentIndex = courtSlots.findIndex(s => s.player?.id === activeDragPlayer.id);
        if (currentIndex !== originalSlotIndex) {
          setCourtSlots(originalCourtSlots);
        }
      }
    };
    
    // If dragging outside valid targets, restore original state immediately
    if (!over) {
      restoreOriginalIfNeeded();
      return;
    }

    const overSlot = parseSlotId(String(over.id));
    
    if (!activeSlot || !overSlot) return;

    // If dragging from court to non-court (e.g., sub), restore original court state
    // This ensures the swap will happen from the original position
    if (activeSlot.type === 'court' && overSlot.type !== 'court') {
      restoreOriginalIfNeeded();
      return;
    }

    // Only live reorder for court-to-court
    if (activeSlot.type === 'court' && overSlot.type === 'court') {
      // Find the current index of the dragged player by their ID
      // since the player may have moved from the original slot
      if (!activeDragPlayer) return;
      
      const currentIndex = courtSlots.findIndex(s => s.player?.id === activeDragPlayer.id);
      const newIndex = overSlot.index;
      
      // Only reorder if the player isn't already at this position
      if (currentIndex !== -1 && currentIndex !== newIndex) {
        setCourtSlots(prev => {
          const newSlots = arrayMove(prev, currentIndex, newIndex);
          return newSlots.map((slot, i) => ({ ...slot, slotIndex: i }));
        });
      }
    }
  };

  // Handle drag cancel (when dropped outside valid targets or ESC pressed)
  const handleDragCancel = () => {
    // Restore original state if we have it
    if (originalCourtSlots) {
      setCourtSlots(originalCourtSlots);
    }
    
    // Clear drag state
    setActiveId(null);
    setActiveDragPlayer(null);
    setOriginalCourtSlots(null);
    setOriginalSlotIndex(null);
  };

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    const origSlots = originalCourtSlots;
    const origIndex = originalSlotIndex;
    const draggedPlayer = activeDragPlayer;
    
    // Clear drag state
    setActiveId(null);
    setActiveDragPlayer(null);
    setOriginalCourtSlots(null);
    setOriginalSlotIndex(null);
    
    // If dropped outside any valid target, restore original state
    if (!over) {
      if (origSlots) {
        setCourtSlots(origSlots);
      }
      return;
    }
    
    // If dropped on the same slot ID as started (original position), restore
    if (active.id === over.id) {
      if (origSlots) {
        setCourtSlots(origSlots);
      }
      return;
    }
    
    const activeSlot = parseSlotId(String(active.id));
    const overSlot = parseSlotId(String(over.id));
    
    if (!activeSlot || !overSlot) return;

    // Check if court drag ended at the original position
    if (overSlot.type === 'court' && origIndex !== null && overSlot.index === origIndex && origSlots) {
      // Dropped back at original position - restore original state
      setCourtSlots(origSlots);
      return;
    }

    const activePlayer = getPlayerFromSlot(activeSlot);
    const overPlayer = getPlayerFromSlot(overSlot);
    
    // Rule 4: Court players can't be dragged to empty sub spots
    if (activeSlot.type === 'court' && overSlot.type === 'sub' && !overPlayer) {
      return;
    }

    // Rule: Prevent dragging female to sub if it violates min girls
    if (activeSlot.type === 'court' && overSlot.type === 'sub') {
      if (wouldViolateMinGirls(activePlayer, overPlayer)) {
        return;
      }
    }
    
    // Court to Court is already handled in dragOver, so skip here
    if (activeSlot.type === 'court' && overSlot.type === 'court') {
      return;
    }
    
    // Case 2 & 3: Court to Sub or Sub to Court - swap
    if ((activeSlot.type === 'court' && overSlot.type === 'sub') ||
      (activeSlot.type === 'sub' && overSlot.type === 'court')) {
      const subSlot = activeSlot.type === 'sub' ? activeSlot : overSlot;
      const subSide = (subSlot as { side: 'left' | 'right'; index: number }).side;
      const subIndex = (subSlot as { side: 'left' | 'right'; index: number }).index;
      const subs = subSide === 'left' ? leftSubs : rightSubs;
      const subPlayer = subs[subIndex]?.player;

      // Find the court player's CURRENT position (may have changed due to live reordering)
      let courtPlayerIndex: number;
      let courtPlayer: Player | null;
      
      if (activeSlot.type === 'court' && draggedPlayer) {
        // Dragging from court to sub - find where the dragged player currently is
        courtPlayerIndex = courtSlots.findIndex(s => s.player?.id === draggedPlayer.id);
        courtPlayer = draggedPlayer;
      } else {
        // Dragging from sub to court - use the target court slot
        courtPlayerIndex = (overSlot as { index: number }).index;
        courtPlayer = courtSlots[courtPlayerIndex]?.player ?? null;
      }

      if (courtPlayerIndex === -1) return;

      // Check min girls for court-to-sub swap
      if (activeSlot.type === 'court') {
        if (wouldViolateMinGirls(courtPlayer, subPlayer)) {
          return;
        }
      }

      // Check min girls for sub-to-court swap too
      if (activeSlot.type === 'sub') {
        if (wouldViolateMinGirls(courtPlayer, subPlayer)) {
          return;
        }
      }
      
      // Swap players
      setCourtSlots(prev => prev.map((slot, i) => 
        i === courtPlayerIndex ? { ...slot, player: subPlayer } : slot
      ));
      
      const setSubs = subSide === 'left' ? setLeftSubs : setRightSubs;
      setSubs(prev => prev.map((slot, i) => 
        i === subIndex ? { ...slot, player: courtPlayer } : slot
      ));
    }
    
    // Case: Sub to Sub (same or different side) - swap
    if (activeSlot.type === 'sub' && overSlot.type === 'sub') {
      const activeSide = (activeSlot as { side: 'left' | 'right'; index: number }).side;
      const activeIndex = (activeSlot as { side: 'left' | 'right'; index: number }).index;
      const overSide = (overSlot as { side: 'left' | 'right'; index: number }).side;
      const overIndex = (overSlot as { side: 'left' | 'right'; index: number }).index;
      
      if (activeSide === overSide) {
        // Same side - swap within
        const setSubs = activeSide === 'left' ? setLeftSubs : setRightSubs;
        setSubs(prev => {
          const newSubs = [...prev];
          const temp = newSubs[activeIndex].player;
          newSubs[activeIndex] = { ...newSubs[activeIndex], player: newSubs[overIndex].player };
          newSubs[overIndex] = { ...newSubs[overIndex], player: temp };
          return newSubs;
        });
      } else {
        // Different sides - swap across
        const activeSubs = activeSide === 'left' ? leftSubs : rightSubs;
        const overSubs = overSide === 'left' ? leftSubs : rightSubs;
        const activePlayer = activeSubs[activeIndex]?.player;
        const overPlayer = overSubs[overIndex]?.player;
        
        const setActiveSubs = activeSide === 'left' ? setLeftSubs : setRightSubs;
        const setOverSubs = overSide === 'left' ? setLeftSubs : setRightSubs;
        
        setActiveSubs(prev => prev.map((s, i) => i === activeIndex ? { ...s, player: overPlayer } : s));
        setOverSubs(prev => prev.map((s, i) => i === overIndex ? { ...s, player: activePlayer } : s));
      }
    }
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
      </div>
    );
  };

  return (
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
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div className="arena">
            <SubBench 
              subs={leftSubs} 
              side="left" 
              onSubClick={handleSubClick} 
              onAddSub={handleAddSub} 
              canAddSubs={isCourtFull} 
              draggingPlayerId={activeDragPlayer?.id}
              draggingPlayer={activeDragPlayer}
              minGirls={minGirls}
              currentGirlsOnCourt={courtSlots.filter(s => s.player?.gender === 'female').length}
              isDraggingFromCourt={activeId?.startsWith('court-') ?? false}
            />
            <Court 
              slots={courtSlots} 
              onSlotClick={handleSlotClick} 
              draggingPlayerId={activeDragPlayer?.id}
              draggingPlayer={activeDragPlayer}
              minGirls={minGirls}
              isDraggingFromSub={activeId?.startsWith('sub-') ?? false}
            />
            <SubBench 
              subs={rightSubs} 
              side="right" 
              onSubClick={handleSubClick} 
              onAddSub={handleAddSub} 
              canAddSubs={isCourtFull} 
              draggingPlayerId={activeDragPlayer?.id}
              draggingPlayer={activeDragPlayer}
              minGirls={minGirls}
              currentGirlsOnCourt={courtSlots.filter(s => s.player?.gender === 'female').length}
              isDraggingFromCourt={activeId?.startsWith('court-') ?? false}
            />
          </div>
          <DragOverlay dropAnimation={null}>
            {activeId ? renderDragOverlay() : null}
          </DragOverlay>
        </DndContext>

        <Controls
          playerCount={playerCount}
          minGirls={minGirls}
          onPlayerCountChange={handlePlayerCountChange}
          onMinGirlsChange={setMinGirls}
          onRotate={handleRotate}
          onReset={handleResetClick}
          showReset={hasPlayers}
          lineupNumber={activeLineupIndex + 1}
        />
      </main>

      <AddPlayerModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingSlot(null);
        }}
        onSave={handleSavePlayer}
        onRemove={getCurrentPlayer() ? handleRemovePlayer : undefined}
        existingPlayer={getCurrentPlayer()}
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
  );
}

export default App;
