import Phaser from 'phaser';
import { t } from '../core/i18n';
import { effectParts, perkIconKey, perkIconPath, PERKS, type PerkDef } from '../run/perks';
import { card, textStyle } from './widgets';
import { FONT_BODY } from '../core/theme';

export const RARITY_COLOR: Record<string, string> = { common: '#d9c7a0', rare: '#7ec8ff', legendary: '#ffb347', cursed: '#c77dff' };

/** Values that read better with a sign in front (+15 % damage). */
const UNSIGNED = new Set(['eff.splitShot', 'eff.regen', 'eff.lifesteal', 'eff.poison', 'eff.cooldown', 'eff.thorns']);

export function perkLines(p: PerkDef): string[] {
  return effectParts(p).map(({ key, v }) => {
    let val = key === 'eff.taken' ? -v : v;   // "taken" is stored as reduction
    const shown = UNSIGNED.has(key) ? String(Math.abs(val)) : `${val > 0 ? '+' : val < 0 ? '−' : ''}${Math.abs(val)}`;
    void (val = 0);
    return t(key, { v: shown });
  });
}

export function rarityLabel(p: PerkDef): string {
  const base = p.cursed ? `${t('rarity.cursed')} · ${t(`rarity.${p.rarity}`)}` : t(`rarity.${p.rarity}`);
  if (p.boss) return t('rarity.boss');
  return p.heroes ? `${t('rarity.hero')} · ${base}` : base;
}

/** Colour of the kind label on reward cards: what a card is at a glance (v0.18.1). */
export const KIND_COLOR: Record<string, number> = { artifact: 0x6a3fa0, relic: 0xa0521c, talent: 0x2f5f9a, item: 0x3f6f35 };

export function loadPerkIcons(scene: Phaser.Scene, perks: PerkDef[] = PERKS): void {
  for (const p of perks) if (!scene.textures.exists(perkIconKey(p))) scene.load.image(perkIconKey(p), `assets/${perkIconPath(p)}`);
}

export function perkCard(scene: Phaser.Scene, x: number, y: number, p: PerkDef, onClick: () => void, w = 300): Phaser.GameObjects.Container {
  return card(scene, x, y, {
    w, h: 520, portrait: perkIconKey(p), title: t(`perk.${p.id}`), subtitle: rarityLabel(p),
    tag: t(p.boss ? 'kind.relic' : `kind.${p.kind}`), tagColor: KIND_COLOR[p.boss ? 'relic' : p.kind],
    subtitleColor: RARITY_COLOR[p.cursed ? 'cursed' : p.rarity], lines: perkLines(p),
    lineSize: perkLines(p).join(' ').length > 70 ? 19 : 22, onClick,
  });
}

/** Simple hover tooltip (title + text) for any interactive object. */
export function tooltip(scene: Phaser.Scene, obj: Phaser.GameObjects.GameObject & { x: number; y: number }, title: string, lines: string[]): void {
  let tip: Phaser.GameObjects.Container | null = null;
  obj.on('pointerover', (p: Phaser.Input.Pointer) => {
    tip?.destroy();
    const tt = scene.add.text(0, 0, title, { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: '#f3d48a' });
    const tx = scene.add.text(0, tt.height + 4, lines.join('\n'), { ...textStyle(19, '#efe3c8'), wordWrap: { width: 360 } });
    const w = Math.max(tt.width, tx.width) + 24, h = tt.height + tx.height + 22;
    const bg = scene.add.graphics();
    bg.fillStyle(0x140d08, 0.95).fillRoundedRect(-12, -10, w, h, 10).lineStyle(2, 0x8a6a2b, 1).strokeRoundedRect(-12, -10, w, h, 10);
    tip = scene.add.container(0, 0, [bg, tt, tx]).setDepth(9500).setScrollFactor(0, 0, true);
    const px = Math.min(p.x + 18, scene.scale.width - w - 10);
    const py = Math.min(p.y + 18, scene.scale.height - h - 10);
    tip.setPosition(px, py);
  });
  obj.on('pointerout', () => { tip?.destroy(); tip = null; });
  obj.on('destroy', () => { tip?.destroy(); tip = null; });
}
