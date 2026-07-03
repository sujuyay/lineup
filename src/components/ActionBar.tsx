import { ChevronLeft, ChevronRight, RotateCcw, Forward, Download, ArrowLeft } from 'lucide-react';
import { Toast } from './Toast';

interface ActionBarProps {
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    onReset: () => void;
    onShare: () => void;
    /** View-only: opens the "save to a lineup slot" flow (shown instead of share). */
    onSave: () => void;
    /** View-only: exits the shared view back to the user's own lineups. */
    onBack: () => void;
    /** Whether reset/share are usable (the lineup has players); they're shown
     *  (when not {@link viewOnly}) but disabled when false. */
    actionsEnabled: boolean;
    /** View-only mode: reset is hidden and share is replaced by a save button. */
    viewOnly: boolean;
    /** Message shown above the bar (validation/drag/info/success), or null. */
    toast: { messages: string | string[]; variant: 'error' | 'info' | 'success' } | null;
}

// A bar with three regions: reset (left), the rotation controls (centre), and
// share (right), with a toast rendered above it. On large screens the whole
// thing is inline above the controls; on small screens it floats fixed to the
// bottom (see App.css), so the toast travels with the fixed bar. The rotation
// controls dim when there aren't enough players to rotate; reset/share are shown
// (unless hidden via viewOnly) but disabled until the lineup has players.
export function ActionBar({
    onRotate,
    canRotate,
    rotationNumber,
    phase,
    onReset,
    onShare,
    onSave,
    onBack,
    actionsEnabled,
    viewOnly,
    toast,
}: ActionBarProps) {
    return (
        <div className="action-bar-wrap">
            {toast && <Toast messages={toast.messages} variant={toast.variant} />}
            <div className="action-bar">
                <div className="action-bar-side action-bar-left">
                    {viewOnly ? (
                        <div className="action-bar-action">
                            <button className="action-bar-btn" onClick={onBack} aria-label="Back to your lineups">
                                <ArrowLeft size={20} aria-hidden="true" />
                            </button>
                            <span className="action-bar-label">Back</span>
                        </div>
                    ) : (
                        <div className="action-bar-action">
                            <button className="action-bar-btn" onClick={onReset} disabled={!actionsEnabled} aria-label="Reset lineup">
                                <RotateCcw size={20} aria-hidden="true" />
                            </button>
                            <span className="action-bar-label">Reset</span>
                        </div>
                    )}
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
                    {viewOnly ? (
                        <div className="action-bar-action">
                            <button className="action-bar-btn" onClick={onSave} aria-label="Save lineup">
                                <Download size={20} aria-hidden="true" />
                            </button>
                            <span className="action-bar-label">Save</span>
                        </div>
                    ) : (
                        <div className="action-bar-action">
                            <button className="action-bar-btn" onClick={onShare} disabled={!actionsEnabled} aria-label="Share lineup">
                                <Forward size={20} aria-hidden="true" />
                            </button>
                            <span className="action-bar-label">Share</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
