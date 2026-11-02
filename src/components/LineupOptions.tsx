import { Minus, Plus } from 'lucide-react';
import { useSettings, PLAYER_COUNT } from '../config';

interface LineupOptionsProps {
    minGirls: number;
    rotationMethod: 'bench' | 'substitutions';
    onMinGirlsChange: (min: number) => void;
    onRotationMethodChange: (method: 'bench' | 'substitutions') => void;
}

// Compact per-lineup options panel under the court: rotation method and min
// females side by side, with the method's description beneath. Unlike the
// settings modal, changes apply immediately.
export function LineupOptions({
    minGirls,
    rotationMethod,
    onMinGirlsChange,
    onRotationMethodChange,
}: LineupOptionsProps) {
    const { minGirls: minGirlsBounds } = useSettings();

    return (
        <div className="lineup-options">
            <div className="lineup-options-row">
                <div className="lineup-option">
                    <span className="lineup-option-label">Rotation Method</span>
                    <div className="method-toggle">
                        <button
                            type="button"
                            className={`method-option ${rotationMethod === 'bench' ? 'active' : ''}`}
                            onClick={() => rotationMethod !== 'bench' && onRotationMethodChange('bench')}
                            aria-pressed={rotationMethod === 'bench'}
                        >
                            BENCH
                        </button>
                        <button
                            type="button"
                            className={`method-option ${rotationMethod === 'substitutions' ? 'active' : ''}`}
                            onClick={() => rotationMethod !== 'substitutions' && onRotationMethodChange('substitutions')}
                            aria-pressed={rotationMethod === 'substitutions'}
                        >
                            SUBS
                        </button>
                    </div>
                </div>

                {minGirlsBounds.editable && (
                    <div className="lineup-option">
                        <span className="lineup-option-label">Min Females</span>
                        <div className="number-input">
                            <button
                                type="button"
                                onClick={() => onMinGirlsChange(Math.max(minGirlsBounds.min, minGirls - 1))}
                                disabled={minGirls <= minGirlsBounds.min}
                                aria-label="Decrease minimum females"
                            >
                                <Minus size={12} aria-hidden="true" />
                            </button>
                            <span>{minGirls}</span>
                            <button
                                type="button"
                                onClick={() => onMinGirlsChange(Math.min(PLAYER_COUNT, minGirls + 1))}
                                disabled={minGirls >= PLAYER_COUNT}
                                aria-label="Increase minimum females"
                            >
                                <Plus size={12} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
            <p className="method-subtext">
                {rotationMethod === 'bench'
                    ? 'All players rotate through the court and bench'
                    : 'Only court players rotate and get replaced via substitution'}
            </p>
        </div>
    );
}
