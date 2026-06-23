import type { Player } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface CourtProps {
    court: (Player | null)[];
    onSlotClick: (slotIndex: number) => void;
    draggingPlayerId?: string | null;
    canDropOnId: (id: string) => boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    onPhaseChange: (phase: 'serve' | 'receive') => void;
}

// Fixed 2x3 volleyball court: front row (0-2) near the net on top, back row (3-5)
// below. Slots fill the grid row-major in order.
export function Court({
    court,
    onSlotClick,
    draggingPlayerId,
    canDropOnId,
    rotationNumber,
    phase,
    onPhaseChange,
}: CourtProps) {
    return (
        <div className="court">
            <div className="court-header">
                <span className="court-rotation-label">R{rotationNumber}</span>
                <div className="phase-toggle">
                    <button
                        type="button"
                        className={`phase-option ${phase === 'serve' ? 'active' : ''}`}
                        onClick={() => onPhaseChange('serve')}
                    >
                        SERVE
                    </button>
                    <button
                        type="button"
                        className={`phase-option ${phase === 'receive' ? 'active' : ''}`}
                        onClick={() => onPhaseChange('receive')}
                    >
                        RECEIVE
                    </button>
                </div>
            </div>
            <div className="court-net" />
            <div className="court-grid">
                {court.map((player, i) => {
                    const isBeingDragged = draggingPlayerId && player?.id === draggingPlayerId;
                    return (
                        <DraggablePlayerSlot
                            key={i}
                            id={`court-${i}`}
                            player={player}
                            onClick={() => onSlotClick(i)}
                            canDrop={true}
                            isBeingDragged={isBeingDragged || false}
                            isValidDropTarget={canDropOnId(`court-${i}`)}
                            showGender={true}
                        />
                    );
                })}
            </div>
        </div>
    );
}
