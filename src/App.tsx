import { useState, useCallback } from 'react';
import type { Player, CourtSlot, SubSlot } from './types';
import { Court } from './components/Court';
import { SubBench } from './components/SubBench';
import { Controls } from './components/Controls';
import { AddPlayerModal } from './components/AddPlayerModal';
import { Legend } from './components/Legend';
import './App.css';

function generateId() {
  return Math.random().toString(36).substring(2, 9);
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

  // Rotation logic that maintains minimum girls requirement
  const handleRotate = () => {
    setCourtSlots((prevSlots) => {
      // Standard volleyball rotation: each player moves to the next position
      // Position 1 -> out, Position 2 -> 1, 3 -> 2, etc., sub comes in at last position
      const rotatedPlayers = prevSlots.map((slot) => slot.player);
      
      // Rotate: player at position 0 goes out, others shift down
      const outgoingPlayer = rotatedPlayers[0];
      const newOnCourtPlayers = [...rotatedPlayers.slice(1)];
      
      // Find a suitable sub to bring in
      const allSubs = [...leftSubs, ...rightSubs].filter((s) => s.player !== null);
      
      // Calculate how many girls would be on court after rotation (before adding new player)
      const girlsAfterRotation = newOnCourtPlayers.filter(
        (p) => p?.gender === 'female'
      ).length;
      
      // Determine what gender we need
      let needFemale = girlsAfterRotation < minGirls;
      
      // If outgoing player was female, we need to check if we're still meeting the requirement
      if (outgoingPlayer?.gender === 'female') {
        needFemale = girlsAfterRotation < minGirls;
      }
      
      // Find the best sub to bring in
      let subToUse: Player | null = null;
      let subSource: { side: 'left' | 'right'; index: number } | null = null;
      
      // First, try to find a sub that matches our gender requirement
      for (const sub of allSubs) {
        if (needFemale && sub.player?.gender === 'female') {
          subToUse = sub.player;
          subSource = { side: sub.side, index: sub.slotIndex };
          break;
        } else if (!needFemale && sub.player) {
          subToUse = sub.player;
          subSource = { side: sub.side, index: sub.slotIndex };
          break;
        }
      }
      
      // If we need female but couldn't find one, just use any available sub
      if (!subToUse && allSubs.length > 0) {
        subToUse = allSubs[0].player;
        subSource = { side: allSubs[0].side, index: allSubs[0].slotIndex };
      }
      
      // Add the new player at the end
      newOnCourtPlayers.push(subToUse);
      
      // Move the outgoing player to the sub's spot
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
        // No sub available, find an empty sub spot
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
        // If no empty spots, the player is just removed
      }
      
      return prevSlots.map((slot, i) => ({
        ...slot,
        player: newOnCourtPlayers[i] || null,
      }));
    });
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

        <Legend />
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
