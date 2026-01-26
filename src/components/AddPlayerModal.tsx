import { useState, useEffect } from 'react';
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

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AddPlayerModal({ isOpen, onClose, onSave, onRemove, existingPlayer }: AddPlayerModalProps) {
  const [name, setName] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [gender, setGender] = useState<Gender>('male');

  // Sync state with existingPlayer when modal opens or player changes
  useEffect(() => {
    if (isOpen) {
      setName(existingPlayer?.name || '');
      setPosition(existingPlayer?.position || null);
      setGender(existingPlayer?.gender || 'male');
    }
  }, [isOpen, existingPlayer]);

  if (!isOpen) return null;

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(capitalizeWords(e.target.value));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), position, gender });
    resetForm();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setName('');
    setPosition(null);
    setGender('male');
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
            onChange={handleNameChange}
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
