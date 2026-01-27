import type { CourtSlot, Player } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface CourtProps {
    slots: CourtSlot[];
    onSlotClick: (slotIndex: number) => void;
    draggingPlayerId?: string | null;
    draggingPlayer?: Player | null;
    minGirls?: number;
    isDraggingFromSub?: boolean;
}

export function Court({ 
    slots, 
    onSlotClick, 
    draggingPlayerId,
    draggingPlayer,
    minGirls = 0,
    isDraggingFromSub = false,
}: CourtProps) {
    const playerCount = slots.length;
    const currentGirlsOnCourt = slots.filter(s => s.player?.gender === 'female').length;
  
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

    // Check if swapping the court player with the dragged sub would violate min girls
    const isValidSwapTarget = (courtPlayer: Player | null) => {
        if (!isDraggingFromSub || !draggingPlayer) return true;
        
        // If court player is female and incoming sub is not, check if it violates min girls
        if (courtPlayer?.gender === 'female' && draggingPlayer.gender !== 'female') {
            return currentGirlsOnCourt - 1 >= minGirls;
        }
        return true;
    };
  
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
                    const isBeingDragged = draggingPlayerId && slot.player?.id === draggingPlayerId;
                    const isValidDrop = isValidSwapTarget(slot.player);
                    return (
                        <DraggablePlayerSlot
                            key={slot.slotIndex}
                            id={`court-${slot.slotIndex}`}
                            player={slot.player}
                            onClick={() => onSlotClick(slot.slotIndex)}
                            canDrop={true}
                            isBeingDragged={isBeingDragged || false}
                            isValidDropTarget={isValidDrop}
                        />
                    );
                })}
            </div>
        </div>
    );
}
