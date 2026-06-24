import { useSettings, PLAYER_COUNT } from '../config';

interface ControlsProps {
    minGirls: number;
    onMinGirlsChange: (min: number) => void;
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    rotationMethod: 'bench' | 'substitutions';
    onRotationMethodChange: (method: 'bench' | 'substitutions') => void;
    onReset: () => void;
    showReset: boolean;
    lineupNumber: number;
}

export function Controls({
    minGirls,
    onMinGirlsChange,
    onRotate,
    canRotate,
    rotationNumber,
    phase,
    rotationMethod,
    onRotationMethodChange,
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
                    <span className="rotate-number">R{rotationNumber}:{phase === 'serve' ? 'S' : 'R'}</span>
                    <button onClick={() => onRotate('forward')} disabled={!canRotate}>&gt;</button>
                </div>
                {rotationNumber > 1 && (
                    <p className="rotate-subtext">Note: Players can only be configured from R1</p>
                )}
            </div>

            <div className="control-group">
                <label>Rotation Method</label>
                <div className="method-toggle">
                    <button
                        type="button"
                        className={`method-option ${rotationMethod === 'bench' ? 'active' : ''}`}
                        onClick={() => onRotationMethodChange('bench')}
                    >
                        BENCH
                    </button>
                    <button
                        type="button"
                        className={`method-option ${rotationMethod === 'substitutions' ? 'active' : ''}`}
                        onClick={() => onRotationMethodChange('substitutions')}
                    >
                        SUBS
                    </button>
                </div>
                <p className="method-subtext">
                    {rotationMethod === 'bench'
                        ? 'All players rotate through the court and bench'
                        : 'Only court players rotate and get replaced via substitution'}
                </p>
            </div>

            {minGirlsBounds.editable && (
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
            )}

            {showReset && (
                <button className="btn-reset" onClick={onReset}>
                    Reset Lineup {lineupNumber}
                </button>
            )}
        </div>
    );
}
