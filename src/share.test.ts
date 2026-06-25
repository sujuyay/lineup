import { describe, it, expect } from 'vitest';
import LZString from 'lz-string';
import { encodeLineup, decodeLineup } from './share';
import { minimizeLineup, expandLineup, hydrateFrom } from './utils';
import { player, roster, rotation, lineup, courtIds } from './testHelpers';

function sampleLineup() {
  const players = [
    player('p0', 'male', 'outside_hitter'),
    player('p1', 'female', 'setter'),
    player('p2', 'male', 'middle_blocker'),
    player('p3', 'female', 'opposite_hitter'),
    player('p4', 'male', 'libero'),
    player('p5', 'male', 'defensive_specialist'),
  ];
  const l = lineup('substitutions', roster(...players), rotation(players.map((p) => p.id)));
  return hydrateFrom(l, 0, 'serve', false);
}

describe('encodeLineup / decodeLineup', () => {
  it('round-trips a lineup through the compact codec', () => {
    const original = sampleLineup();
    const decoded = decodeLineup(encodeLineup(minimizeLineup(original, false)));
    expect(decoded).not.toBeNull();
    const restored = expandLineup(decoded!, false);

    expect(restored.rotationMethod).toBe('substitutions');
    expect(restored.rotations).toHaveLength(original.rotations.length);
    // Player ids are regenerated as p0.. in roster order, matching the originals here.
    restored.rotations.forEach((rot, i) => {
      expect(courtIds(rot.serve)).toEqual(courtIds(original.rotations[i].serve));
      expect(courtIds(rot.receive)).toEqual(courtIds(original.rotations[i].receive));
    });
  });

  it('preserves player names, positions, and genders', () => {
    const original = sampleLineup();
    const decoded = decodeLineup(encodeLineup(minimizeLineup(original, false)))!;
    const setter = Object.values(decoded.roster).find((p) => p.position === 'setter');
    expect(setter?.name).toBe('p1');
    expect(setter?.gender).toBe('female');
    expect(Object.values(decoded.roster).some((p) => p.position === 'libero')).toBe(true);
  });

  it('produces a URL-safe, reasonably short payload', () => {
    const encoded = encodeLineup(minimizeLineup(sampleLineup(), false));
    expect(encoded).toMatch(/^[A-Za-z0-9+\-$_.!*'()]+$/);
    expect(encoded.length).toBeLessThan(400);
  });

  it('rejects garbage input', () => {
    expect(decodeLineup('not-valid')).toBeNull();
    expect(decodeLineup('')).toBeNull();
  });

  it('rejects an unknown format version', () => {
    // Hand-build a structurally valid payload with a future version (current is 1).
    const futureVersion = LZString.compressToEncodedURIComponent(JSON.stringify([2, 2, 1, [], []]));
    expect(decodeLineup(futureVersion)).toBeNull();
  });
});
