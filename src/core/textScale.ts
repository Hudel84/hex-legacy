// Larger text for big screens far away (TV, couch). Every text created with scene.add.text goes through
// this: small text grows most, big titles only a little, so layouts keep working.
import Phaser from 'phaser';
import { settings } from './settings';

/** 0 = normal, 1 = large (+20 %), 2 = very large (+40 %). */
export const TEXT_SIZES = [0, 1, 2] as const;

/** New font size in px: grows by 20 % per step, but at most by the amount a 30 px text would grow. */
export function scaledPx(px: number): number {
  const f = 0.2 * (settings.textSize ?? 0);
  return f ? Math.round(px + f * Math.min(px, 30)) : px;
}

function scaleStyle(style?: Phaser.Types.GameObjects.Text.TextStyle): Phaser.Types.GameObjects.Text.TextStyle | undefined {
  if (!style || !settings.textSize) return style;
  const fs = style.fontSize;
  const px = typeof fs === 'number' ? fs : typeof fs === 'string' ? parseFloat(fs) : NaN;
  if (!Number.isFinite(px)) return style;
  return { ...style, fontSize: `${scaledPx(px)}px` };
}

let installed = false;
/** Patch Phaser's text factory once (call before the game starts). */
export function installTextScale(): void {
  if (installed) return;
  installed = true;
  const proto = Phaser.GameObjects.GameObjectFactory.prototype as unknown as {
    text: (x: number, y: number, text: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
  };
  const orig = proto.text;
  proto.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
    return orig.call(this, x, y, text, scaleStyle(style));
  };
}
