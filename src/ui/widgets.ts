import Phaser from 'phaser';
import { FONT_TITLE, FONT_BODY, COLOR } from '../core/theme';
import { playSfx } from '../core/audio';

export function textStyle(size: number, color: string = COLOR.light, bold = false, font = FONT_BODY): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: font, fontSize: `${size}px`, fontStyle: bold ? '700' : '400', color, stroke: '#000', strokeThickness: Math.max(2, Math.round(size / 7)) };
}
export function titleStyle(size: number, color: string = COLOR.gold): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_TITLE, fontSize: `${size}px`, fontStyle: '700', color, stroke: '#2a1608', strokeThickness: Math.round(size / 6) };
}
/** Dark text for parchment backgrounds. */
export function inkStyle(size: number, bold = false): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_BODY, fontSize: `${size}px`, fontStyle: bold ? '700' : '400', color: COLOR.parchmentText };
}

/** Stretchable panel from one of the painted panel images (9-slice). */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, key = 'ui_panel_dark_wood', border = 70): Phaser.GameObjects.NineSlice {
  return scene.add.nineslice(x, y, key, undefined, w, h, border, border, border, border);
}

export interface CardOpts {
  w?: number;
  h?: number;
  portrait?: string;
  title: string;
  subtitle?: string;
  lines?: string[];
  onClick?: () => void;
  disabled?: boolean;
  highlight?: boolean;
}

/** Card with gold frame, portrait in the arch and text below (units, heroes, rewards). */
export function card(scene: Phaser.Scene, x: number, y: number, o: CardOpts): Phaser.GameObjects.Container {
  const w = o.w ?? 300;
  const h = o.h ?? w * 489 / 359;
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x1b120b, 0.96).fillRoundedRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 14);
  c.add(bg);
  if (o.portrait) {
    const p = scene.add.image(0, -h / 2 + w * 0.47, o.portrait);
    const ps = (w * 0.74) / Math.max(p.width, p.height);
    p.setScale(ps);
    c.add(p);
  }
  // 9-slice keeps the arch and corners intact when the card is taller than the frame image
  const fs = w / 359;
  const frame = scene.add.nineslice(0, 0, 'ui_frame_unit_card', undefined, w / fs, h / fs, 45, 45, 200, 70).setScale(fs);
  c.add(frame);
  const ty = -h / 2 + w * 0.95;
  const title = scene.add.text(0, ty, o.title, { ...titleStyle(Math.round(w / 13)), align: 'center', wordWrap: { width: w * 0.8 } }).setOrigin(0.5, 0);
  if (title.height > w / 8) title.setFontSize(Math.round(w / 16));
  c.add(title);
  let yy = ty + title.height + 6;
  if (o.subtitle) {
    const sub = scene.add.text(0, yy, o.subtitle, { ...textStyle(Math.round(w / 17), '#d9c7a0'), align: 'center', wordWrap: { width: w * 0.8 } }).setOrigin(0.5, 0);
    c.add(sub);
    yy += sub.height + 8;
  }
  if (o.lines?.length) {
    c.add(scene.add.text(0, yy, o.lines.join('\n'), {
      ...textStyle(Math.round(w / 17)), align: 'center', lineSpacing: 3, wordWrap: { width: w * 0.8 },
    }).setOrigin(0.5, 0));
  }
  if (o.highlight) {
    const g = scene.add.graphics();
    g.lineStyle(6, 0xffe08a, 1).strokeRoundedRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 18);
    c.addAt(g, 0);
  }
  c.setSize(w, h);
  if (o.disabled) c.setAlpha(0.45);
  if (o.onClick && !o.disabled) {
    c.setInteractive({ useHandCursor: true });
    c.on('pointerover', () => { scene.tweens.add({ targets: c, scale: 1.05, duration: 120 }); playSfx(scene, 'ui_hover'); });
    c.on('pointerout', () => scene.tweens.add({ targets: c, scale: 1, duration: 120 }));
    c.on('pointerup', () => { playSfx(scene, 'ui_click'); o.onClick!(); });
  }
  return c;
}

/** Icon + value pair, e.g. gold or attack. */
export function stat(scene: Phaser.Scene, x: number, y: number, icon: string, value: string, size = 26): Phaser.GameObjects.Container {
  const i = scene.add.image(0, 0, icon);
  i.setScale((size * 1.4) / Math.max(i.width, i.height));
  const tx = scene.add.text(size * 0.95, 0, value, textStyle(size, COLOR.light, true)).setOrigin(0, 0.5);
  return scene.add.container(x, y, [i, tx]);
}

/** Small icon button (plus/minus). */
export function iconButton(scene: Phaser.Scene, x: number, y: number, key: string, size: number, onClick: () => void): Phaser.GameObjects.Image {
  const b = scene.add.image(x, y, key).setInteractive({ useHandCursor: true });
  b.setScale(size / b.width);
  const base = b.scale;
  b.on('pointerover', () => b.setScale(base * 1.1));
  b.on('pointerout', () => b.setScale(base));
  b.on('pointerup', () => { playSfx(scene, 'ui_click'); onClick(); });
  return b;
}
