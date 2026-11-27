import Phaser from 'phaser';
import { t } from '../core/i18n';
import { ASC_LEVELS } from '../run/ascension';
import { tooltip } from './perkUi';
import { textStyle } from './widgets';

/** "1. Stronger foes: +25 % enemy strength" for every level up to `a`. */
export const ascLines = (a: number): string[] => ASC_LEVELS.filter((k) => k <= a).map((k) => `${k}. ${t(`asc.rule.${k}`)}: ${t(`asc.desc.${k}`)}`);

/** Small "Ascension n" label with all active rules as tooltip (map panel, run end). */
export function ascBadge(scene: Phaser.Scene, x: number, y: number, a: number, size = 22): Phaser.GameObjects.Text {
  const tx = scene.add.text(x, y, t('asc.level', { n: a }), textStyle(size, '#ff9a7a', true)).setOrigin(0.5).setInteractive({ useHandCursor: true });
  tooltip(scene, tx, t('asc.level', { n: a }), [...ascLines(a), '', t('asc.bonus', { n: a * 10 })]);
  return tx;
}
