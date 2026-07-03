import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useSettings, PLAYER_COUNT } from '../config';
import type { Theme } from '../config';

interface ControlsSaveValues {
    title: string;
    minGirls: number;
    rotationMethod: 'bench' | 'substitutions';
    theme: Theme;
}

interface ControlsProps {
    /** Initial (current) values; edits are staged locally until Save is clicked. */
    title: string;
    titlePlaceholder: string;
    minGirls: number;
    rotationMethod: 'bench' | 'substitutions';
    theme: Theme;
    /** Apply the (trimmed) staged settings. */
    onSave: (values: ControlsSaveValues) => void;
}

// The settings form. Edits are staged in local draft state and only applied via
// onSave, so nothing changes until the user clicks Save. Remounted each time the
// modal opens, so the drafts re-seed from the current values.
export function Controls({ title, titlePlaceholder, minGirls, rotationMethod, theme, onSave }: ControlsProps) {
    const { minGirls: minGirlsBounds } = useSettings();
    const [draftTitle, setDraftTitle] = useState(title);
    const [draftMinGirls, setDraftMinGirls] = useState(minGirls);
    const [draftMethod, setDraftMethod] = useState(rotationMethod);
    const [draftTheme, setDraftTheme] = useState(theme);

    const handleSave = () => {
        onSave({ title: draftTitle.trim(), minGirls: draftMinGirls, rotationMethod: draftMethod, theme: draftTheme });
    };

    // Nothing to save when every draft still matches its initial value (the
    // title is compared trimmed, matching what Save would store).
    const changed =
        draftTitle.trim() !== title.trim() ||
        draftMinGirls !== minGirls ||
        draftMethod !== rotationMethod ||
        draftTheme !== theme;

    return (
        <div className="controls">
            <div className="control-group">
                <label className="label-large">Lineup Name</label>
                <input
                    type="text"
                    className="title-input"
                    value={draftTitle}
                    placeholder={titlePlaceholder}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    maxLength={40}
                />
            </div>

            <div className="control-group">
                <label className="label-large">Rotation Method</label>
                <div className="method-toggle">
                    <button
                        type="button"
                        className={`method-option ${draftMethod === 'bench' ? 'active' : ''}`}
                        onClick={() => setDraftMethod('bench')}
                    >
                        BENCH
                    </button>
                    <button
                        type="button"
                        className={`method-option ${draftMethod === 'substitutions' ? 'active' : ''}`}
                        onClick={() => setDraftMethod('substitutions')}
                    >
                        SUBS
                    </button>
                </div>
                <p className="method-subtext">
                    {draftMethod === 'bench'
                        ? 'All players rotate through the court and bench'
                        : 'Only court players rotate and get replaced via substitution'}
                </p>
            </div>

            {minGirlsBounds.editable && (
                <div className="control-group">
                    <label className="label-large">Min Females</label>
                    <div className="number-input">
                        <button
                            onClick={() => setDraftMinGirls((n) => Math.max(minGirlsBounds.min, n - 1))}
                            disabled={draftMinGirls <= minGirlsBounds.min}
                            aria-label="Decrease minimum females"
                        >
                            <Minus size={16} aria-hidden="true" />
                        </button>
                        <span>{draftMinGirls}</span>
                        <button
                            onClick={() => setDraftMinGirls((n) => Math.min(PLAYER_COUNT, n + 1))}
                            disabled={draftMinGirls >= PLAYER_COUNT}
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
                        className={`method-option ${draftTheme === 'dark' ? 'active' : ''}`}
                        onClick={() => setDraftTheme('dark')}
                    >
                        DARK
                    </button>
                    <button
                        type="button"
                        className={`method-option ${draftTheme === 'light' ? 'active' : ''}`}
                        onClick={() => setDraftTheme('light')}
                    >
                        LIGHT
                    </button>
                </div>
            </div>

            <button type="button" className="btn-save controls-save" onClick={handleSave} disabled={!changed}>
                Save
            </button>
        </div>
    );
}
