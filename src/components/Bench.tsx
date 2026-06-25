import type { Player } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface BenchProps {
    /** Heading text (e.g. BENCH, SUBS, LIBERO). */
    label: string;
    /** Extra class on the `.sub-bench` container. */
    className?: string;
    /** Class for the label element. */
    labelClassName?: string;
    /** Class for the slots wrapper. */
    slotsClassName: string;
    players: Player[];
    /** Build the droppable id for the slot at `index`. */
    slotId: (index: number) => string;
    onSlotClick: (index: number) => void;
    draggingPlayerId?: string | null;
    canDropOnId: (id: string) => boolean;
    /** Whether to show the add (+) button. */
    canAdd: boolean;
    onAdd: () => void;
}

// A bench of small player slots with a label and an add button. Backs the side
// benches, the subs bench, and the (single-slot) libero bench - they differ only
// in labels, classes, slot ids, and capacity, all passed in as props.
export function Bench({
    label,
    className = '',
    labelClassName = 'sub-bench-label',
    slotsClassName,
    players,
    slotId,
    onSlotClick,
    draggingPlayerId,
    canDropOnId,
    canAdd,
    onAdd,
}: BenchProps) {
    return (
        <div className={`sub-bench ${className}`}>
            <div className={labelClassName}>{label}</div>
            <div className={slotsClassName}>
                {players.map((player, index) => (
                    <DraggablePlayerSlot
                        key={slotId(index)}
                        id={slotId(index)}
                        player={player}
                        onClick={() => onSlotClick(index)}
                        size="small"
                        canDrop={true}
                        isBeingDragged={draggingPlayerId === player.id}
                        isValidDropTarget={canDropOnId(slotId(index))}
                        showMeta={true}
                    />
                ))}
                {canAdd && (
                    <button className="sub-add-btn" onClick={onAdd}>
                        +
                    </button>
                )}
            </div>
        </div>
    );
}
