interface ToastProps {
    /** One or more lines to show. Empty/absent renders nothing. */
    messages: string | string[];
}

// A small danger-styled message pill. The caller supplies the wrapping
// container, so the same pill works as an overlay or inline.
export function Toast({ messages }: ToastProps) {
    const lines = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
    if (lines.length === 0) return null;

    return (
        <div className="toast">
            {lines.map((line, i) => (
                <div key={i}>{line}</div>
            ))}
        </div>
    );
}
