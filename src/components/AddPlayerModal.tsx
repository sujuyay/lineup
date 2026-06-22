import { useState } from 'react';
import type { Player, Position, Gender } from '../types';
import { POSITION_COLORS, POSITION_LABELS } from '../types';

interface AddPlayerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (player: Omit<Player, 'id'>) => void;
    onRemove?: () => void;
    existingPlayer?: Player | null;
    /** When true, the player is a libero: position is forced and not selectable. */
    isLibero?: boolean;
}

// 'libero' is intentionally omitted - it's only assigned via the libero slot.
const POSITIONS: Position[] = ['setter', 'outside_hitter', 'opposite_hitter', 'middle_blocker'];

function capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AddPlayerModal({ isOpen, onClose, onSave, onRemove, existingPlayer, isLibero = false }: AddPlayerModalProps) {
    // The modal is remounted (via a `key`) each time it opens, so these
    // initializers seed the form from the player being edited.
    const [name, setName] = useState(existingPlayer?.name || '');
    const [position, setPosition] = useState<Position | null>(existingPlayer?.position || null);
    const [gender, setGender] = useState<Gender>(existingPlayer?.gender || 'male');

    if (!isOpen) return null;

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setName(capitalizeWords(e.target.value));
    };

    const handleSave = () => {
        if (!name.trim()) return;
        onSave({ name: name.trim(), position: isLibero ? 'libero' : position, gender });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>×</button>
                <h2>{existingPlayer ? 'Edit Player' : 'Add Player'}</h2>

                <div className="form-group">
                    <label>Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={handleNameChange}
                        placeholder="Enter player name"
                        autoFocus={!existingPlayer}
                    />
                </div>

                <div className="form-group">
                    <label>Gender</label>
                    <div className="gender-buttons">
                        <button
                            className={`gender-btn ${gender === 'male' ? 'active male' : ''}`}
                            onClick={() => setGender('male')}
                        >
                            ♂ Male
                        </button>
                        <button
                            className={`gender-btn ${gender === 'female' ? 'active female' : ''}`}
                            onClick={() => setGender('female')}
                        >
                            ♀ Female
                        </button>
                    </div>
                </div>

                {!isLibero && (
                <div className="form-group">
                    <label>Position</label>
                    <div className="position-buttons">
                        {POSITIONS.map((pos) => (
                            <button
                                key={pos}
                                className={`position-btn ${position === pos ? 'active' : ''}`}
                                onClick={() => setPosition(position === pos ? null : pos)}
                                style={{
                                    '--position-color': POSITION_COLORS[pos],
                                    backgroundColor: position === pos ? POSITION_COLORS[pos] : undefined,
                                } as React.CSSProperties}
                            >
                                {POSITION_LABELS[pos]}
                            </button>
                        ))}
                    </div>
                </div>
                )}

                <div className="modal-actions">
                    {existingPlayer && onRemove ? (
                        <button className="btn-remove" onClick={onRemove}>
                            Remove
                        </button>
                    ) : (
                        <div />
                    )}
                    <button className="btn-save" onClick={handleSave} disabled={!name.trim()}>
                        {existingPlayer ? 'Update' : 'Add'}
                    </button>
                </div>
            </div>
        </div>
    );
}
