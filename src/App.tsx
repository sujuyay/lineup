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

// Volleyball court positions for 6 players:
// Visual layout:
//   Front row (near net): [slot 0 = pos 4] [slot 1 = pos 3] [slot 2 = pos 2]
//   Back row:             [slot 3 = pos 5] [slot 4 = pos 6] [slot 5 = pos 1]
// 
// Clockwise rotation order: 1 → 2 → 3 → 4 → 5 → 6 → 1
// In slot indices: 5 → 2 → 1 → 0 → 3 → 4 → 5
// Position 1 (slot 5) is the serve position and rotates out

// Maps slot index to the next slot in clockwise rotation
const CLOCKWISE_ROTATION: Record<number, number> = {
  5: -1, // Position 1 rotates out
  2: 5,  // Position 2 → Position 1
  1: 2,  // Position 3 → Position 2
  0: 1,  // Position 4 → Position 3
  3: 0,  // Position 5 → Position 4
  4: 3,  // Position 6 → Position 5
};

// Position 6 (slot 4) is where subs enter
const SUB_ENTRY_SLOT = 4;
const SERVE_SLOT = 5; // Position 1 - where players rotate out

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
    // Get current players indexed by slot
    const currentPlayers = courtSlots.map((slot) => slot.player);
    
    // Find available subs
    const allSubs = [...leftSubs, ...rightSubs].filter((s) => s.player !== null);
    
    // Get the player at position 1 (serve position, slot 5) who would normally rotate out
    const playerAtServePosition = currentPlayers[SERVE_SLOT];
    
    // Count girls on court excluding the player at serve position
    const girlsExcludingServe = currentPlayers.filter(
      (p, i) => i !== SERVE_SLOT && p?.gender === 'female'
    ).length;
    
    // Check if rotating out the serve position player would violate min girls requirement
    const wouldViolateMinGirls = 
      playerAtServePosition?.gender === 'female' && 
      girlsExcludingServe < minGirls;
    
    // Find sub to bring in
    let subToUse: Player | null = null;
    let subSource: { side: 'left' | 'right'; index: number } | null = null;
    
    if (allSubs.length > 0) {
      // If we need a female, try to find one
      if (wouldViolateMinGirls) {
        const femaleSub = allSubs.find((s) => s.player?.gender === 'female');
        if (femaleSub) {
          subToUse = femaleSub.player;
          subSource = { side: femaleSub.side, index: femaleSub.slotIndex };
        }
      }
      
      // If we don't need female specifically, or couldn't find one, use first available
      if (!subToUse) {
        subToUse = allSubs[0].player;
        subSource = { side: allSubs[0].side, index: allSubs[0].slotIndex };
      }
    }
    
    // Determine if girl at serve position should stay on court
    const girlMustStay = wouldViolateMinGirls && 
      (!subToUse || subToUse.gender !== 'female');
    
    // Create new player positions array
    const newPlayers: (Player | null)[] = new Array(6).fill(null);
    
    if (girlMustStay) {
      // The girl at serve position stays and moves to position 6 (sub entry slot)
      // Everyone else rotates normally, but no one exits
      
      // Move the girl from serve position to sub entry position
      newPlayers[SUB_ENTRY_SLOT] = playerAtServePosition;
      
      // Rotate everyone else clockwise (except serve and sub entry positions)
      for (let slot = 0; slot < 6; slot++) {
        if (slot === SERVE_SLOT) continue; // This player is moving to SUB_ENTRY_SLOT
        if (slot === SUB_ENTRY_SLOT) continue; // Already handled
        
        const nextSlot = CLOCKWISE_ROTATION[slot];
        if (nextSlot === -1) continue; // Would rotate out
        
        newPlayers[nextSlot] = currentPlayers[slot];
      }
      
      // The player that was at position 6 (sub entry slot) moves to position 5 (next in rotation)
      const playerAtSubEntry = currentPlayers[SUB_ENTRY_SLOT];
      newPlayers[3] = playerAtSubEntry; // Position 6 → Position 5 (slot 4 → slot 3)
      
      // No sub comes in, no one goes out
      // Sub stays where they are
      
    } else {
      // Normal clockwise rotation
      let outgoingPlayer: Player | null = null;
      
      // Apply clockwise rotation
      for (let slot = 0; slot < 6; slot++) {
        const nextSlot = CLOCKWISE_ROTATION[slot];
        if (nextSlot === -1) {
          // This player rotates out
          outgoingPlayer = currentPlayers[slot];
        } else {
          newPlayers[nextSlot] = currentPlayers[slot];
        }
      }
      
      // Sub enters at position 6 (slot 4)
      newPlayers[SUB_ENTRY_SLOT] = subToUse;
      
      // Move outgoing player to sub bench
      if (subSource) {
        if (subSource.side === 'left') {
          setLeftSubs((prev) =>
            prev.map((s, i) =>
              i === subSource!.index ? { ...s, player: outgoingPlayer } : s
            )
          );
        } else {
          setRightSubs((prev) =>
            prev.map((s, i) =>
              i === subSource!.index ? { ...s, player: outgoingPlayer } : s
            )
          );
        }
      } else if (outgoingPlayer) {
        // No sub was used, find an empty sub spot
        const emptyLeftSub = leftSubs.findIndex((s) => !s.player);
        const emptyRightSub = rightSubs.findIndex((s) => !s.player);
        
        if (emptyLeftSub !== -1) {
          setLeftSubs((prev) =>
            prev.map((s, i) =>
              i === emptyLeftSub ? { ...s, player: outgoingPlayer } : s
            )
          );
        } else if (emptyRightSub !== -1) {
          setRightSubs((prev) =>
            prev.map((s, i) =>
              i === emptyRightSub ? { ...s, player: outgoingPlayer } : s
            )
          );
        }
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
