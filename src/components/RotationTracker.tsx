const MIN_STEPS = 6;
const STEPS_PER_ROW = 8;

interface RotationTrackerProps {
    /** Number of rotation steps available. */
    count: number;
    /** Index of the rotation currently being viewed. */
    activeIndex: number;
    /** Called with the rotation index when a step is clicked. */
    onSelect: (index: number) => void;
    /** Whether each rotation index passes validation (false => red border). */
    validity?: boolean[];
}

// Numbered circles connected by a line - one per rotation. Wraps onto multiple
// rows of up to STEPS_PER_ROW. Always shows at least MIN_STEPS; with fewer real
// rotations than that the tracker renders disabled (steps can't be clicked).
export function RotationTracker({ count, activeIndex, onSelect, validity }: RotationTrackerProps) {
    const disabled = count < MIN_STEPS;
    const total = Math.max(count, MIN_STEPS);

    const rows: number[][] = [];
    for (let start = 0; start < total; start += STEPS_PER_ROW) {
        rows.push(Array.from({ length: Math.min(STEPS_PER_ROW, total - start) }, (_, j) => start + j));
    }

    return (
        <div className={`rotation-tracker ${disabled ? 'disabled' : ''}`}>
            {rows.map((row, r) => (
                <div className="rotation-row" key={r}>
                    {row.map((i) => (
                        <button
                            key={i}
                            className={`rotation-step ${i === activeIndex ? 'active' : ''} ${validity?.[i] === false ? 'invalid' : ''}`}
                            onClick={() => onSelect(i)}
                            disabled={disabled}
                            aria-current={i === activeIndex ? 'step' : undefined}
                        >
                            R{i + 1}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}
