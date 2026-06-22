import type { SubSlot } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface SubBenchProps {
    subs: SubSlot[];
    side: 'left' | 'right';
    onSubClick: (side: 'left' | 'right', slotIndex: number) => void;
    onAddSub: (side: 'left' | 'right') => void;
    canAddSubs: boolean;
    draggingPlayerId?: string | null;
    canDropOnId: (id: string) => boolean;
}

export function SubBench({
    subs,
    side,
    onSubClick,
    onAddSub,
    canAddSubs,
    draggingPlayerId,
    canDropOnId,
}: SubBenchProps) {
    // Get subs that have players
    const filledSubs = subs.filter((sub) => sub.player !== null);
    const canAddMore = canAddSubs && filledSubs.length < 4;

    return (
        <div className={`sub-bench ${side}`}>
            <div className="sub-bench-label">BENCH</div>
            <div className="sub-slots">
                {filledSubs.map((sub, index) => {
                    const isBeingDragged = draggingPlayerId && sub.player?.id === draggingPlayerId;
                    const isValidDrop = canDropOnId(`sub-${side}-${index}`);
                    return (
                        <DraggablePlayerSlot
                            key={`${side}-${index}`}
                            id={`sub-${side}-${index}`}
                            player={sub.player}
                            onClick={() => onSubClick(side, index)}
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
