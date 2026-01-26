import type { Player } from '../types';
import { POSITION_COLORS, POSITION_LABELS } from '../types';

interface PlayerSlotProps {
  player: Player | null;
  label: string;
  onClick: () => void;
  size?: 'normal' | 'small';
}

export function PlayerSlot({ player, label, onClick, size = 'normal' }: PlayerSlotProps) {
  const positionColor = player?.position ? POSITION_COLORS[player.position] : '#4a5568';
  
  return (
    <div
      className={`player-slot ${size}`}
      onClick={onClick}
      style={{
        borderColor: player ? positionColor : '#2d3748',
        background: player ? `linear-gradient(135deg, ${positionColor}22, ${positionColor}44)` : undefined,
      }}
    >
      {player ? (
        <>
          <div 
            className="player-position-badge"
            style={{ backgroundColor: positionColor }}
          >
            {player.position ? POSITION_LABELS[player.position] : 'No Position'}
          </div>
          <span className="player-name">{player.name}</span>
          <span className="player-gender">{player.gender === 'female' ? '♀' : '♂'}</span>
        </>
      ) : (
        <span className="slot-label">{label}</span>
      )}
    </div>
  );
}
