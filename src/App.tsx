import { useState, useCallback, useRef } from 'react';
import type { Player, CourtSlot, SubSlot } from './types';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import './App.css';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
}

// Volleyball court layout (6 players):
//         NET
//   [0]  [1]  [2]   <- Front row (left, middle, right)
//   [3]  [4]  [5]   <- Back row (left, middle, right)
//
// Clockwise rotation path: 0 → 1 → 2 → 5 → 4 → 3 → 0
//
// LEFT sub rotation:
//   - Sub enters at slot 0 (front left)
//   - Player at slot 3 (back left) exits
//
// RIGHT sub rotation:
//   - Sub enters at slot 5 (back right)
//   - Player at slot 2 (front right) exits

// Clockwise rotation: where each slot moves TO
const CLOCKWISE_NEXT: Record<number, number> = {
  0: 1, // front-left → front-middle
  1: 2, // front-middle → front-right
  2: 5, // front-right → back-right
  5: 4, // back-right → back-middle
  4: 3, // back-middle → back-left
  3: 0, // back-left → front-left
};

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
    type: 'court' | 'sub';
    index: number;
    side?: 'left' | 'right';
  } | null>(null);

  // Track which side was used last to alternate between left and right subs
  const lastSubSideRef = useRef<'left' | 'right'>('right'); // Start with right so first rotation uses left

  // Count girls currently on court
  const currentGirlsOnCourt = courtSlots.filter(
    (slot) => slot.player?.gender === 'female'
  ).length;

  // Update court slots when player count changes
  const handlePlayerCountChange = useCallback((count: number) => {
    setPlayerCount(count);
    setCourtSlots((prev) => {
      if (count > prev.length) {
        return [
          ...prev,
          ...Array.from({ length: count - prev.length }, (_, i) => ({
            player: null,
            slotIndex: prev.length + i,
          })),
        ];
      } else {
        return prev.slice(0, count).map((slot, i) => ({ ...slot, slotIndex: i }));
      }
    });
    // Adjust min girls if needed
    setMinGirls((prev) => Math.min(prev, count));
  }, []);

  const handleSlotClick = (slotIndex: number) => {
    setEditingSlot({ type: 'court', index: slotIndex });
    setModalOpen(true);
  };

  const handleSubClick = (side: 'left' | 'right', slotIndex: number) => {
    setEditingSlot({ type: 'sub', index: slotIndex, side });
    setModalOpen(true);
  };

  const getCurrentPlayer = (): Player | null => {
    if (!editingSlot) return null;
    if (editingSlot.type === 'court') {
      return courtSlots[editingSlot.index]?.player || null;
    } else {
      const subs = editingSlot.side === 'left' ? leftSubs : rightSubs;
      return subs[editingSlot.index]?.player || null;
    }
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
      setCourtSlots((prev) =>
        prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player: null } : slot
        )
      );
    } else {
      const setSubs = editingSlot.side === 'left' ? setLeftSubs : setRightSubs;
      setSubs((prev) =>
        prev.map((slot, i) =>
          i === editingSlot.index ? { ...slot, player: null } : slot
        )
      );
    }

    setModalOpen(false);
    setEditingSlot(null);
  };

  // Clockwise rotation logic that maintains minimum girls requirement
  const handleRotate = () => {
    const currentPlayers = courtSlots.map((slot) => slot.player);
    
    // Find available subs on each side
    const leftSubAvailable = leftSubs.find((s) => s.player !== null);
    const rightSubAvailable = rightSubs.find((s) => s.player !== null);
    
    // Determine which side to use - alternate between left and right
    let subSide: 'left' | 'right' | null = null;
    let subToUse: Player | null = null;
    let subSourceIndex: number | null = null;
    
    // Prefer the opposite side from last time, but fall back if not available
    const preferredSide = lastSubSideRef.current === 'left' ? 'right' : 'left';
    
    if (preferredSide === 'left' && leftSubAvailable) {
      subSide = 'left';
      subToUse = leftSubAvailable.player;
      subSourceIndex = leftSubAvailable.slotIndex;
    } else if (preferredSide === 'right' && rightSubAvailable) {
      subSide = 'right';
      subToUse = rightSubAvailable.player;
      subSourceIndex = rightSubAvailable.slotIndex;
    } else if (leftSubAvailable) {
      // Fallback to left if right not available
      subSide = 'left';
      subToUse = leftSubAvailable.player;
      subSourceIndex = leftSubAvailable.slotIndex;
    } else if (rightSubAvailable) {
      // Fallback to right if left not available
      subSide = 'right';
      subToUse = rightSubAvailable.player;
      subSourceIndex = rightSubAvailable.slotIndex;
    }
    
    // Update last used side
    if (subSide) {
      lastSubSideRef.current = subSide;
    }
    
    // Determine entry and exit slots based on sub side
    // LEFT: entry at 0 (front-left), exit at 3 (back-left)
    // RIGHT: entry at 5 (back-right), exit at 2 (front-right)
    const entrySlot = subSide === 'left' ? 0 : subSide === 'right' ? 5 : null;
    const exitSlot = subSide === 'left' ? 3 : subSide === 'right' ? 2 : null;
    
    // Get the player at exit position
    const exitingPlayer = exitSlot !== null ? currentPlayers[exitSlot] : null;
    
    // Check if rotating out this player would violate min girls requirement
    const girlsExcludingExit = currentPlayers.filter(
      (p, i) => i !== exitSlot && p?.gender === 'female'
    ).length;
    
    const wouldViolateMinGirls = 
      exitingPlayer?.gender === 'female' && 
      girlsExcludingExit < minGirls;
    
    // If we need a female sub but don't have one, check if girl must stay
    const girlMustStay = wouldViolateMinGirls && 
      (!subToUse || subToUse.gender !== 'female');
    
    // Create new player positions array
    const newPlayers: (Player | null)[] = new Array(6).fill(null);
    
    if (girlMustStay && exitSlot !== null && entrySlot !== null) {
      // The girl at exit position stays and moves to entry position
      // Everyone else rotates normally, but no one exits and no sub enters
      
      // Apply clockwise rotation for everyone except exit position
      for (let slot = 0; slot < 6; slot++) {
        if (slot === exitSlot) continue; // This player moves to entry slot instead
        const nextSlot = CLOCKWISE_NEXT[slot];
        // If the next slot is the entry slot, skip (girl is going there)
        if (nextSlot === entrySlot) {
          // This player would go to entry, but girl is taking that spot
          // So this player goes to where the girl would have gone (next after exit)
          const exitNextSlot = CLOCKWISE_NEXT[exitSlot];
          newPlayers[exitNextSlot] = currentPlayers[slot];
        } else {
          newPlayers[nextSlot] = currentPlayers[slot];
        }
      }
      
      // Girl at exit moves to entry slot
      newPlayers[entrySlot] = exitingPlayer;
      
      // No sub enters, no one goes out
      
    } else if (subSide !== null && entrySlot !== null && exitSlot !== null) {
      // Normal rotation with sub
      
      // Apply clockwise rotation
      for (let slot = 0; slot < 6; slot++) {
        if (slot === exitSlot) continue; // This player exits
        
        const nextSlot = CLOCKWISE_NEXT[slot];
        
        if (nextSlot === entrySlot) {
          // This slot would move to entry, but sub is entering there
          // So this player moves to where the exiting player was going (next after exit)
          const exitNextSlot = CLOCKWISE_NEXT[exitSlot];
          newPlayers[exitNextSlot] = currentPlayers[slot];
        } else {
          newPlayers[nextSlot] = currentPlayers[slot];
        }
      }
      
      // Sub enters at entry slot
      newPlayers[entrySlot] = subToUse;
      
      // Move exiting player to sub's spot on bench
      if (subSourceIndex !== null) {
        if (subSide === 'left') {
          setLeftSubs((prev) =>
            prev.map((s, i) =>
              i === subSourceIndex ? { ...s, player: exitingPlayer } : s
            )
          );
        } else {
          setRightSubs((prev) =>
            prev.map((s, i) =>
              i === subSourceIndex ? { ...s, player: exitingPlayer } : s
            )
          );
        }
      }
      
    } else {
      // No subs available - just rotate everyone clockwise
      for (let slot = 0; slot < 6; slot++) {
        const nextSlot = CLOCKWISE_NEXT[slot];
        newPlayers[nextSlot] = currentPlayers[slot];
      }
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
        <h1>🏐 Volleyball Lineup</h1>
        <p>Configure your team's rotation</p>
      </header>

      <main className="main">
        <div className="arena">
          <SubBench subs={leftSubs} side="left" onSubClick={handleSubClick} />
          <Court slots={courtSlots} onSlotClick={handleSlotClick} />
          <SubBench subs={rightSubs} side="right" onSubClick={handleSubClick} />
        </div>

        <Controls
          playerCount={playerCount}
          minGirls={minGirls}
          currentGirlsOnCourt={currentGirlsOnCourt}
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
