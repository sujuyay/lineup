import { useState } from 'react';
import type { Theme } from '../config';

interface ControlsSaveValues {
    title: string;
    theme: Theme;
}

interface ControlsProps {
    /** Initial (current) values; edits are staged locally until Save is clicked. */
    title: string;
    titlePlaceholder: string;
    theme: Theme;
    /** Apply the (trimmed) staged settings. */
    onSave: (values: ControlsSaveValues) => void;
}

// The settings form. Edits are staged in local draft state and only applied via
// onSave, so nothing changes until the user clicks Save. Remounted each time the
// modal opens, so the drafts re-seed from the current values.
export function Controls({ title, titlePlaceholder, theme, onSave }: ControlsProps) {
    const [draftTitle, setDraftTitle] = useState(title);
    const [draftTheme, setDraftTheme] = useState(theme);

    const handleSave = () => {
        onSave({ title: draftTitle.trim(), theme: draftTheme });
    };

    // Nothing to save when every draft still matches its initial value (the
    // title is compared trimmed, matching what Save would store).
    const changed =
        draftTitle.trim() !== title.trim() ||
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
