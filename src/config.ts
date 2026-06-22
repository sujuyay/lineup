import { createContext, useContext } from 'react';

/** The app always fields a full volleyball lineup of six players on court. */
export const PLAYER_COUNT = 6;

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
  };
  /** Maximum number of players allowed on each side bench. */
  maxSizePerBench: number;
  /** How many independent lineup tabs to show. */
  numLineups: number;
}

export const DEFAULT_SETTINGS: LineupSettings = {
  minGirls: { default: 2, min: 0 },
  maxSizePerBench: 4,
  numLineups: 6,
};

/** A recursively optional version of `T` — used for partial overrides. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
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
