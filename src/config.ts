import { createContext, useContext } from 'react';
import type { Lineup, Phase, Position } from './types';
import { POSITION_COLORS } from './types';

/** The app always fields a full volleyball lineup of six players on court. */
export const PLAYER_COUNT = 6;

export type Theme = 'dark' | 'light';

/** The full overridable colour scheme. */
export interface ColorScheme {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  courtBg: string;
  courtLines: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  /** Colour of the "Lineup Simulator" title. */
  titleColor: string;
  accentPrimary: string;
  accentSecondary: string;
  male: string;
  female: string;
  danger: string;
  /** Per-position swatch / card-border colours. */
  positions: Record<Position, string>;
  /** Per-position opaque card backgrounds (a lighter tint of the border colour). */
  positionBackgrounds: Record<Position, string>;
}

// Maps each ColorScheme key to the CSS custom property it drives. The per-position
// maps are applied inline per player, so they're excluded from this table.
export const COLOR_CSS_VARS: Record<Exclude<keyof ColorScheme, 'positions' | 'positionBackgrounds'>, string> = {
  bgPrimary: '--bg-primary',
  bgSecondary: '--bg-secondary',
  bgTertiary: '--bg-tertiary',
  courtBg: '--court-bg',
  courtLines: '--court-lines',
  textPrimary: '--text-primary',
  textSecondary: '--text-secondary',
  textMuted: '--text-muted',
  titleColor: '--title-color',
  accentPrimary: '--accent-primary',
  accentSecondary: '--accent-secondary',
  male: '--male-color',
  female: '--female-color',
  danger: '--danger',
};

const DEFAULT_COLORS: ColorScheme = {
  bgPrimary: '#0f1419',
  bgSecondary: '#1a1f2e',
  bgTertiary: '#252d3d',
  courtBg: '#162322',
  courtLines: '#1e3a36',
  textPrimary: '#f0f4f8',
  textSecondary: '#8899a6',
  textMuted: '#657786',
  titleColor: '#f0f4f8',
  accentPrimary: '#00d4aa',
  accentSecondary: '#00b894',
  male: '#4dabf7',
  female: '#f06595',
  danger: '#e74c3c',
  positions: POSITION_COLORS,
  // Opaque equivalents of each position colour blended onto the dark background
  // (~25%), matching the previous semi-transparent card tint.
  positionBackgrounds: {
    setter: '#453c20',
    outside_hitter: '#18294c',
    opposite_hitter: '#4b2a2a',
    libero: '#17422f',
    middle_blocker: '#322540',
    defensive_specialist: '#452f1b',
  },
};

/**
 * A custom rotation-validity check. Receives the same arguments as the built-in
 * validation and returns `{ messages }` listing every problem it finds (empty
 * when the rotation is fine). Returned messages are surfaced exactly like the
 * built-in ones (red rotation marker + inline toast).
 */
export type RotationValidator = (
  lineup: Lineup,
  rotationIndex: number,
  phase: Phase,
) => { messages: string[] };

/** Custom validators keyed by the rotation method they apply to. */
export type MethodValidators = {
  bench: RotationValidator[];
  substitutions: RotationValidator[];
};

/**
 * Consolidated, overridable configuration for the Lineup app.
 *
 * When consuming this app as a package, pass a (deeply partial) `settings`
 * object to the `App` component to override any of these values. Anything you
 * leave out falls back to {@link DEFAULT_SETTINGS}.
 *
 *   <App settings={{ minGirls: { default: 0 }, maxSizePerBench: 6 }} />
 */
export interface LineupSettings {
  /** Minimum number of females required on the court. */
  minGirls: {
    default: number;
    /** Lowest value the controls allow (the upper bound is {@link PLAYER_COUNT}). */
    min: number;
    /**
     * When true, rotating forward automatically blocks female players from
     * leaving the court so the requirement is always met. When false, rotations
     * proceed mechanically and may drop below it.
     */
    autoFulfill: boolean;
    /** When true, the Min Females control is shown so users can change it. */
    editable: boolean;
  };
  /** Maximum number of players allowed on each side bench. */
  maxSizePerBench: number;
  /** Maximum number of players allowed on the roster. */
  maxRosterSize: number;
  /** How many independent lineup tabs to show. */
  numLineups: number;
  /**
   * Extra rotation-validity checks run alongside the built-in ones, kept
   * separate per rotation method (only the active method's validators run).
   */
  validators: MethodValidators;
  /** Overridable colour scheme (CSS variables + per-position swatches). */
  colors: ColorScheme;
  /** Theme used on first load (before the user toggles / a stored preference exists). */
  defaultTheme: Theme;
}

export const DEFAULT_SETTINGS: LineupSettings = {
  minGirls: { default: 2, min: 0, autoFulfill: true, editable: true },
  maxSizePerBench: 3,
  maxRosterSize: 13,
  numLineups: 6,
  validators: { bench: [], substitutions: [] },
  colors: DEFAULT_COLORS,
  defaultTheme: 'dark',
};

/**
 * A recursively optional version of `T` — used for partial overrides. Arrays
 * (e.g. validator lists) are taken whole rather than being made partial.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Merge user-supplied overrides onto {@link DEFAULT_SETTINGS}. */
export function resolveSettings(
  overrides?: DeepPartial<LineupSettings>
): LineupSettings {
  const settings: LineupSettings = !overrides
    ? DEFAULT_SETTINGS
    : {
      minGirls: { ...DEFAULT_SETTINGS.minGirls, ...overrides.minGirls },
      maxSizePerBench: overrides.maxSizePerBench ?? DEFAULT_SETTINGS.maxSizePerBench,
      maxRosterSize: overrides.maxRosterSize ?? DEFAULT_SETTINGS.maxRosterSize,
      numLineups: overrides.numLineups ?? DEFAULT_SETTINGS.numLineups,
      validators: { ...DEFAULT_SETTINGS.validators, ...overrides.validators },
      colors: {
        ...DEFAULT_SETTINGS.colors,
        ...overrides.colors,
        positions: { ...DEFAULT_SETTINGS.colors.positions, ...overrides.colors?.positions },
        positionBackgrounds: { ...DEFAULT_SETTINGS.colors.positionBackgrounds, ...overrides.colors?.positionBackgrounds },
      },
      defaultTheme: overrides.defaultTheme ?? DEFAULT_SETTINGS.defaultTheme,
    };
  validateSettings(settings);
  return settings;
}

/**
 * Sanity-check the resolved settings. Throws a `RangeError` on invalid input so
 * misconfigured package consumers fail loudly at startup rather than silently
 * rendering a broken lineup.
 */
export function validateSettings({ minGirls }: LineupSettings): void {
  if (minGirls.default < minGirls.min || minGirls.default > PLAYER_COUNT) {
    throw new RangeError(
      `Invalid settings: minGirls.default (${minGirls.default}) must be between ` +
      `minGirls.min (${minGirls.min}) and PLAYER_COUNT (${PLAYER_COUNT}).`
    );
  }
}

/** Resolved settings provided by `App`, consumable anywhere in the tree. */
export const SettingsContext = createContext<LineupSettings>(DEFAULT_SETTINGS);

/** Read the active resolved settings from context. */
export function useSettings(): LineupSettings {
  return useContext(SettingsContext);
}
