import { Minus, Plus } from 'lucide-react';
import { useSettings, PLAYER_COUNT } from '../config';
import type { Theme } from '../config';

interface ControlsProps {
    title: string;
    titlePlaceholder: string;
    onTitleChange: (title: string) => void;
    minGirls: number;
    onMinGirlsChange: (min: number) => void;
    rotationMethod: 'bench' | 'substitutions';
    onRotationMethodChange: (method: 'bench' | 'substitutions') => void;
    theme: Theme;
    onThemeChange: (theme: Theme) => void;
}

export function Controls({
    title,
    titlePlaceholder,
    onTitleChange,
    minGirls,
    onMinGirlsChange,
    rotationMethod,
    onRotationMethodChange,
    theme,
    onThemeChange,
}: ControlsProps) {
    const { minGirls: minGirlsBounds } = useSettings();
    return (
        <div className="controls">
            <div className="control-group">
                <label className="label-large">Lineup Name</label>
                <input
                    type="text"
                    className="title-input"
                    value={title}
                    placeholder={titlePlaceholder}
                    onChange={(e) => onTitleChange(e.target.value)}
                    maxLength={40}
                />
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
                            aria-label="Decrease minimum females"
                        >
                            <Minus size={16} aria-hidden="true" />
                        </button>
                        <span>{minGirls}</span>
                        <button
                            onClick={() => onMinGirlsChange(Math.min(PLAYER_COUNT, minGirls + 1))}
                            disabled={minGirls >= PLAYER_COUNT}
                            aria-label="Increase minimum females"
                        >
                            <Plus size={16} aria-hidden="true" />
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
        </div>
    );
}
