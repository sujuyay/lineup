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

  // Rotation logic supporting both sides subbing in simultaneously
  const handleRotate = (direction: 'forward' | 'backward') => {
    const currentPlayers = courtSlots.map((slot) => slot.player);
    const rotationMap = direction === 'forward' ? CLOCKWISE_NEXT : COUNTER_CLOCKWISE_NEXT;
    
    // Find available subs on each side
    const leftSubAvailable = leftSubs.find((s) => s.player !== null);
    const rightSubAvailable = rightSubs.find((s) => s.player !== null);
    
    // Entry/exit positions depend on rotation direction
    // Forward (clockwise):
    //   LEFT sub: entry at 0 (front-left), exit at 3 (back-left)
    //   RIGHT sub: entry at 5 (back-right), exit at 2 (front-right)
    // Backward (counter-clockwise):
    //   LEFT sub: entry at 3 (back-left), exit at 0 (front-left)
    //   RIGHT sub: entry at 2 (front-right), exit at 5 (back-right)
    const LEFT_ENTRY = direction === 'forward' ? 0 : 3;
    const LEFT_EXIT = direction === 'forward' ? 3 : 0;
    const RIGHT_ENTRY = direction === 'forward' ? 5 : 2;
    const RIGHT_EXIT = direction === 'forward' ? 2 : 5;
    
    // Determine which sides will sub based on availability
    const leftWillSub = !!leftSubAvailable;
    const rightWillSub = !!rightSubAvailable;
    
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
    if (leftWillSub && leftSubAvailable?.player?.gender === 'female') girlsEntering++;
    if (rightWillSub && rightSubAvailable?.player?.gender === 'female') girlsEntering++;
    
    // Check if rotation would violate min girls
    const totalGirlsAfter = girlsRemaining + girlsEntering;
    
    // Determine which exits need to be blocked to maintain min girls
    let blockLeftExit = false;
    let blockRightExit = false;
    
    if (totalGirlsAfter < minGirls) {
      // We need to block some exits - prioritize keeping girls on court
      // Check if blocking left exit helps (if left exit is female)
      if (leftWillSub && leftExitPlayer?.gender === 'female') {
        const girlsIfBlockLeft = girlsRemaining + 1; // +1 for keeping left exit
        if (girlsIfBlockLeft + girlsEntering >= minGirls) {
          blockLeftExit = true;
        }
      }
      
      // Check if we still need to block right
      const currentGirls = girlsRemaining + (blockLeftExit ? 1 : 0) + girlsEntering;
      if (currentGirls < minGirls && rightWillSub && rightExitPlayer?.gender === 'female') {
        blockRightExit = true;
      }
    }
    
    // Create new player positions
    const newPlayers: (Player | null)[] = new Array(6).fill(null);
    
    // Track which slots are entry points (for subs or blocked players)
    const leftSubbing = leftWillSub && !blockLeftExit;
    const rightSubbing = rightWillSub && !blockRightExit;
    
    // Apply rotation
    for (let slot = 0; slot < 6; slot++) {
      const player = currentPlayers[slot];
      
      // Handle left exit
      if (slot === LEFT_EXIT) {
        if (blockLeftExit) {
          // Girl stays on court, moves to entry position
          newPlayers[LEFT_ENTRY] = player;
        } else if (leftSubbing) {
          // Player exits (handled below)
          continue;
        } else {
          // No left sub, player rotates normally
          newPlayers[rotationMap[slot]] = player;
        }
        continue;
      }
      
      // Handle right exit
      if (slot === RIGHT_EXIT) {
        if (blockRightExit) {
          // Girl stays on court, moves to entry position
          newPlayers[RIGHT_ENTRY] = player;
        } else if (rightSubbing) {
          // Player exits (handled below)
          continue;
        } else {
          // No right sub, player rotates normally
          newPlayers[rotationMap[slot]] = player;
        }
        continue;
      }
      
      // Normal rotation for other slots
      let nextSlot = rotationMap[slot];
      
      // If next slot is an entry point that's being used, adjust
      if (nextSlot === LEFT_ENTRY && (leftSubbing || blockLeftExit)) {
        // This player needs to go somewhere else
        // They go to where the exit player would have gone
        nextSlot = rotationMap[LEFT_EXIT];
      }
      if (nextSlot === RIGHT_ENTRY && (rightSubbing || blockRightExit)) {
        nextSlot = rotationMap[RIGHT_EXIT];
      }
      
      newPlayers[nextSlot] = player;
    }
    
    // Place subs at entry positions
    if (leftSubbing && leftSubAvailable) {
      newPlayers[LEFT_ENTRY] = leftSubAvailable.player;
    }
    if (rightSubbing && rightSubAvailable) {
      newPlayers[RIGHT_ENTRY] = rightSubAvailable.player;
    }
    
    // Move exiting players to bench
    if (leftSubbing && leftSubAvailable) {
      setLeftSubs((prev) =>
        prev.map((s, i) =>
          i === leftSubAvailable.slotIndex ? { ...s, player: leftExitPlayer } : s
        )
      );
    }
    if (rightSubbing && rightSubAvailable) {
      setRightSubs((prev) =>
        prev.map((s, i) =>
          i === rightSubAvailable.slotIndex ? { ...s, player: rightExitPlayer } : s
        )
      );
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
