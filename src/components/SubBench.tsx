import type { SubSlot } from '../types';
import { PlayerSlot } from './PlayerSlot';

interface SubBenchProps {
  subs: SubSlot[];
  side: 'left' | 'right';
  onSubClick: (side: 'left' | 'right', slotIndex: number) => void;
}

export function SubBench({ subs, side, onSubClick }: SubBenchProps) {
  return (
    <div className={`sub-bench ${side}`}>
      <div className="sub-bench-label">SUBS</div>
      <div className="sub-slots">
        {subs.map((sub) => (
          <PlayerSlot
            key={`${sub.side}-${sub.slotIndex}`}
            player={sub.player}
            label={`Sub ${sub.slotIndex + 1}`}
            onClick={() => onSubClick(side, sub.slotIndex)}
            size="small"
          />
        ))}
      </div>
    </div>
  );
}

