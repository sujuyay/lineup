import { ChevronLeft, ChevronRight, RotateCcw, Forward } from 'lucide-react';
import { Toast } from './Toast';

interface ActionBarProps {
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    onReset: () => void;
    onShare: () => void;
    /** Shows the "Link copied!" confirmation next to the share button. */
    shareCopied: boolean;
    /** Whether reset/share are usable (the lineup has players); they're always
     *  shown, but disabled when false. */
    actionsEnabled: boolean;
}

// A bar with three regions: reset (left), the rotation controls (centre), and
// share (right). On large screens it's inline above the controls; on small
// screens it floats fixed to the bottom (see App.css). The rotation controls dim
// when there aren't enough players to rotate; reset/share are always shown but
// disabled until the lineup has players.
export function ActionBar({
    onRotate,
    canRotate,
    rotationNumber,
    phase,
    onReset,
    onShare,
    shareCopied,
    actionsEnabled,
}: ActionBarProps) {
    return (
        <div className="action-bar">
            <div className="action-bar-side action-bar-left">
                <div className="action-bar-action">
                    <button className="action-bar-btn" onClick={onReset} disabled={!actionsEnabled} aria-label="Reset lineup">
                        <RotateCcw size={20} aria-hidden="true" />
                    </button>
                    <span className="action-bar-label">Reset</span>
                </div>
            </div>

            <div className={`action-bar-center${canRotate ? '' : ' disabled'}`}>
                <div className="rotate-input">
                    <button onClick={() => onRotate('backward')} disabled={!canRotate} aria-label="Previous rotation">
                        <ChevronLeft size={20} aria-hidden="true" />
                    </button>
                    <span className="rotate-number">R{rotationNumber}:{phase === 'serve' ? 'S' : 'R'}</span>
                    <button onClick={() => onRotate('forward')} disabled={!canRotate} aria-label="Next rotation">
                        <ChevronRight size={20} aria-hidden="true" />
                    </button>
                </div>
                <span className="action-bar-label">Rotate</span>
            </div>

            <div className="action-bar-side action-bar-right">
                <div className="action-bar-action">
                    {shareCopied && (
                        <div className="share-copied-toast" role="status">
                            <Toast messages="Link copied!" />
                        </div>
                    )}
                    <button className="action-bar-btn" onClick={onShare} disabled={!actionsEnabled} aria-label="Share lineup">
                        <Forward size={20} aria-hidden="true" />
                    </button>
                    <span className="action-bar-label">Share</span>
                </div>
            </div>
        </div>
    );
}
