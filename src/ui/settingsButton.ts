import Phaser from 'phaser';
import { playSfx } from '../core/audio';
import { settings } from '../core/settings';

/** Opens the settings window over a run screen; the screen is paused until it closes (v0.20.4). */
export function openSettings(scene: Phaser.Scene): void {
  if (scene.scene.isActive('Modal')) return;
  playSfx(scene, 'ui_open');
  const key = scene.scene.key;
  scene.scene.launch('Modal', { kind: 'settings', caller: key, look: `${settings.lang}|${settings.textSize}` });
  scene.scene.bringToTop('Modal');
  scene.scene.pause();
}

/** Round gear button (ui kit) that opens the settings. */
export function settingsButton(scene: Phaser.Scene, x: number, y: number, size = 64): Phaser.GameObjects.Image {
  const b = scene.add.image(x, y, 'ui_button_settings');
  const s = size / b.width;
  b.setScale(s).setInteractive({ useHandCursor: true });
  b.on('pointerover', () => b.setScale(s * 1.08));
  b.on('pointerout', () => b.setScale(s));
  b.on('pointerup', () => openSettings(scene));
  return b;
}
