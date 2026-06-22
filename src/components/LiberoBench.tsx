import type { Player } from '../types';
import { DraggablePlayerSlot } from './DraggablePlayerSlot';

interface LiberoBenchProps {
  libero: Player | null;
  onClick: () => void;
  isBeingDragged?: boolean;
  isValidDropTarget?: boolean;
}

// A horizontal bench holding a single configurable libero slot.
export function LiberoBench({ libero, onClick, isBeingDragged = false, isValidDropTarget = true }: LiberoBenchProps) {
  return (
    <div className="libero-bench">
      <div className="libero-bench-label">LIBERO</div>
      <div className="libero-slot">
        <DraggablePlayerSlot
          id="libero"
          player={libero}
          onClick={onClick}
          size="small"
          canDrop={true}
          isBeingDragged={isBeingDragged}
          isValidDropTarget={isValidDropTarget}
        />
      </div>
    </div>
  );
}
