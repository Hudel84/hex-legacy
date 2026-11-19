import Phaser from 'phaser';
import { GAME_W, GAME_H } from './core/theme';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { ModalScene } from './scenes/ModalScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d0a08',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, PreloadScene, TitleScene, ModalScene],
});

// handy for automated tests and debugging in the browser console
(window as unknown as { game: Phaser.Game }).game = game;
