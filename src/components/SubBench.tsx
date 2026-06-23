import type { Player } from '../types';
import { useSettings } from '../config';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface SubBenchProps {
    players: Player[];
    side: 'left' | 'right';
    onSubClick: (side: 'left' | 'right', slotIndex: number) => void;
    onAddSub: (side: 'left' | 'right') => void;
    canAddSubs: boolean;
    draggingPlayerId?: string | null;
    canDropOnId: (id: string) => boolean;
}

export function SubBench({
    players,
    side,
    onSubClick,
    onAddSub,
    canAddSubs,
    draggingPlayerId,
    canDropOnId,
}: SubBenchProps) {
    const { maxSizePerBench } = useSettings();
    const canAddMore = canAddSubs && players.length < maxSizePerBench;

    return (
        <div className={`sub-bench ${side}`}>
            <div className="sub-bench-label">BENCH</div>
            <div className="sub-slots">
                {players.map((player, index) => {
                    const isBeingDragged = draggingPlayerId && player.id === draggingPlayerId;
                    return (
                        <DraggablePlayerSlot
                            key={`${side}-${index}`}
                            id={`sub-${side}-${index}`}
                            player={player}
                            onClick={() => onSubClick(side, index)}
                            size="small"
                            canDrop={true}
                            isBeingDragged={isBeingDragged || false}
                            isValidDropTarget={canDropOnId(`sub-${side}-${index}`)}
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
