import Phaser from 'phaser';
import { FONT_TITLE, COLOR } from '../core/theme';
import { playSfx } from '../core/audio';

export interface ButtonOpts {
  width?: number;
  style?: 'wood' | 'red';
  fontSize?: number;
  onClick: () => void;
}

/** Wide painted button (ui_button_wide_*) with a text label. */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private base: string;
  private enabled = true;
  private maxLabelW: number;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: ButtonOpts) {
    super(scene, x, y);
    this.base = `ui_button_wide_${opts.style ?? 'wood'}`;
    this.bg = scene.add.image(0, 0, `${this.base}_normal`);
    const w = opts.width ?? 440;
    this.bg.setScale(w / this.bg.width);
    this.label = scene.add.text(0, -2, text, {
      fontFamily: FONT_TITLE,
      fontSize: `${opts.fontSize ?? 34}px`,
      fontStyle: '700',
      color: COLOR.gold,
      stroke: '#2a1608',
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.maxLabelW = w * 0.8;
    this.fitLabel();
    this.add([this.bg, this.label]);
    this.setSize(this.bg.displayWidth * 0.86, this.bg.displayHeight * 0.62);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => {
      if (!this.enabled) return;
      this.bg.setTexture(`${this.base}_hover`);
      this.label.setColor('#fff3c4');
      playSfx(scene, 'ui_hover', 1);
    });
    this.on('pointerout', () => {
      if (!this.enabled) return;
      this.bg.setTexture(`${this.base}_normal`);
      this.label.setColor(COLOR.gold);
      this.label.y = -2;
    });
    this.on('pointerdown', () => {
      if (!this.enabled) return;
      this.bg.setTexture(`${this.base}_pressed`);
      this.label.y = 2;
    });
    this.on('pointerup', () => {
      if (!this.enabled) return;
      this.bg.setTexture(`${this.base}_hover`);
      this.label.y = -2;
      playSfx(scene, 'ui_click');
      opts.onClick();
    });
    scene.add.existing(this);
  }

  setLabel(text: string): this {
    this.label.setText(text);
    this.fitLabel();
    return this;
  }

  /** Shrink the label if (large) text would spill over the button. */
  private fitLabel(): void {
    this.label.setScale(1);
    const lw = this.label.width;
    if (lw > this.maxLabelW) this.label.setScale(this.maxLabelW / lw);
  }

  setEnabled(on: boolean): this {
    this.enabled = on;
    this.bg.setTexture(`${this.base}_${on ? 'normal' : 'disabled'}`);
    this.label.setAlpha(on ? 1 : 0.5);
    return this;
  }
}

/** Short message that fades out (e.g. "Coming soon"). */
export function toast(scene: Phaser.Scene, text: string): void {
  const tx = scene.add.text(scene.scale.width / 2, scene.scale.height - 140, text, {
    fontFamily: FONT_TITLE, fontSize: '36px', fontStyle: '700', color: COLOR.light,
    stroke: '#000', strokeThickness: 6,
  }).setOrigin(0.5).setDepth(1000).setAlpha(0).setScrollFactor(0);
  scene.tweens.chain({
    targets: tx,
    tweens: [
      { alpha: 1, y: tx.y - 20, duration: 250 },
      { alpha: 1, duration: 1100 },
      { alpha: 0, duration: 400 },
    ],
    onComplete: () => tx.destroy(),
  });
}
