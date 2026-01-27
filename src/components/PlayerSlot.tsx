import type { Player } from '../types';
import { POSITION_COLORS, POSITION_ABBREV } from '../types';

interface PlayerSlotProps {
    player: Player | null;
    onClick: () => void;
    size?: 'normal' | 'small';
}

function truncateName(name: string, maxLength: number = 8): string {
    if (name.length <= maxLength) return name;
    return name.slice(0, maxLength) + '…';
}

export function PlayerSlot({ player, onClick, size = 'normal' }: PlayerSlotProps) {
    const positionColor = player?.position ? POSITION_COLORS[player.position] : '#4a5568';
  
    return (
        <div
            className={`player-slot ${size} ${player ? 'filled' : ''}`}
            onClick={onClick}
            style={{
                borderColor: player ? positionColor : undefined,
                background: player ? `linear-gradient(135deg, ${positionColor}22, ${positionColor}44)` : undefined,
            }}
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
