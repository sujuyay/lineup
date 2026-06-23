import { createContext, useContext } from 'react';
import type { Lineup, Phase } from './App';

/** The app always fields a full volleyball lineup of six players on court. */
export const PLAYER_COUNT = 6;

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
  /** How many independent lineup tabs to show. */
  numLineups: number;
  /**
   * Extra rotation-validity checks run alongside the built-in ones, kept
   * separate per rotation method (only the active method's validators run).
   */
  validators: MethodValidators;
}

export const DEFAULT_SETTINGS: LineupSettings = {
  minGirls: { default: 2, min: 0, autoFulfill: true, editable: true },
  maxSizePerBench: 3,
  numLineups: 6,
  validators: { bench: [], substitutions: [] },
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
      numLineups: overrides.numLineups ?? DEFAULT_SETTINGS.numLineups,
      validators: { ...DEFAULT_SETTINGS.validators, ...overrides.validators },
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
