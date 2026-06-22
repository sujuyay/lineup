import type { CourtSlot } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface CourtProps {
    slots: CourtSlot[];
    onSlotClick: (slotIndex: number) => void;
    draggingPlayerId?: string | null;
    canDropOnId: (id: string) => boolean;
}

// Fixed 2x3 volleyball court: front row (0-2) near the net on top, back row (3-5)
// below. Slots fill the grid row-major in order.
export function Court({
    slots,
    onSlotClick,
    draggingPlayerId,
    canDropOnId,
}: CourtProps) {
    return (
        <div className="court">
            <div className="court-net-label">NET</div>
            <div className="court-net" />
            <div className="court-grid">
                {slots.map((slot) => {
                    const isBeingDragged = draggingPlayerId && slot.player?.id === draggingPlayerId;
                    return (
                        <DraggablePlayerSlot
                            key={slot.slotIndex}
                            id={`court-${slot.slotIndex}`}
                            player={slot.player}
                            onClick={() => onSlotClick(slot.slotIndex)}
                            canDrop={true}
                            isBeingDragged={isBeingDragged || false}
                            isValidDropTarget={canDropOnId(`court-${slot.slotIndex}`)}
                            showGender={true}
                        />
                    );
                })}
            </div>
        </div>
    );
}
