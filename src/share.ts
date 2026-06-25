import LZString from 'lz-string';
import type { Rotation, Player, Position, Gender } from './types';

/** URL query param that carries a shared lineup. */
export const SHARE_PARAM = 'l';

// Bump when the compact wire format changes incompatibly (e.g. the POSITIONS
// table is reordered or the array layout changes). Decode rejects other versions.
const SHARE_VERSION = 1;

// Wire-format tables (order is part of the format - never reorder).
const POSITIONS: Position[] = [
  'setter',
  'outside_hitter',
  'opposite_hitter',
  'libero',
  'middle_blocker',
  'defensive_specialist',
];

type RotationPair = { serve: Rotation; receive: Rotation };

// A lineup prepared for sharing. Rotations that the app can re-derive from
// rotation 0 are stored as `null` (rebuilt on load); rotation 0 and any custom
// rotations are kept explicit. Keeping only the non-derivable rotations is the
// biggest size win, since most lineups have none.
export interface ShareLineup {
  minGirls: number;
  rotationMethod: 'bench' | 'substitutions';
  roster: Record<string, Player>;
  rotations: (RotationPair | null)[];
}

// Compact, array-based encoding to keep shared URLs short:
//   - players are listed once and referenced everywhere by integer index,
//   - positions/gender become small codes,
//   - rotationalPosition is dropped (recomputed on import),
//   - derived rotations are 0; an explicit rotation is [serve] (receive mirrors
//     serve) or [serve, receive],
//   - object keys are dropped in favour of fixed-position arrays.
type CompactFormation = [number[], number[], number[], number[], number[]]; // court, L, R, libero, subs
type CompactRotation = 0 | [CompactFormation] | [CompactFormation, CompactFormation];
type CompactLineup = [
  number, // format version
  number, // minGirls
  number, // 1 = substitutions, 0 = bench
  Array<[string, number, number]>, // players: [name, positionCode, genderCode]
  CompactRotation[],
];

export function encodeLineup(lineup: ShareLineup): string {
  const ids = Object.keys(lineup.roster);
  const indexOf = new Map(ids.map((id, i) => [id, i]));
  const ref = (id: string) => (indexOf.has(id) ? indexOf.get(id)! : -1);

  const players = ids.map((id): [string, number, number] => {
    const p = lineup.roster[id];
    return [p.name, p.position ? POSITIONS.indexOf(p.position) : -1, p.gender === 'female' ? 1 : 0];
  });

  const formation = (f: Rotation): CompactFormation => [
    f.court.map((c) => ref(c.playerId)),
    f.leftBench.map(ref),
    f.rightBench.map(ref),
    f.liberoBench.map(ref),
    f.subsBench.map(ref),
  ];

  const rotations = lineup.rotations.map((r): CompactRotation => {
    if (!r) return 0;
    const serve = formation(r.serve);
    const receive = formation(r.receive);
    return JSON.stringify(serve) === JSON.stringify(receive) ? [serve] : [serve, receive];
  });

  const compact: CompactLineup = [
    SHARE_VERSION,
    lineup.minGirls,
    lineup.rotationMethod === 'substitutions' ? 1 : 0,
    players,
    rotations,
  ];

  return LZString.compressToEncodedURIComponent(JSON.stringify(compact));
}

export function decodeLineup(encoded: string): ShareLineup | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const data = JSON.parse(json) as CompactLineup;
    if (!Array.isArray(data) || data.length !== 5) return null;
    const [version, minGirls, methodCode, players, rot] = data;
    if (version !== SHARE_VERSION || !Array.isArray(players) || !Array.isArray(rot)) return null;

    // Player ids are internal, so regenerate stable ones from the index.
    const ids = players.map((_, i) => `p${i}`);
    const roster: Record<string, Player> = {};
    players.forEach(([name, positionCode, genderCode], i) => {
      roster[ids[i]] = {
        id: ids[i],
        name,
        position: positionCode >= 0 ? POSITIONS[positionCode] : null,
        gender: genderCode === 1 ? ('female' as Gender) : ('male' as Gender),
      };
    });

    const ref = (i: number) => (i >= 0 ? ids[i] : '');
    const formation = (f: CompactFormation): Rotation => ({
      court: f[0].map((i) => ({ playerId: ref(i) })),
      leftBench: f[1].map(ref),
      rightBench: f[2].map(ref),
      liberoBench: f[3].map(ref),
      subsBench: f[4].map(ref),
    });

    const rotations = rot.map((r): RotationPair | null => {
      if (r === 0) return null;
      const receive = r[1];
      return { serve: formation(r[0]), receive: receive ? formation(receive) : formation(r[0]) };
    });

    return { minGirls, rotationMethod: methodCode === 1 ? 'substitutions' : 'bench', roster, rotations };
  } catch {
    return null;
  }
}

/** Build a shareable absolute URL for the given (minimized) lineup. */
export function buildShareUrl(lineup: ShareLineup): string {
  const url = new URL(window.location.href);
  url.search = `${SHARE_PARAM}=${encodeLineup(lineup)}`;
  url.hash = '';
  return url.toString();
}

/** Decode a shared lineup from the current URL, if present (no side effects). */
export function readSharedLineup(): ShareLineup | null {
  const encoded = new URLSearchParams(window.location.search).get(SHARE_PARAM);
  return encoded ? decodeLineup(encoded) : null;
}

/** Strip the shared-lineup param so a refresh doesn't re-import it. */
export function clearShareParam(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has(SHARE_PARAM)) return;
  params.delete(SHARE_PARAM);
  const url = new URL(window.location.href);
  url.search = params.toString();
  window.history.replaceState(null, '', url.toString());
}
