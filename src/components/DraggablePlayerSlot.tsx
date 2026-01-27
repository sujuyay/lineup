import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Player } from '../types';
import { POSITION_COLORS, POSITION_ABBREV } from '../types';

interface DraggablePlayerSlotProps {
  id: string;
  player: Player | null;
  onClick: () => void;
  size?: 'normal' | 'small';
  canDrop?: boolean;
  isBeingDragged?: boolean;
  isValidDropTarget?: boolean;
}

function truncateName(name: string, maxLength: number = 8): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, maxLength) + '…';
}

export function DraggablePlayerSlot({ 
  id, 
  player, 
  onClick, 
  size = 'normal',
  canDrop = true,
  isBeingDragged = false,
  isValidDropTarget = true,
}: DraggablePlayerSlotProps) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({
    id,
    disabled: !player,
    data: { player, slotId: id },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id,
    disabled: !canDrop,
    data: { player, slotId: id },
  });

  const positionColor = player?.position ? POSITION_COLORS[player.position] : '#4a5568';

  // Combine refs
  const setRefs = (node: HTMLDivElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  // When this slot contains the player being dragged, show empty placeholder
  if (isBeingDragged) {
    return (
      <div
        ref={setRefs}
        className={`player-slot ${size} dragging`}
        {...listeners}
        {...attributes}
      />
    );
  }

  // Only show drop-target styling if the drop would be valid
  const showDropTarget = isOver && isValidDropTarget;

  return (
    <div
      ref={setRefs}
      className={`player-slot ${size} ${player ? 'filled' : ''} ${showDropTarget ? 'drop-target' : ''}`}
      onClick={onClick}
      style={{
        borderColor: player ? positionColor : undefined,
        background: player ? `linear-gradient(135deg, ${positionColor}22, ${positionColor}44)` : undefined,
      }}
      {...listeners}
      {...attributes}
    >
      {player ? (
        <>
          {player.position && (
            <div 
              className="player-position-badge"
              style={{ backgroundColor: positionColor }}
            >
              {POSITION_ABBREV[player.position]}
            </div>
          )}
          <span className="player-name" title={player.name}>
            {truncateName(player.name)}
          </span>
        </>
      ) : (
        <span className="slot-plus">+</span>
      )}
    </div>
  );
}

