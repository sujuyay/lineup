export type Position = 'setter' | 'outside_hitter' | 'opposite_hitter' | 'libero' | 'middle_blocker' | 'defensive_specialist';

export type Gender = 'male' | 'female';

export interface Player {
    id: string;
    name: string;
    position: Position | null;
    gender: Gender;
}

export const POSITION_COLORS: Record<Position, string> = {
    setter: '#E6B333',
    outside_hitter: '#3366E6',
    opposite_hitter: '#FF6B6B',
    libero: '#2ECC71',
    middle_blocker: '#9B59B6',
    defensive_specialist: '#E67E22',
};

export const POSITION_LABELS: Record<Position, string> = {
    setter: 'Setter',
    outside_hitter: 'Outside Hitter',
    opposite_hitter: 'Opposite Hitter',
    libero: 'Libero',
    middle_blocker: 'Middle Blocker',
    defensive_specialist: 'Defensive Specialist',
};

export const POSITION_ABBREV: Record<Position, string> = {
    setter: 'S',
    outside_hitter: 'OH',
    opposite_hitter: 'OP',
    libero: 'L',
    middle_blocker: 'MB',
    defensive_specialist: 'DS',
};

// ----- Lineup data types -----
//
// All ids below are player ids that key into the lineup's `roster`. Empty string
// means "no player". Court is a fixed-length array (one entry per court slot);
// benches are variable-length and only hold filled positions.
export type CourtSlot = {
    playerId: string;
    // 1-6, only set for the substitutions method. Seeded by the first rotation's
    // court index and stays with the player as they rotate around the court.
    rotationalPosition?: number;
};

export type Rotation = {
    court: CourtSlot[];
    leftBench: string[];
    rightBench: string[];
    liberoBench: string[]; // for now always 0 or 1 element
    subsBench: string[];
};

export interface Lineup {
    minGirls: number;
    rotationMethod: 'bench' | 'substitutions';
    roster: Record<string, Player>;
    rotations: {
        serve: Rotation;
        receive: Rotation;
    }[];
}

export type RotationPair = Lineup['rotations'][number];

export interface StoredData {
    activeLineupIndex: number;
    lineups: Lineup[];
}

export type Phase = 'serve' | 'receive';

// The result of running every rotation-validity check against a rotation. When
// `valid` is false, `messages` explains each failed check.
export type ValidationContext = {
    valid: boolean;
    messages: string[];
};

// A reference to any draggable/droppable slot in the app. `bench` is a side
// bench (left/right); `sub` is the substitutes bench.
export type SlotRef =
    | { type: 'court'; index: number }
    | { type: 'bench'; side: 'left' | 'right'; index: number }
    | { type: 'sub'; index: number }
    | { type: 'libero' };

// The active formation resolved to player objects - what the UI renders and the
// drag/rotate logic operates on. Court entries may be null (empty slots); bench
// entries are always filled.
export type View = {
    court: (Player | null)[];
    leftBench: Player[];
    rightBench: Player[];
    liberoBench: Player | null;
    subsBench: Player[];
    // Populated by resolveView (which has whole-lineup context); other View
    // constructions leave it undefined.
    validation?: ValidationContext;
};

