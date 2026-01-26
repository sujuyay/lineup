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

## Tech Stack

- React 19
- TypeScript
- Vite
- GitHub Pages

## License

MIT
