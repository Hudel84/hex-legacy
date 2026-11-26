import Phaser from 'phaser';
import { t } from '../core/i18n';
import { SPELLS, spellIconKey, spellIconPath, spellNumbers, type SpellSlot } from '../battle/spells';
import { FONT_BODY } from '../core/theme';
import { card } from './widgets';

export const SCHOOL_COLOR: Record<string, string> = {
  light: '#ffe08a', nature: '#9fe39f', earth: '#e0b07a', storm: '#9fc8ff', dark: '#c9a8ff', fire: '#ff8a6a',
  mind: '#9fc8ff', death: '#c9a8ff', chaos: '#ff8a6a', // old ids
};

export function loadSpellIcons(scene: Phaser.Scene, ids: string[] = Object.keys(SPELLS)): void {
  for (const id of ids) if (SPELLS[id] && !scene.textures.exists(spellIconKey(id))) scene.load.image(spellIconKey(id), `assets/${spellIconPath(id)}`);
  if (!scene.textures.exists('icon_mana')) scene.load.image('icon_mana', 'assets/icons/resources/icon_stat_mana.webp');
  if (!scene.textures.exists('icon_power')) scene.load.image('icon_power', 'assets/icons/stats/icon_stat_spellpower.webp');
  if (!scene.textures.exists('icon_knowledge')) scene.load.image('icon_knowledge', 'assets/icons/stats/icon_stat_knowledge.webp');
}

export const spellName = (id: string): string => t(`spell.${id}.name`);
/** "Fire · T2 · 10 mana" */
export const schoolLine = (id: string): string =>
  `${t(`school.${SPELLS[id].school}`)} · T${SPELLS[id].tier} · ${t('spell.cost', { n: SPELLS[id].cost })}`;
export const levelStars = (level: number, max = 3): string => '★'.repeat(level) + '☆'.repeat(Math.max(0, max - level));

/** Effect text of a spell for the given spell power and level (numbers filled in). */
export function spellDesc(id: string, power: number, level: number): string {
  const n = spellNumbers(id, power, level);
  let s = t(`spell.${id}.desc`, n);
  if (id === 'holyHeal' && level >= 2) s += ' ' + t('spell.holyHeal.cleanse');
  if (id === 'entanglingRoots' && n.d) s += ' ' + t('spell.entanglingRoots.extra', n);
  return s;
}

/** One line for lists: "Fireball ★★☆ (10 mana)". */
export function spellTitle(slot: SpellSlot, max = 3): string {
  return `${spellName(slot.id)} ${levelStars(slot.level, max)}`;
}

/** Spell description incl. school and mana cost, for tooltips. */
export function spellTooltipLines(id: string, power: number, level: number): string[] {
  const sp = SPELLS[id];
  return [schoolLine(id), spellDesc(id, power, level)];
}

/** Square spell icon with a school-coloured frame. */
export function spellIcon(scene: Phaser.Scene, x: number, y: number, id: string, size: number): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const col = Phaser.Display.Color.HexStringToColor(SCHOOL_COLOR[SPELLS[id].school]).color;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.5).fillRoundedRect(-size / 2, -size / 2, size, size, 10);
  g.lineStyle(3, col, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, 10);
  c.add(g);
  const k = spellIconKey(id);
  if (scene.textures.exists(k)) { const ic = scene.add.image(0, 0, k); ic.setScale((size - 8) / Math.max(ic.width, ic.height)); c.add(ic); }
  c.setSize(size, size);
  return c;
}

export function smallText(size: number, color = '#efe3c8'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_BODY, fontSize: `${size}px`, color, stroke: '#000', strokeThickness: 3 };
}

/** Reward card for learning or improving a spell (level-up, treasure). */
export function spellCard(scene: Phaser.Scene, x: number, y: number, kind: 'learn' | 'upgrade', id: string, power: number, newLevel: number,
  onClick: () => void, w = 300): Phaser.GameObjects.Container {
  const sp = SPELLS[id];
  return card(scene, x, y, {
    w, h: 520, portrait: spellIconKey(id), title: spellName(id),
    subtitle: kind === 'learn' ? t('reward.spellLearn') : t('reward.spellUpgrade', { n: newLevel }),
    subtitleColor: SCHOOL_COLOR[sp.school],
    lines: [schoolLine(id), spellDesc(id, power, newLevel)], lineSize: 20, onClick,
  });
}
