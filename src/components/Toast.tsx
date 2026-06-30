import { Info, CircleAlert } from 'lucide-react';
interface ToastProps {
    /** One or more lines to show. Empty/absent renders nothing. */
    messages: string | string[];
    /** Visual style: 'error' (default, danger pill) or 'info' (neutral). */
    variant?: 'error' | 'info';
}

// A small message pill. The caller supplies the wrapping container, so the same
// pill works as an overlay or inline. Defaults to the danger style; pass
// variant="info" for a neutral, informational message.
export function Toast({ messages, variant = 'error' }: ToastProps) {
    const lines = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
    if (lines.length === 0) return null;

    return (
        <div className="toast-container">
            <div className={`toast${variant === 'info' ? ' toast-info' : ''}`}>
                {variant === 'info' && <Info size={16} aria-hidden="true" />}
                {variant === 'error' && <CircleAlert size={16} aria-hidden="true" />}
                <div>
                    {lines.map((line, i) => (
                        <div key={i}>{line}</div>
                    ))}
                </div>
            </div>
        </div>
    );
}
