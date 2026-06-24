# 🏐 Volleyball Lineup

A modern React app for configuring and visualizing volleyball team rotations.

## Features

- **Configurable Court Size**: Adjust the number of players on court (1-12, default 6)
- **Position Management**: Assign players to positions with color-coded roles
  - Setter (Gold)
  - Outside Hitter (Blue)
  - Opposite Hitter (Red)
  - Libero (Green)
  - Middle Blocker (Purple)
- **Substitute Bench**: Up to 3 subs on each side of the court (6 total)
- **Gender Requirements**: Set minimum girls required on court
- **Smart Rotations**: Automatic rotation that maintains gender requirements

## Getting Started

### Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

### Deploy to GitHub Pages

1. Update the `homepage` field in `package.json` with your GitHub username
2. Update the `base` in `vite.config.ts` if your repo name is different
3. Run:

```bash
npm run deploy
```

## Use as a package

This repo doubles as a reusable React component. Build the library output with:

```bash
npm run build:lib   # emits ./lib (index.js, index.d.ts, style.css)
```

Then in a consuming app:

```tsx
import { LineupSimulator } from '@sujuyay/lineup';
import '@sujuyay/lineup/style.css';

export function App() {
  return (
    <LineupSimulator
      // All optional; deeply-merged over the defaults.
      settings={{
        minGirls: { default: 1 },
        maxRosterSize: 12,
        colors: { accentPrimary: '#00d4aa', positions: { setter: '#E6B333' } },
        validators: { substitutions: [/* custom RotationValidator[] */] },
      }}
      // Provide your own analytics sink (or omit to disable).
      onTrack={(event, data) => myAnalytics.track(event, data)}
    />
  );
}
```

`react` and `react-dom` are peer dependencies (the consumer provides them);
`@dnd-kit/*` and `lz-string` are bundled-as-dependencies and externalized, so
they resolve from the consumer's `node_modules`. Each consuming site supplies
its own `onTrack`, so analytics are fully separate from this repo's site.

Exported types include `LineupSettings`, `DeepPartial`, `ColorScheme`,
`RotationValidator`, `MethodValidators`, and `Player`/`Position`.

## Tech Stack

- React 19
- TypeScript
- Vite
- GitHub Pages

## License

MIT
