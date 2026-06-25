import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { Player } from '../types';
import { POSITION_ABBREV } from '../types';
import { useSettings } from '../config';

interface DraggablePlayerSlotProps {
  id: string;
  player: Player | null;
  onClick: () => void;
  size?: 'normal' | 'small';
  canDrop?: boolean;
  isBeingDragged?: boolean;
  isValidDropTarget?: boolean;
  showMeta?: boolean;
  rotationalPosition?: number;
}

export function DraggablePlayerSlot({
  id,
  player,
  onClick,
  size = 'normal',
  canDrop = true,
  isBeingDragged = false,
  isValidDropTarget = true,
  showMeta = false,
  rotationalPosition,
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

  const { colors } = useSettings();
  const positionColor = player?.position ? colors.positions[player.position] : '#4a5568';
  // Opaque per-position card background (a lighter tint of the border colour).
  const slotBackground = player?.position ? colors.positionBackgrounds[player.position] : 'var(--bg-tertiary)';

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
        background: player ? slotBackground : undefined,
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
            {player.name}
          </span>
          {showMeta && (
            <>
              <span className="player-gender-label">
                {player.gender === 'female' ? 'F' : 'M'}
              </span>
              {rotationalPosition !== undefined && (
                <span className="player-rotational-position-label">
                  {rotationalPosition}
                </span>
              )}
            </>
          )}
        </>
      ) : (
        <span className="slot-plus">+</span>
      )}
    </div>
  );
}

