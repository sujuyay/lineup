import type { Player, SubSlot } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface SubBenchProps {
    subs: SubSlot[];
    side: 'left' | 'right';
    onSubClick: (side: 'left' | 'right', slotIndex: number) => void;
    onAddSub: (side: 'left' | 'right') => void;
    canAddSubs: boolean;
    draggingPlayerId?: string | null;
    draggingPlayer?: Player | null;
    minGirls?: number;
    currentGirlsOnCourt?: number;
    isDraggingFromCourt?: boolean;
}

export function SubBench({ 
    subs, 
    side, 
    onSubClick, 
    onAddSub, 
    canAddSubs, 
    draggingPlayerId,
    draggingPlayer,
    minGirls = 0,
    currentGirlsOnCourt = 0,
    isDraggingFromCourt = false,
}: SubBenchProps) {
    // Get subs that have players
    const filledSubs = subs.filter((sub) => sub.player !== null);
    const canAddMore = canAddSubs && filledSubs.length < 3;

    // Check if swapping the dragged player with a sub would violate min girls
    const isValidSwapTarget = (subPlayer: Player | null) => {
        if (!isDraggingFromCourt || !draggingPlayer) return true;
        
        // If dragged player is female and sub is not, check if it violates min girls
        if (draggingPlayer.gender === 'female' && subPlayer?.gender !== 'female') {
            return currentGirlsOnCourt - 1 >= minGirls;
        }
        return true;
    };

    return (
        <div className={`sub-bench ${side}`}>
            <div className="sub-bench-label">SUBS</div>
            <div className="sub-slots">
                {filledSubs.map((sub) => {
                    const isBeingDragged = draggingPlayerId && sub.player?.id === draggingPlayerId;
                    const isValidDrop = isValidSwapTarget(sub.player);
                    return (
                        <DraggablePlayerSlot
                            key={`${sub.side}-${sub.slotIndex}`}
                            id={`sub-${side}-${sub.slotIndex}`}
                            player={sub.player}
                            onClick={() => onSubClick(side, sub.slotIndex)}
                            size="small"
                            canDrop={sub.player !== null}
                            isBeingDragged={isBeingDragged || false}
                            isValidDropTarget={isValidDrop}
                        />
                    );
                })}
                {canAddMore && (
                    <button className="sub-add-btn" onClick={() => onAddSub(side)}>
                        +
                    </button>
                )}
            </div>
        </div>
    );
}
