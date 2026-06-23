import { describe, it, expect } from 'vitest';
import { resolveSettings, validateSettings, DEFAULT_SETTINGS, PLAYER_COUNT } from './config';

describe('resolveSettings', () => {
  it('returns the defaults when no overrides are given', () => {
    expect(resolveSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('merges nested minGirls overrides, keeping untouched fields', () => {
    const resolved = resolveSettings({ minGirls: { default: 1 } });
    expect(resolved.minGirls.default).toBe(1);
    expect(resolved.minGirls.min).toBe(DEFAULT_SETTINGS.minGirls.min);
    expect(resolved.minGirls.editable).toBe(DEFAULT_SETTINGS.minGirls.editable);
  });

  it('merges top-level scalar overrides', () => {
    const resolved = resolveSettings({ maxSizePerBench: 5, maxRosterSize: 20 });
    expect(resolved.maxSizePerBench).toBe(5);
    expect(resolved.maxRosterSize).toBe(20);
    expect(resolved.numLineups).toBe(DEFAULT_SETTINGS.numLineups);
  });

  it('merges colour overrides, including nested position swatches', () => {
    const resolved = resolveSettings({
      colors: { accentPrimary: '#abcdef', positions: { setter: '#123456' } },
    });
    expect(resolved.colors.accentPrimary).toBe('#abcdef');
    expect(resolved.colors.bgPrimary).toBe(DEFAULT_SETTINGS.colors.bgPrimary);
    expect(resolved.colors.positions.setter).toBe('#123456');
    expect(resolved.colors.positions.libero).toBe(DEFAULT_SETTINGS.colors.positions.libero);
  });

  it('takes validator arrays whole rather than deep-merging them', () => {
    const validator = () => ({ messages: [] });
    const resolved = resolveSettings({ validators: { substitutions: [validator] } });
    expect(resolved.validators.substitutions).toEqual([validator]);
    expect(resolved.validators.bench).toEqual(DEFAULT_SETTINGS.validators.bench);
  });
});

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(() => validateSettings(DEFAULT_SETTINGS)).not.toThrow();
  });

  it('throws when minGirls.default exceeds PLAYER_COUNT', () => {
    const bad = { ...DEFAULT_SETTINGS, minGirls: { ...DEFAULT_SETTINGS.minGirls, default: PLAYER_COUNT + 1 } };
    expect(() => validateSettings(bad)).toThrow(RangeError);
  });

  it('throws when minGirls.default is below minGirls.min', () => {
    const bad = { ...DEFAULT_SETTINGS, minGirls: { ...DEFAULT_SETTINGS.minGirls, min: 3, default: 2 } };
    expect(() => validateSettings(bad)).toThrow(RangeError);
  });
});
