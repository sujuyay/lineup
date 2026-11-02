# 🏐 Volleyball Lineup

A React app (and reusable component) for configuring and visualizing volleyball
team rotations.

## Features

- **Drag-and-drop court editor** with a 6-player court, side benches, a libero
  slot and a substitutes bench
- **Two rotation methods**: _Bench_ (every player rotates through the court and
  bench) or _Substitutions_ (only court players rotate; others come in as subs)
- **Serve / receive formations** for every rotation, with per-rotation validity
  markers
- **Gender requirements**: set a minimum number of females on court; rotations
  can automatically keep the requirement met
- **Position colour-coding**: Setter, Outside Hitter, Opposite Hitter, Libero,
  Middle Blocker, Defensive Specialist
- **Multiple saved lineups**, persisted to `localStorage`
- **Shareable links** that open a lineup in view-only mode
- **Dark and light themes**

## Use as a package

### Install

```bash
npm install @jkim430/lineup
```

`react` and `react-dom` (v18 or v19) are peer dependencies, so your app provides
them.

### Render the component

Import the component and its stylesheet once:

```tsx
import { LineupSimulator } from '@jkim430/lineup';
import '@jkim430/lineup/style.css';

export function App() {
  return <LineupSimulator />;
}
```

With no props it behaves exactly like the standalone site. Both props are
optional:

| Prop       | Type                                                       | Description                                                        |
| ---------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `settings` | `DeepPartial<LineupSettings>`                              | Overrides for the default settings (see below).                    |
| `onTrack`  | `(event: string, data?: Record<string, unknown>) => void` | Called for each analytics event. Omit it to disable tracking.      |

### Settings

Pass any subset of the settings; anything you leave out uses the default.
Nested objects (`minGirls`, `validators`, `colors`, `colors.positions`,
`colors.positionBackgrounds`) are merged key by key, so you only need to supply
the fields you're changing.

```tsx
<LineupSimulator
  settings={{
    minGirls: { default: 1, editable: false },
    maxRosterSize: 12,
    numLineups: 3,
    defaultTheme: 'light',
    colors: { accentPrimary: '#ff7a00', positions: { setter: '#E6B333' } },
  }}
/>
```

| Setting                | Type                          | Default         | Description                                                                                                                                                         |
| ---------------------- | ----------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `minGirls.default`     | `number`                      | `2`             | Minimum females on court for a new lineup. Must be between `minGirls.min` and 6.                                                                                     |
| `minGirls.min`         | `number`                      | `0`             | Lowest value the Min Females control allows.                                                                                                                        |
| `minGirls.autoFulfill` | `boolean`                     | `true`          | When `true`, rotating forward keeps females from leaving the court so the minimum is always met. When `false`, rotations are purely mechanical and may drop below it. |
| `minGirls.editable`    | `boolean`                     | `true`          | Show the Min Females control. Set `false` to lock every lineup to `minGirls.default`.                                                                               |
| `maxSizePerBench`      | `number`                      | `3`             | Maximum players on each side bench. The subs bench holds twice this.                                                                                                |
| `maxRosterSize`        | `number`                      | `13`            | Maximum players in a lineup's roster.                                                                                                                               |
| `numLineups`           | `number`                      | `6`             | Number of lineup tabs (L1, L2, …).                                                                                                                                   |
| `validators`           | `{ bench, substitutions }`    | `[]` each       | Extra rotation checks, per rotation method. See [Custom validators](#custom-validators).                                                                            |
| `colors`               | `Partial<ColorScheme>`        | built-in dark   | Colour overrides. See [Colours](#colours).                                                                                                                           |
| `defaultTheme`         | `'dark' \| 'light'`           | `'dark'`        | Theme on first load. After that, the user's own choice is remembered.                                                                                               |
| `defaultMessage`       | `ReactNode`                   | `null`          | An info message shown above the action bar whenever no other message (validation error, "Link copied!", etc.) is showing. Accepts JSX, e.g. text with a link.        |

Invalid settings throw a `RangeError` on mount (for example,
`minGirls.default` outside `minGirls.min`–6), so misconfiguration fails loudly.

### Custom validators

A validator receives the lineup, the rotation index (0-based) and the phase,
and returns a list of problems. An empty list means the rotation is fine. Any
messages are shown like the built-in ones: a red marker on the rotation and an
error message above the action bar. Only the active rotation method's
validators run.

```tsx
import type { RotationValidator } from '@jkim430/lineup';

// Require a setter on court in every rotation.
const needsSetter: RotationValidator = (lineup, rotationIndex, phase) => {
  const { court } = lineup.rotations[rotationIndex][phase];
  const hasSetter = court.some((slot) => lineup.roster[slot.playerId]?.position === 'setter');
  return { messages: hasSetter ? [] : ['A setter must be on court'] };
};

<LineupSimulator settings={{ validators: { bench: [needsSetter], substitutions: [needsSetter] } }} />;
```

Validation only runs once all six court slots are filled.

The `Lineup` shape (all ids are keys into `roster`; `''` means an empty slot):

```ts
interface Lineup {
  title?: string;
  minGirls: number;
  rotationMethod: 'bench' | 'substitutions';
  roster: Record<string, Player>;
  rotations: { serve: Rotation; receive: Rotation }[];
}

type Rotation = {
  court: { playerId: string; rotationalPosition?: number }[]; // 6 slots: front row 0-2, back row 3-5
  leftBench: string[];
  rightBench: string[];
  liberoBench: string[]; // 0 or 1 entries
  subsBench: string[];
};

interface Player {
  id: string;
  name: string;
  position: Position | null;
  gender: 'male' | 'female';
}
```

### Colours

`colors` overrides the dark palette. The light theme keeps your accent, gender,
danger and position colours, but uses its own fixed background, court, text and
position-background colours.

| Key                                         | Used for                                                     |
| ------------------------------------------- | ------------------------------------------------------------ |
| `bgPrimary`, `bgSecondary`, `bgTertiary`    | Page background, panels, inputs/buttons                      |
| `courtBg`, `courtLines`                     | Court surface and lines                                      |
| `textPrimary`, `textSecondary`, `textMuted` | Text                                                         |
| `titleColor`                                | The "Lineup Simulator" heading                               |
| `accentPrimary`, `accentSecondary`          | Active/primary controls and their hover state                |
| `male`, `female`                            | Gender labels on player cards                                |
| `danger`                                    | Errors and destructive actions                               |
| `positions`                                 | Per-position card border/swatch colour, keyed by `Position`  |
| `positionBackgrounds`                       | Per-position card background, keyed by `Position`            |

`Position` is one of `'setter'`, `'outside_hitter'`, `'opposite_hitter'`,
`'libero'`, `'middle_blocker'`, `'defensive_specialist'`.

### Analytics

Nothing is tracked unless you pass `onTrack`. Wire it to any provider:

```tsx
<LineupSimulator onTrack={(event, data) => posthog.capture(event, data)} />
```

| Event                     | Data                       |
| ------------------------- | -------------------------- |
| `lineup_created`          | (none)                     |
| `player_added`            | `{ name, position }`       |
| `rotation_method_changed` | `{ method }`               |
| `lineup_cloned`           | `{ title }`                |
| `share_link_copied`       | `{ title }`                |
| `shared_lineup_viewed`    | `{ title }`                |
| `shared_lineup_imported`  | `{ target, title }`        |

### Things to know when embedding

- **Global styles**: `style.css` includes a small CSS reset (`* { margin: 0;
  padding: 0; box-sizing: border-box }`) and sets the `body` font, background
  and text colour. The component also writes its colour variables and a
  `data-theme` attribute onto `<html>`. Plan for this if your host page has its
  own global styles.
- **Storage**: lineups are saved to `localStorage` under
  `volleyball-lineup-data-v3`, and the theme under `volleyball-lineup-theme-v3`.
  Every instance on the same origin shares this data.
- **Share links**: shared lineups are encoded in the `?l=` query parameter of
  the current page URL. The component reads it on load to open view-only mode,
  and removes it after the lineup is imported.

### Exports

```ts
// Component
LineupSimulator

// Values
DEFAULT_SETTINGS, PLAYER_COUNT, POSITION_COLORS, POSITION_LABELS, POSITION_ABBREV

// Types
LineupSettings, DeepPartial, ColorScheme, RotationValidator, MethodValidators,
Lineup, Rotation, Phase, Player, Position, Gender
```

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run lint
npm run build      # standalone site -> ./dist
npm run build:lib  # package output -> ./lib (index.js, index.d.ts, style.css)
```

### Deploy to GitHub Pages

1. Update the `homepage` field in `package.json` with your GitHub username
2. Update the `base` in `vite.config.ts` if your repo name is different
3. Run:

```bash
npm run deploy
```

### Publish to npm

`npm publish` builds `./lib` automatically (via the `prepare` script) and
publishes only that folder.

```bash
npm version patch
npm publish
```

## Tech Stack

- React 19
- TypeScript
- Vite
- GitHub Pages

## License

MIT
