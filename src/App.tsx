import { useState, useCallback } from 'react';
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
// Counter-clockwise: 0 → 3 → 4 → 5 → 2 → 1 → 0
//
// LEFT sub: entry at 0 (front-left), exit at 3 (back-left)
// RIGHT sub: entry at 5 (back-right), exit at 2 (front-right)

// Clockwise (forward): where each slot moves TO
const CLOCKWISE_NEXT: Record<number, number> = {
  0: 1, 1: 2, 2: 5, 5: 4, 4: 3, 3: 0,
};

// Counter-clockwise (backward): where each slot moves TO
const COUNTER_CLOCKWISE_NEXT: Record<number, number> = {
  0: 3, 3: 4, 4: 5, 5: 2, 2: 1, 1: 0,
};

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
    const rotationMap = direction === 'forward' ? CLOCKWISE_NEXT : COUNTER_CLOCKWISE_NEXT;
    
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
    
    // Entry/exit positions depend on rotation direction
    const LEFT_ENTRY = direction === 'forward' ? 0 : 3;
    const LEFT_EXIT = direction === 'forward' ? 3 : 0;
    const RIGHT_ENTRY = direction === 'forward' ? 5 : 2;
    const RIGHT_EXIT = direction === 'forward' ? 2 : 5;
    
    // Determine which sides will sub based on availability
    const leftWillSub = !!leftSubEntering;
    const rightWillSub = !!rightSubEntering;
    
    // Get players at exit positions
    const leftExitPlayer = currentPlayers[LEFT_EXIT];
    const rightExitPlayer = currentPlayers[RIGHT_EXIT];
    
    // Count girls that would remain after both potential exits
    let girlsRemaining = 0;
    for (let i = 0; i < 6; i++) {
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
      if (leftWillSub && leftExitPlayer?.gender === 'female') {
        const girlsIfBlockLeft = girlsRemaining + 1;
        if (girlsIfBlockLeft + girlsEntering >= minGirls) {
          blockLeftExit = true;
        }
      }
      
      const currentGirls = girlsRemaining + (blockLeftExit ? 1 : 0) + girlsEntering;
      if (currentGirls < minGirls && rightWillSub && rightExitPlayer?.gender === 'female') {
        blockRightExit = true;
      }
    }
    
    // Create new player positions
    const newPlayers: (Player | null)[] = new Array(6).fill(null);
    
    const leftSubbing = leftWillSub && !blockLeftExit;
    const rightSubbing = rightWillSub && !blockRightExit;
    
    // Apply rotation
    for (let slot = 0; slot < 6; slot++) {
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
