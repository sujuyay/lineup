import { describe, it, expect } from 'vitest';
import {
  COURT_ROTATIONAL_POSITIONS,
  ROTATION_MAP,
  createEmptyRotation,
  createEmptyLineup,
  isEmptyLineup,
  rotateLayout,
  assignRotationalPositions,
  resolveRotationView,
  viewToRotation,
  fieldCount,
  swapInView,
  rotateView,
  liberoServeViolation,
  rotationalPositionViolation,
  validateRotation,
  pruneRoster,
  hydrateFrom,
  minimizeLineup,
  expandLineup,
} from './App';
import type { View, SlotRef } from './App';
import { DEFAULT_SETTINGS } from './config';
import { player, roster, rotation, lineup, courtIds } from './testHelpers';

const SETTINGS = DEFAULT_SETTINGS;

describe('createEmptyLineup / isEmptyLineup', () => {
  it('creates an empty bench lineup with one empty rotation', () => {
    const l = createEmptyLineup(SETTINGS);
    expect(l.rotationMethod).toBe('bench');
    expect(Object.keys(l.roster)).toHaveLength(0);
    expect(l.rotations).toHaveLength(1);
    expect(createEmptyRotation().court).toHaveLength(6);
    expect(isEmptyLineup(l)).toBe(true);
  });

  it('reports a lineup with players as non-empty', () => {
    const l = lineup('bench', roster(player('a')), rotation(['a', '', '', '', '', '']));
    expect(isEmptyLineup(l)).toBe(false);
  });
});

describe('ROTATION_MAP', () => {
  it('backward is the inverse of forward', () => {
    for (let s = 0; s < 6; s++) {
      expect(ROTATION_MAP.backward[ROTATION_MAP.forward[s]]).toBe(s);
    }
  });
});

describe('rotateLayout', () => {
  it('moves each slot value to its forward target', () => {
    const next = rotateLayout(COURT_ROTATIONAL_POSITIONS);
    // value at slot s moves to slot forward[s]
    for (let s = 0; s < 6; s++) {
      expect(next[ROTATION_MAP.forward[s]]).toBe(COURT_ROTATIONAL_POSITIONS[s]);
    }
  });
});

describe('resolveRotationView / viewToRotation', () => {
  it('round-trips ids <-> players', () => {
    const r = roster(player('a'), player('b'), player('c'), player('d'), player('e'), player('f'));
    const rot = rotation(['a', 'b', 'c', 'd', 'e', 'f'], { subsBench: ['a'] });
    const view = resolveRotationView(rot, r);
    expect(view.court.map((p) => p?.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(view.subsBench.map((p) => p.id)).toEqual(['a']);
    expect(courtIds(viewToRotation(view))).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('resolves missing ids to null court slots', () => {
    const view = resolveRotationView(rotation(['a', '', '', '', '', '']), roster(player('a')));
    expect(view.court[0]?.id).toBe('a');
    expect(view.court[1]).toBeNull();
  });
});

describe('fieldCount', () => {
  it('counts court players plus both side benches', () => {
    const view: View = {
      court: [player('a'), player('b'), null, null, null, null],
      leftBench: [player('c')],
      rightBench: [player('d'), player('e')],
      liberoBench: player('L'),
      subsBench: [player('s')],
    };
    expect(fieldCount(view)).toBe(2 + 1 + 2); // libero + subs not counted
  });
});

describe('swapInView', () => {
  const baseView = (): View => ({
    court: [player('a'), player('b'), player('c'), player('d'), player('e'), player('f')],
    leftBench: [player('L1')],
    rightBench: [],
    liberoBench: player('LIB'),
    subsBench: [player('S1')],
  });

  it('swaps two court slots', () => {
    const out = swapInView(baseView(), { type: 'court', index: 0 }, { type: 'court', index: 5 });
    expect(out.court[0]?.id).toBe('f');
    expect(out.court[5]?.id).toBe('a');
  });

  it('swaps a court player with a sub', () => {
    const out = swapInView(baseView(), { type: 'court', index: 0 }, { type: 'sub', index: 0 });
    expect(out.court[0]?.id).toBe('S1');
    expect(out.subsBench.map((p) => p.id)).toEqual(['a']);
  });

  it('swaps a court player onto the libero bench', () => {
    const src: SlotRef = { type: 'court', index: 3 };
    const out = swapInView(baseView(), src, { type: 'libero' });
    expect(out.court[3]?.id).toBe('LIB');
    expect(out.liberoBench?.id).toBe('d');
  });
});

describe('rotateView', () => {
  const sixCourt = (): View => ({
    court: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id)),
    leftBench: [],
    rightBench: [],
    liberoBench: null,
    subsBench: [],
  });

  it('permutes the court by ROTATION_MAP.forward', () => {
    const out = rotateView(sixCourt(), 0, false, 'forward');
    // new[forward[s]] = old[s]
    const old = ['a', 'b', 'c', 'd', 'e', 'f'];
    for (let s = 0; s < 6; s++) {
      expect(out.court[ROTATION_MAP.forward[s]]?.id).toBe(old[s]);
    }
  });

  it('swaps the libero off the back row when it would rotate to the front', () => {
    const view: View = {
      court: [player('a'), player('b'), player('c'), player('LIB', 'male', 'libero'), player('e'), player('f')],
      leftBench: [],
      rightBench: [],
      liberoBench: player('X'),
      subsBench: [],
    };
    const out = rotateView(view, 0, false, 'forward');
    // libero leaves to the bench; X comes onto the court (slot 3 -> forward[3]=0)
    expect(out.liberoBench?.id).toBe('LIB');
    expect(out.court[0]?.id).toBe('X');
  });
});

describe('assignRotationalPositions', () => {
  it('clears positions for the bench method', () => {
    const r = roster(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id)));
    const l = lineup('bench', r, rotation(['a', 'b', 'c', 'd', 'e', 'f']));
    const out = assignRotationalPositions(l);
    expect(out.rotations[0].serve.court.every((c) => c.rotationalPosition === undefined)).toBe(true);
  });

  it('seeds substitutions positions from the serve slot layout', () => {
    const r = roster(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id)));
    const l = lineup('substitutions', r, rotation(['a', 'b', 'c', 'd', 'e', 'f']));
    const out = assignRotationalPositions(l);
    expect(out.rotations[0].serve.court.map((c) => c.rotationalPosition)).toEqual(COURT_ROTATIONAL_POSITIONS);
  });

  it('gives a receive-only sub the position of the player it replaced', () => {
    const r = roster(...['a', 'b', 'c', 'd', 'e', 'f', 'sub'].map((id) => player(id)));
    // receive swaps `sub` in for `a` (slot 0, position 4)
    const l: ReturnType<typeof lineup> = {
      minGirls: 2,
      rotationMethod: 'substitutions',
      roster: r,
      rotations: [
        {
          serve: rotation(['a', 'b', 'c', 'd', 'e', 'f'], { subsBench: ['sub'] }),
          receive: rotation(['sub', 'b', 'c', 'd', 'e', 'f'], { subsBench: ['a'] }),
        },
      ],
    };
    const out = assignRotationalPositions(l);
    // 'a' holds position 4 on serve; the receive sub inherits it.
    expect(out.rotations[0].receive.court[0].rotationalPosition).toBe(4);
  });
});

describe('liberoServeViolation', () => {
  const makeServing = (benchA: string, benchB: string) => {
    const r = roster(player('LIB', 'male', 'libero'), player('a'), player('b'));
    return {
      minGirls: 0,
      rotationMethod: 'substitutions' as const,
      roster: r,
      rotations: [
        { serve: rotation(['x', 'x', 'x', 'x', 'x', 'LIB'], { liberoBench: [benchA] }), receive: rotation(['x', 'x', 'x', 'x', 'x', 'LIB']) },
        { serve: rotation(['x', 'x', 'x', 'x', 'x', 'LIB'], { liberoBench: [benchB] }), receive: rotation(['x', 'x', 'x', 'x', 'x', 'LIB']) },
      ],
    };
  };

  it('flags the libero serving for two different players', () => {
    expect(liberoServeViolation(makeServing('a', 'b'))).toMatch(/libero/i);
  });

  it('allows the libero serving for the same player', () => {
    expect(liberoServeViolation(makeServing('a', 'a'))).toBeNull();
  });

  it('returns null when there is no libero', () => {
    const r = roster(player('a'), player('b'));
    const l = lineup('substitutions', r, rotation(['a', 'b', '', '', '', '']));
    expect(liberoServeViolation(l)).toBeNull();
  });
});

describe('rotationalPositionViolation', () => {
  it('flags a player occupying two positions across rotations', () => {
    const r = roster(...['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id)));
    const l: ReturnType<typeof lineup> = {
      minGirls: 0,
      rotationMethod: 'substitutions',
      roster: r,
      rotations: [
        { serve: rotation(['a', 'b', 'c', 'd', 'e', 'f']), receive: rotation(['a', 'b', 'c', 'd', 'e', 'f']) },
        { serve: rotation(['b', 'a', 'c', 'd', 'e', 'f']), receive: rotation(['b', 'a', 'c', 'd', 'e', 'f']) },
      ],
    };
    const seeded = assignRotationalPositions(l);
    // 'a' is position 4 (slot 0) in rotation 0, but position 3 (slot 1) in rotation 1.
    expect(rotationalPositionViolation(seeded)).toMatch(/one position/i);
  });

  it('returns null for the bench method', () => {
    const r = roster(player('a'));
    expect(rotationalPositionViolation(lineup('bench', r, rotation(['a', '', '', '', '', ''])))).toBeNull();
  });
});

describe('validateRotation', () => {
  const sixGirls = (females: number) =>
    ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => player(id, i < females ? 'female' : 'male'));

  it('treats a partially filled court as valid', () => {
    const r = roster(player('a'));
    const l = lineup('bench', r, rotation(['a', '', '', '', '', '']), 2);
    expect(validateRotation(l, 0, 'serve', SETTINGS).valid).toBe(true);
  });

  it('flags a full court below minGirls', () => {
    const players = sixGirls(1);
    const l = lineup('bench', roster(...players), rotation(players.map((p) => p.id)), 2);
    const result = validateRotation(l, 0, 'serve', SETTINGS);
    expect(result.valid).toBe(false);
    expect(result.messages.join()).toMatch(/female/i);
  });

  it('passes a full court meeting minGirls', () => {
    const players = sixGirls(2);
    const l = lineup('bench', roster(...players), rotation(players.map((p) => p.id)), 2);
    expect(validateRotation(l, 0, 'serve', SETTINGS).valid).toBe(true);
  });

  it('flags a roster exceeding maxRosterSize', () => {
    const players = sixGirls(2);
    const l = lineup('bench', roster(...players), rotation(players.map((p) => p.id)), 0);
    const result = validateRotation(l, 0, 'serve', { ...SETTINGS, maxRosterSize: 3 });
    expect(result.messages.join()).toMatch(/roster/i);
  });

  it('runs method-specific custom validators', () => {
    const players = sixGirls(2);
    const l = lineup('substitutions', roster(...players), rotation(players.map((p) => p.id)), 0);
    const settings = {
      ...SETTINGS,
      validators: { bench: [], substitutions: [() => ({ messages: ['custom fail'] })] },
    };
    expect(validateRotation(l, 0, 'serve', settings).messages).toContain('custom fail');
  });
});

describe('pruneRoster', () => {
  it('drops players not referenced by any rotation', () => {
    const r = roster(player('a'), player('b'), player('unused'));
    const rotations = [{ serve: rotation(['a', 'b', '', '', '', '']), receive: rotation(['a', 'b', '', '', '', '']) }];
    const pruned = pruneRoster(r, rotations);
    expect(Object.keys(pruned).sort()).toEqual(['a', 'b']);
  });
});

describe('hydrateFrom', () => {
  it('derives one rotation per field player and seeds positions', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id));
    const l = lineup('substitutions', roster(...players), rotation(players.map((p) => p.id)));
    const out = hydrateFrom(l, 0, 'serve', false);
    expect(out.rotations).toHaveLength(6); // 6 court players, no benches
    // every serve court is fully positioned 1-6
    out.rotations.forEach((rot) => {
      expect([...new Set(rot.serve.court.map((c) => c.rotationalPosition))].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });
});

describe('minimizeLineup / expandLineup', () => {
  const baseLineup = () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => player(id));
    const l = lineup('substitutions', roster(...players), rotation(players.map((p) => p.id)));
    return hydrateFrom(l, 0, 'serve', false);
  };

  it('round-trips a fully derived lineup', () => {
    const original = baseLineup();
    const restored = expandLineup(minimizeLineup(original, false), false);
    expect(restored.rotations).toHaveLength(original.rotations.length);
    restored.rotations.forEach((rot, i) => {
      expect(courtIds(rot.serve)).toEqual(courtIds(original.rotations[i].serve));
    });
  });

  it('nulls out derived rotations, keeping only rotation 0', () => {
    const minimal = minimizeLineup(baseLineup(), false);
    expect(minimal.rotations[0]).not.toBeNull();
    expect(minimal.rotations.slice(1).every((r) => r === null)).toBe(true);
  });

  it('preserves a custom later rotation through the round-trip', () => {
    const original = baseLineup();
    // Manually customise rotation 2 serve (swap slots 0 and 1).
    const r2 = original.rotations[2].serve;
    const swapped = { ...r2, court: [r2.court[1], r2.court[0], ...r2.court.slice(2)] };
    original.rotations[2] = { serve: swapped, receive: swapped };

    const minimal = minimizeLineup(original, false);
    expect(minimal.rotations[2]).not.toBeNull(); // diverges from derived -> kept explicit

    const restored = expandLineup(minimal, false);
    expect(courtIds(restored.rotations[2].serve)).toEqual(courtIds(swapped));
  });
});
