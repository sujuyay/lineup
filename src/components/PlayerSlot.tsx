import type { Player } from '../types';
import { POSITION_COLORS } from '../types';

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
            className="player-position-dot"
            style={{ backgroundColor: positionColor }}
          />
          <span className="player-name">{player.name}</span>
          <span className="player-gender">{player.gender === 'female' ? '♀' : '♂'}</span>
        </>
      ) : (
        <span className="slot-label">{label}</span>
      )}
    </div>
  );
}

