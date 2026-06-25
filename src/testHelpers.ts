import type { Player, Position, Gender, Lineup, Rotation } from './types';

/** Build a player; name defaults to the id. */
export function player(id: string, gender: Gender = 'male', position: Position | null = null): Player {
  return { id, name: id, position, gender };
}

/** Build a roster keyed by id (insertion order preserved). */
export function roster(...players: Player[]): Record<string, Player> {
  return Object.fromEntries(players.map((p) => [p.id, p]));
}

/** Build a rotation from court ids + optional benches. Empty string = empty slot. */
export function rotation(court: string[], opts: Partial<Omit<Rotation, 'court'>> = {}): Rotation {
  return {
    court: court.map((playerId) => ({ playerId })),
    leftBench: opts.leftBench ?? [],
    rightBench: opts.rightBench ?? [],
    liberoBench: opts.liberoBench ?? [],
    subsBench: opts.subsBench ?? [],
  };
}

/** A lineup whose rotation 0 serve and receive share the same formation. */
export function lineup(
  rotationMethod: Lineup['rotationMethod'],
  rosterMap: Record<string, Player>,
  rotation0: Rotation,
  minGirls = 2,
): Lineup {
  return { minGirls, rotationMethod, roster: rosterMap, rotations: [{ serve: rotation0, receive: rotation0 }] };
}

/** The court ids of a rotation/phase as a plain string array. */
export function courtIds(rot: Rotation): string[] {
  return rot.court.map((c) => c.playerId);
}
