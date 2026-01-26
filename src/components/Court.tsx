import type { CourtSlot } from '../types';
import { PlayerSlot } from './PlayerSlot';

interface CourtProps {
  slots: CourtSlot[];
  onSlotClick: (slotIndex: number) => void;
}

export function Court({ slots, onSlotClick }: CourtProps) {
  const playerCount = slots.length;
  
  // Calculate grid layout based on player count
  const getGridLayout = () => {
    if (playerCount <= 3) {
      return { rows: 1, cols: playerCount };
    } else if (playerCount === 4) {
      return { rows: 2, cols: 2 };
    } else if (playerCount <= 6) {
      return { rows: 2, cols: 3 };
    } else if (playerCount <= 9) {
      return { rows: 3, cols: 3 };
    } else {
      return { rows: Math.ceil(playerCount / 4), cols: 4 };
    }
  };

  const { rows, cols } = getGridLayout();
  
  // Create a proper volleyball court layout (front row and back row)
  const arrangeSlots = () => {
    const arranged: (CourtSlot | null)[][] = [];
    
    for (let r = 0; r < rows; r++) {
      const row: (CourtSlot | null)[] = [];
      for (let c = 0; c < cols; c++) {
        const slotIndex = r * cols + c;
        if (slotIndex < playerCount) {
          row.push(slots[slotIndex]);
        } else {
          row.push(null);
        }
      }
      arranged.push(row);
    }
    
    return arranged;
  };

  const arrangedSlots = arrangeSlots();

  return (
    <div className="court">
      <div className="court-net-label">NET</div>
      <div className="court-net" />
      <div 
        className="court-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}
      >
        {arrangedSlots.flat().map((slot, idx) => {
          if (!slot) return <div key={idx} className="empty-cell" />;
          return (
            <PlayerSlot
              key={slot.slotIndex}
              player={slot.player}
              label={`Position ${slot.slotIndex + 1}`}
              onClick={() => onSlotClick(slot.slotIndex)}
            />
          );
        })}
      </div>
    </div>
  );
}

