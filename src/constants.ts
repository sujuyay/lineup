// App-wide constants: storage keys and the fixed court-rotation tables.

export const STORAGE_KEY = 'volleyball-lineup-data-v3';
export const THEME_KEY = 'volleyball-lineup-theme-v3';

// rotationalPosition seeded by the first rotation's court index:
//   front: left=4 middle=3 right=2   back: left=5 middle=6 right=1
export const COURT_ROTATIONAL_POSITIONS = [4, 3, 2, 5, 6, 1];

// The court is a fixed 2x3 grid (front row near the net on top, back row below):
//   0 1 2   (front row)
//   3 4 5   (back row)

// Clockwise perimeter rotation and its reverse, keyed by current slot -> next slot.
export const ROTATION_MAP: Record<'forward' | 'backward', Record<number, number>> = {
  forward: { 0: 1, 1: 2, 2: 5, 5: 4, 4: 3, 3: 0 },
  backward: { 1: 0, 2: 1, 5: 2, 4: 5, 3: 4, 0: 3 },
};

// Entry/exit court positions for subs coming off each side bench.
export const SUB_POSITIONS: Record<'forward' | 'backward', { LEFT_ENTRY: number; LEFT_EXIT: number; RIGHT_ENTRY: number; RIGHT_EXIT: number }> = {
  forward: { LEFT_ENTRY: 0, LEFT_EXIT: 3, RIGHT_ENTRY: 5, RIGHT_EXIT: 2 },
  backward: { LEFT_ENTRY: 3, LEFT_EXIT: 0, RIGHT_ENTRY: 2, RIGHT_EXIT: 5 },
};
