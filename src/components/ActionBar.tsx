import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, Forward, Download, ArrowLeft } from 'lucide-react';
import { Toast } from './Toast';

interface ActionBarProps {
    onRotate: (direction: 'forward' | 'backward') => void;
    canRotate: boolean;
    rotationNumber: number;
    phase: 'serve' | 'receive';
    onReset: () => void;
    onClone: () => void;
    onShare: () => void;
    /** View-only: opens the "save to a lineup slot" flow (shown instead of share). */
    onSave: () => void;
    /** View-only: exits the shared view back to the user's own lineups. */
    onBack: () => void;
    /** Whether the menu/share are usable (the lineup has players); shown (when not
     *  {@link viewOnly}) but disabled when false. */
    actionsEnabled: boolean;
    /** View-only mode: the menu is replaced by Back, and share by save. */
    viewOnly: boolean;
    /** Message shown above the bar (validation/drag/info/success), or null. */
    toast: { messages: string | string[]; variant: 'error' | 'info' | 'success' } | null;
}

// A bar with three regions: menu (left), the rotation controls (centre), and
// share (right), with a toast rendered above it. On large screens the whole
// thing is inline above the controls; on small screens it floats fixed to the
// bottom (see App.css), so the toast travels with the fixed bar. In view-only
// mode the menu becomes Back and share becomes Save.
export function ActionBar({
    onRotate,
    canRotate,
    rotationNumber,
    phase,
    onReset,
    onClone,
    onShare,
    onSave,
    onBack,
    actionsEnabled,
    viewOnly,
    toast,
}: ActionBarProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close the popover when clicking outside it.
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: PointerEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        document.addEventListener('pointerdown', onDown);
        return () => document.removeEventListener('pointerdown', onDown);
    }, [menuOpen]);

    const runMenuAction = (action: () => void) => {
        setMenuOpen(false);
        action();
    };

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
                        <div className="action-bar-action" ref={menuRef}>
                            <button
                                className="action-bar-btn"
                                onClick={() => setMenuOpen((o) => !o)}
                                disabled={!actionsEnabled}
                                aria-label="Menu"
                                aria-haspopup="true"
                                aria-expanded={menuOpen}
                            >
                                <Menu size={20} aria-hidden="true" />
                            </button>
                            <span className="action-bar-label">Menu</span>
                            {menuOpen && (
                                <div className="action-menu" role="menu">
                                    <button type="button" role="menuitem" onClick={() => runMenuAction(onClone)}>
                                        Clone
                                    </button>
                                    <button className="reset-btn" type="button" role="menuitem" onClick={() => runMenuAction(onReset)}>
                                        Reset
                                    </button>
                                </div>
                            )}
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
