import type { Position } from '../types';
import { POSITION_COLORS, POSITION_LABELS } from '../types';

const POSITIONS: Position[] = ['setter', 'outside_hitter', 'opposite_hitter', 'libero', 'middle_blocker'];

export function Legend() {
  return (
    <div className="legend">
      <h3>Positions</h3>
      <div className="legend-items">
        {POSITIONS.map((pos) => (
          <div key={pos} className="legend-item">
            <div 
              className="legend-color"
              style={{ backgroundColor: POSITION_COLORS[pos] }}
            />
            <span>{POSITION_LABELS[pos]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

