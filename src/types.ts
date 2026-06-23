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

