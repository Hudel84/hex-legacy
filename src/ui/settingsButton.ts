import Phaser from 'phaser';
import { playSfx } from '../core/audio';
import { settings } from '../core/settings';
import { IS_TOUCH, canFullscreen, isFullscreen, isStandalone, toggleFullscreen } from '../core/mobile';

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

/**
 * Round button that switches full screen (v0.21). Only on touch devices whose browser allows it
 * (Android, iPad), and not when started from the home screen (already full screen). Returns null otherwise.
 */
export function fullscreenButton(scene: Phaser.Scene, x: number, y: number, size = 64): Phaser.GameObjects.Container | null {
  if (!IS_TOUCH || !canFullscreen() || isStandalone()) return null;
  const bg = scene.add.image(0, 0, 'ui_button_round_wood_normal');
  bg.setScale(size / bg.width);
  const g = scene.add.graphics();
  const draw = () => {
    // four corner brackets: pointing out = enter, pointing in = leave
    g.clear().lineStyle(Math.max(3, size * 0.07), 0xf3d48a, 1);
    const a = size * 0.2, l = size * 0.12, inward = isFullscreen();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = sx * a, cy = sy * a;
      const dx = inward ? sx * l : -sx * l, dy = inward ? sy * l : -sy * l;
      g.beginPath(); g.moveTo(cx + dx, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + dy); g.strokePath();
    }
  };
  draw();
  const c = scene.add.container(x, y, [bg, g]);
  c.setSize(size, size).setInteractive({ useHandCursor: true });
  c.on('pointerup', () => { playSfx(scene, 'ui_click'); toggleFullscreen(); });
  const onChange = () => scene.time.delayedCall(150, draw);
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  c.once('destroy', () => {
    document.removeEventListener('fullscreenchange', onChange);
    document.removeEventListener('webkitfullscreenchange', onChange);
  });
  return c;
}
