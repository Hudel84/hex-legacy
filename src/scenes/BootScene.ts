import Phaser from 'phaser';
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/cinzel/latin-900.css';
import '@fontsource/alegreya/latin-400.css';
import '@fontsource/alegreya/latin-700.css';

/** Waits for the web fonts so Phaser text renders with the right font from the start. */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create(): void {
    const fonts = ['700 32px Cinzel', '900 32px Cinzel', '400 32px Alegreya', '700 32px Alegreya'];
    Promise.all(fonts.map((f) => document.fonts.load(f)))
      .catch(() => undefined)
      .then(() => this.scene.start('Preload'));
  }
}
