// Public entry point for the reusable package. Importing the component also
// pulls in its styles; consumers must additionally import the stylesheet:
//   import { LineupSimulator } from 'lineup';
//   import 'lineup/style.css';
import './App.css';

export { default as LineupSimulator } from './App';
export type { Lineup, Rotation, Phase } from './types';

export { DEFAULT_SETTINGS, PLAYER_COUNT } from './config';
export type {
  LineupSettings,
  DeepPartial,
  ColorScheme,
  RotationValidator,
  MethodValidators,
} from './config';

export { POSITION_COLORS, POSITION_LABELS, POSITION_ABBREV } from './types';
export type { Player, Position, Gender } from './types';
