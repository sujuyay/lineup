import { useSettings, PLAYER_COUNT } from '../config';

interface ControlsProps {
    minGirls: number;
    onMinGirlsChange: (min: number) => void;
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    onReset: () => void;
    showReset: boolean;
    lineupNumber: number;
}

export function Controls({
    minGirls,
    onMinGirlsChange,
    onRotate,
    canRotate,
    onReset,
    showReset,
    lineupNumber,
}: ControlsProps) {
    const { minGirls: minGirlsBounds } = useSettings();
    return (
        <div className="controls">
            <div className="control-group">
                <label className="label-large">Rotate</label>
                <div className="rotate-input">
                    <button onClick={() => onRotate('backward')} disabled={!canRotate}>&lt;</button>
                    <button onClick={() => onRotate('forward')} disabled={!canRotate}>&gt;</button>
                </div>
            </div>

            <div className="control-group">
                <label>Min Females</label>
                <div className="number-input">
                    <button
                        onClick={() => onMinGirlsChange(Math.max(minGirlsBounds.min, minGirls - 1))}
                        disabled={minGirls <= minGirlsBounds.min}
                    >
                        −
                    </button>
                    <span>{minGirls}</span>
                    <button
                        onClick={() => onMinGirlsChange(Math.min(PLAYER_COUNT, minGirls + 1))}
                        disabled={minGirls >= PLAYER_COUNT}
                    >
                        +
                    </button>
                </div>
            </div>

            {showReset && (
                <button className="btn-reset" onClick={onReset}>
                    Reset Lineup {lineupNumber}
                </button>
            )}
        </div>
    );
}
