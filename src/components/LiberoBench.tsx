import type { Player } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface LiberoBenchProps {
  libero: Player | null;
  onClick: () => void;
  /** A libero can only be added once the court is full (like the side benches). */
  canAdd: boolean;
  isBeingDragged?: boolean;
  isValidDropTarget?: boolean;
}

// A horizontal bench holding a single configurable libero slot.
export function LiberoBench({ libero, onClick, canAdd, isBeingDragged = false, isValidDropTarget = true }: LiberoBenchProps) {
  return (
    <div className="libero-bench">
      <div className="libero-bench-label">LIBERO</div>
      <div className="libero-slot">
        {libero ? (
          <DraggablePlayerSlot
            id="libero"
            player={libero}
            onClick={onClick}
            size="small"
            canDrop={true}
            isBeingDragged={isBeingDragged}
            isValidDropTarget={isValidDropTarget}
          />
        ) : canAdd ? (
          <button className="sub-add-btn" onClick={onClick}>
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
