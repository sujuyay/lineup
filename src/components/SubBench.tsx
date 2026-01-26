import type { SubSlot } from '../types';
import { PlayerSlot } from './PlayerSlot';

interface SubBenchProps {
    subs: SubSlot[];
    side: 'left' | 'right';
    onSubClick: (side: 'left' | 'right', slotIndex: number) => void;
    onAddSub: (side: 'left' | 'right') => void;
    canAddSubs: boolean;
}

export function SubBench({ subs, side, onSubClick, onAddSub, canAddSubs }: SubBenchProps) {
    // Get subs that have players
    const filledSubs = subs.filter((sub) => sub.player !== null);
    const canAddMore = canAddSubs && filledSubs.length < 3;

    return (
        <div className={`sub-bench ${side}`}>
            <div className="sub-bench-label">SUBS</div>
            <div className="sub-slots">
                {filledSubs.map((sub) => (
                    <PlayerSlot
                        key={`${sub.side}-${sub.slotIndex}`}
                        player={sub.player}
                        onClick={() => onSubClick(side, sub.slotIndex)}
                        size="small"
                    />
                ))}
                {canAddMore && (
                    <button className="sub-add-btn" onClick={() => onAddSub(side)}>
                        +
                    </button>
                )}
            </div>
        </div>
    );
}
