import { useState } from 'react';
import type { Player, CourtSlot, SubSlot } from './types';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import './App.css';

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

// Helper to compact subs (remove gaps)
function compactSubs(subs: SubSlot[]): SubSlot[] {
  const filledPlayers = subs.filter((s) => s.player !== null).map((s) => s.player);
  return subs.map((s, i) => ({
    ...s,
    player: filledPlayers[i] || null,
  }));
}

function App() {
  const [playerCount, setPlayerCount] = useState(6);
  const [minGirls, setMinGirls] = useState(2);
  const [courtSlots, setCourtSlots] = useState<CourtSlot[]>(() =>
    Array.from({ length: 6 }, (_, i) => ({ player: null, slotIndex: i }))
  );
  const [leftSubs, setLeftSubs] = useState<SubSlot[]>(() =>
    Array.from({ length: 3 }, (_, i) => ({ player: null, side: 'left' as const, slotIndex: i }))
  );
  const [rightSubs, setRightSubs] = useState<SubSlot[]>(() =>
    Array.from({ length: 3 }, (_, i) => ({ player: null, side: 'right' as const, slotIndex: i }))
  );

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
      const leftFilledSubs = leftSubs.filter(s => s.player !== null);
      const rightFilledSubs = rightSubs.filter(s => s.player !== null);
      const availableSubs = [...leftFilledSubs, ...rightFilledSubs];
      
      const subsToMove = availableSubs.slice(0, newSlotCount);
      const leftSubsToRemove = subsToMove.filter(s => s.side === 'left').length;
      const rightSubsToRemove = subsToMove.filter(s => s.side === 'right').length;
      
      setCourtSlots((prev) => {
        const newSlots = Array.from({ length: newSlotCount }, (_, i) => ({
          player: subsToMove[i]?.player || null,
          slotIndex: oldCount + i,
        }));
        return [...prev, ...newSlots];
      });
      
      // Remove subs that moved to court
      if (leftSubsToRemove > 0) {
        setLeftSubs((prev) => {
          const remaining = prev.map((s, i) => ({
            ...s,
            player: i < leftSubsToRemove ? null : s.player,
          }));
          return compactSubs(remaining);
        });
      }
      if (rightSubsToRemove > 0) {
        setRightSubs((prev) => {
          const remaining = prev.map((s, i) => ({
            ...s,
            player: i < rightSubsToRemove ? null : s.player,
          }));
          return compactSubs(remaining);
        });
      }
    } else if (count < oldCount) {
      // Decreasing: move displaced players to subs (left top to bottom, then right top to bottom)
      const displacedPlayers = courtSlots.slice(count).map(s => s.player).filter((p): p is Player => p !== null);
      
      setCourtSlots((prev) => prev.slice(0, count).map((slot, i) => ({ ...slot, slotIndex: i })));
      
      // Add displaced players to sub benches
      if (displacedPlayers.length > 0) {
        const leftFilledCount = leftSubs.filter(s => s.player !== null).length;
        const rightFilledCount = rightSubs.filter(s => s.player !== null).length;
        const leftAvailable = 3 - leftFilledCount;
        const rightAvailable = 3 - rightFilledCount;
        
        const toLeft = displacedPlayers.slice(0, leftAvailable);
        const toRight = displacedPlayers.slice(leftAvailable, leftAvailable + rightAvailable);
        
        if (toLeft.length > 0) {
          setLeftSubs((prev) => {
            const filled = prev.filter(s => s.player !== null);
            const newSubs = [...filled.map(s => s.player), ...toLeft];
            return prev.map((s, i) => ({ ...s, player: newSubs[i] || null }));
          });
        }
        if (toRight.length > 0) {
          setRightSubs((prev) => {
            const filled = prev.filter(s => s.player !== null);
            const newSubs = [...filled.map(s => s.player), ...toRight];
            return prev.map((s, i) => ({ ...s, player: newSubs[i] || null }));
          });
        }
      }
    }
    
    setMinGirls((prev) => Math.min(prev, count));
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
    // Find the first empty slot
    const subs = side === 'left' ? leftSubs : rightSubs;
    const emptyIndex = subs.findIndex((s) => s.player === null);
    if (emptyIndex !== -1) {
      setEditingSlot({ type: 'newSub', index: emptyIndex, side });
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
      setSubs((prev) =>
        prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player } : slot
        )
      );
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
        
        // Remove sub from bench and compact
        if (leftFilledSub) {
          setLeftSubs((prev) => {
            const updated = prev.map((slot, i) =>
              i === leftFilledSub.slotIndex ? { ...slot, player: null } : slot
            );
            return compactSubs(updated);
          });
        } else {
          setRightSubs((prev) => {
            const updated = prev.map((slot, i) =>
              i === rightFilledSub!.slotIndex ? { ...slot, player: null } : slot
            );
            return compactSubs(updated);
          });
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
      
      // Try to find minimum blocking needed
      if (girlsIfBlockBoth + girlsEntering >= minGirls) {
        // Blocking both would work - now find minimum needed
        if (girlsIfBlockLeft + girlsEntering >= minGirls && leftExitIsFemale) {
          blockLeftExit = true;
        } else if (girlsIfBlockRight + girlsEntering >= minGirls && rightExitIsFemale) {
          blockRightExit = true;
        } else {
          // Need to block both
          if (leftExitIsFemale) blockLeftExit = true;
          if (rightExitIsFemale) blockRightExit = true;
        }
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
    // Forward: top enters, exiting goes to bottom. [A, B, null] -> [B, X, null]
    // Backward: bottom enters, exiting goes to top. [A, B, null] -> [X, A, null]
    if (leftSubbing && leftSubEntering && leftExitPlayer) {
      setLeftSubs((prev) => {
        const filledPlayers = prev.map((s) => s.player).filter((p): p is Player => p !== null);
        let newPlayers: Player[];
        
        if (direction === 'forward') {
          // Remove first (top), add exiting to end (bottom)
          newPlayers = [...filledPlayers.slice(1), leftExitPlayer];
        } else {
          // Remove last (bottom), add exiting to start (top)
          newPlayers = [leftExitPlayer, ...filledPlayers.slice(0, -1)];
        }
        
        return prev.map((s, i) => ({ ...s, player: newPlayers[i] || null }));
      });
    }
    
    // Update right subs based on direction
    // Forward: bottom enters, exiting goes to top. [A, B, C] -> [X, A, B]
    // Backward: top enters, exiting goes to bottom. [A, B, C] -> [B, C, X]
    if (rightSubbing && rightSubEntering && rightExitPlayer) {
      setRightSubs((prev) => {
        const filledPlayers = prev.map((s) => s.player).filter((p): p is Player => p !== null);
        let newPlayers: Player[];
        
        if (direction === 'forward') {
          // Remove last (bottom), add exiting to start (top)
          newPlayers = [rightExitPlayer, ...filledPlayers.slice(0, -1)];
        } else {
          // Remove first (top), add exiting to end (bottom)
          newPlayers = [...filledPlayers.slice(1), rightExitPlayer];
        }
        
        return prev.map((s, i) => ({ ...s, player: newPlayers[i] || null }));
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

  return (
    <div className="app">
      <header className="header">
        <h1>Volleyball Lineup</h1>
      </header>

      <main className="main">
        <div className="arena">
          <SubBench subs={leftSubs} side="left" onSubClick={handleSubClick} onAddSub={handleAddSub} canAddSubs={isCourtFull} />
          <Court slots={courtSlots} onSlotClick={handleSlotClick} />
          <SubBench subs={rightSubs} side="right" onSubClick={handleSubClick} onAddSub={handleAddSub} canAddSubs={isCourtFull} />
        </div>

        <Controls
          playerCount={playerCount}
          minGirls={minGirls}
          onPlayerCountChange={handlePlayerCountChange}
          onMinGirlsChange={setMinGirls}
          onRotate={handleRotate}
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
    </div>
  );
}

export default App;
