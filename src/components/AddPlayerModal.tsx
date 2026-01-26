import { useState } from 'react';
import type { Player, Position, Gender } from '../types';
import { POSITION_COLORS, POSITION_LABELS } from '../types';

interface AddPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (player: Omit<Player, 'id'>) => void;
  onRemove?: () => void;
  existingPlayer?: Player | null;
}

const POSITIONS: Position[] = ['setter', 'outside_hitter', 'opposite_hitter', 'libero', 'middle_blocker'];

export function AddPlayerModal({ isOpen, onClose, onSave, onRemove, existingPlayer }: AddPlayerModalProps) {
  const [name, setName] = useState(existingPlayer?.name || '');
  const [position, setPosition] = useState<Position | null>(existingPlayer?.position || null);
  const [gender, setGender] = useState<Gender>(existingPlayer?.gender || 'male');

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), position, gender });
    setName('');
    setPosition(null);
    setGender('male');
  };

  const handleClose = () => {
    setName('');
    setPosition(null);
    setGender('male');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>{existingPlayer ? 'Edit Player' : 'Add Player'}</h2>
        
        <div className="form-group">
          <label>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter player name"
            autoFocus
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
                  borderColor: POSITION_COLORS[pos],
                } as React.CSSProperties}
              >
                {POSITION_LABELS[pos]}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          {existingPlayer && onRemove && (
            <button className="btn-remove" onClick={onRemove}>
              Remove
            </button>
          )}
          <div className="modal-actions-right">
            <button className="btn-cancel" onClick={handleClose}>
              Cancel
            </button>
            <button className="btn-save" onClick={handleSave} disabled={!name.trim()}>
              {existingPlayer ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

