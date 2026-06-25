import { useSettings, PLAYER_COUNT } from '../config';
import type { Theme } from '../config';

interface ControlsProps {
    minGirls: number;
    onMinGirlsChange: (min: number) => void;
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    rotationMethod: 'bench' | 'substitutions';
    onRotationMethodChange: (method: 'bench' | 'substitutions') => void;
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
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
    theme,
    onThemeChange,
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
                <label className="label-large">Rotation Method</label>
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
                    <label className="label-large">Min Females</label>
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

            <div className="control-group">
                <label className="label-large">Theme</label>
                <div className="method-toggle">
                    <button
                        type="button"
                        className={`method-option ${theme === 'dark' ? 'active' : ''}`}
                        onClick={() => onThemeChange('dark')}
                    >
                        DARK
                    </button>
                    <button
                        type="button"
                        className={`method-option ${theme === 'light' ? 'active' : ''}`}
                        onClick={() => onThemeChange('light')}
                    >
                        LIGHT
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
