interface ControlsProps {
  playerCount: number;
  minGirls: number;
  onPlayerCountChange: (count: number) => void;
  onMinGirlsChange: (min: number) => void;
  onRotate: (direction: 'forward' | 'backward') => void;
}

export function Controls({
  playerCount,
  minGirls,
  onPlayerCountChange,
  onMinGirlsChange,
  onRotate,
}: ControlsProps) {
  return (
    <div className="controls">
      <div className="control-group">
        <label className="label-large">Rotate</label>
        <div className="rotate-input">
          <button onClick={() => onRotate('backward')}>&lt;</button>
          <button onClick={() => onRotate('forward')}>&gt;</button>
        </div>
      </div>

      <div className="control-group">
        <label>Players on Court</label>
        <div className="number-input">
          <button 
            onClick={() => onPlayerCountChange(Math.max(1, playerCount - 1))}
            disabled={playerCount <= 1}
          >
            −
          </button>
          <span>{playerCount}</span>
          <button 
            onClick={() => onPlayerCountChange(Math.min(6, playerCount + 1))}
            disabled={playerCount >= 6}
          >
            +
          </button>
        </div>
      </div>

      <div className="control-group">
        <label>Min Girls Required</label>
        <div className="number-input">
          <button 
            onClick={() => onMinGirlsChange(Math.max(0, minGirls - 1))}
            disabled={minGirls <= 0}
          >
            −
          </button>
          <span>{minGirls}</span>
          <button 
            onClick={() => onMinGirlsChange(Math.min(playerCount, minGirls + 1))}
            disabled={minGirls >= playerCount}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
