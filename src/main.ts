import Phaser from 'phaser';
import { GAME_W, GAME_H } from './core/theme';
import { run as currentRun, advanceAct } from './run/state';
import { finalConfig, buildEnemy, battleConfig } from './run/encounters';
import { UNITS } from './data/units';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { ModalScene } from './scenes/ModalScene';
import { BattleScene } from './scenes/BattleScene';
import { HeroSelectScene } from './scenes/HeroSelectScene';
import { MapScene } from './scenes/MapScene';
import { NodeScene } from './scenes/NodeScene';
import { RewardScene } from './scenes/RewardScene';
import { RunEndScene } from './scenes/RunEndScene';
import { CityScene } from './scenes/CityScene';
import { HeroScene } from './scenes/HeroScene';
import { ActScene } from './scenes/ActScene';

// ?test: real-time deltas so slow headless test browsers run the game at normal speed
const params = new URLSearchParams(location.search);
const testMode = params.has('test');

const game = new Phaser.Game({
  fps: testMode ? { smoothStep: false, min: 4 } : undefined,
  type: params.has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d0a08',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, PreloadScene, TitleScene, ModalScene, BattleScene, HeroSelectScene, MapScene, NodeScene, RewardScene, RunEndScene, CityScene, HeroScene, ActScene],
});

// handy for automated tests and debugging in the browser console
(window as unknown as { game: Phaser.Game }).game = game;
(window as unknown as { hexRun: typeof currentRun }).hexRun = currentRun;
(window as unknown as { hexUnits: typeof UNITS }).hexUnits = UNITS;
(window as unknown as { hexDebug: object }).hexDebug = { advanceAct, finalConfig, buildEnemy, battleConfig };
