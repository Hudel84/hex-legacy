import Phaser from 'phaser';
import { t } from '../core/i18n';
import { textStyle } from './widgets';
import { perkLines } from './perkUi';
import type { PerkDef } from '../run/perks';
import type { ModPatch } from '../battle/mods';
import {
  ITEMS, CONSUMABLES, SETS, RARITY_COLOR, STAT_KEYS, SCROLL_LEVEL, itemIconKey, itemIconPath, itemStats, setById, sellPrice,
  type ItemInst, type Stats, type ItemRarity,
} from '../run/items';
import { spellIconKey, spellIconPath } from '../battle/spells';
import { spellDesc, spellName } from './spellUi';

const FRAME: Record<ItemRarity, string> = {
  common: 'frame_item_common', uncommon: 'frame_item_uncommon', rare: 'frame_item_rare', epic: 'frame_item_epic',
  legendary: 'frame_item_legendary', set: 'frame_item_set',
};
export const SLOT_PLACEHOLDER: Record<string, string> = {
  head: 'slot_helmet', amulet: 'slot_amulet', chest: 'slot_chest', cloak: 'slot_cloak', weapon: 'slot_weapon',
  offhand: 'slot_offhand', ring1: 'slot_ring', ring2: 'slot_ring', boots: 'slot_boots', belt: 'slot_consumable',
};

/** Queue item icons, rarity frames, slot placeholders and consumable pictures. */
export function loadItemAssets(scene: Phaser.Scene, ids: string[] = Object.keys(ITEMS)): void {
  const img = (k: string, p: string) => { if (!scene.textures.exists(k)) scene.load.image(k, `assets/${p}`); };
  for (const id of ids) if (ITEMS[id]) img(itemIconKey(id), itemIconPath(id));
  for (const f of Object.values(FRAME)) img(f, `ui/frames/${f}.webp`);
  for (const p of new Set(Object.values(SLOT_PLACEHOLDER))) img(p, `ui/slot_placeholders/${p}.webp`);
  img('ach_scroll', 'icons/achievements/ach_scroll.webp');
  for (const c of Object.values(CONSUMABLES)) if (c.spell) img(spellIconKey(c.spell), spellIconPath(c.spell));
}

export const itemName = (id: string): string => t(`item.${id}`);

/** Run `cb` once the icons of these items are loaded (loads missing ones on demand). */
export function withItemTextures(scene: Phaser.Scene, ids: string[], cb: () => void): void {
  const missing = ids.filter((id) => ITEMS[id] && !scene.textures.exists(itemIconKey(id)));
  if (!missing.length) { cb(); return; }
  for (const id of missing) scene.load.image(itemIconKey(id), `assets/${itemIconPath(id)}`);
  scene.load.once(Phaser.Loader.Events.COMPLETE, cb);
  scene.load.start();
}

/** Item picture: rarity frame with the icon inside. */
export function itemIcon(scene: Phaser.Scene, x: number, y: number, inst: ItemInst, size: number): Phaser.GameObjects.Container {
  const d = ITEMS[inst.id];
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x140d08, 0.85).fillRoundedRect(-size / 2, -size / 2, size, size, size * 0.1);
  c.add(bg);
  // the frame art has an opaque centre, so the icon goes on top of it
  const fk = FRAME[d.rarity];
  if (scene.textures.exists(fk)) { const fr = scene.add.image(0, 0, fk); fr.setDisplaySize(size * 1.04, size * 1.1); c.add(fr); }
  const k = itemIconKey(inst.id);
  if (scene.textures.exists(k)) { const ic = scene.add.image(0, size * 0.04, k); ic.setScale(size * 0.66 / Math.max(ic.width, ic.height)); c.add(ic); }
  c.setSize(size, size);
  return c;
}

/** Consumable picture: tinted flask for potions, spell icon with a scroll badge for scrolls. */
export function consumableIcon(scene: Phaser.Scene, x: number, y: number, id: string, size: number): Phaser.GameObjects.Container {
  const cd = CONSUMABLES[id];
  const c = scene.add.container(x, y);
  const bg = scene.add.graphics();
  bg.fillStyle(0x140d08, 0.85).fillRoundedRect(-size / 2, -size / 2, size, size, size * 0.12);
  bg.lineStyle(2, cd.kind === 'scroll' ? 0xe0c070 : 0x9a7a4a, 1).strokeRoundedRect(-size / 2, -size / 2, size, size, size * 0.12);
  c.add(bg);
  if (cd.kind === 'potion') {
    if (scene.textures.exists('slot_consumable')) {
      const p = scene.add.image(0, 0, 'slot_consumable');
      p.setScale(size * 0.82 / Math.max(p.width, p.height)).setTint(cd.tint ?? 0xffffff);
      c.add(p);
    }
  } else if (cd.spell) {
    const k = spellIconKey(cd.spell);
    if (scene.textures.exists(k)) { const ic = scene.add.image(0, 0, k); ic.setScale(size * 0.8 / Math.max(ic.width, ic.height)); c.add(ic); }
    if (scene.textures.exists('ach_scroll')) {
      const b = scene.add.image(size * 0.3, size * 0.3, 'ach_scroll'); b.setScale(size * 0.42 / b.height); c.add(b);
    }
  }
  c.setSize(size, size);
  return c;
}

export function consumableName(id: string): string {
  const c = CONSUMABLES[id];
  return c.spell ? t('consumable.scroll', { spell: spellName(c.spell) }) : t(`consumable.${id}.name`);
}
export function consumableDesc(id: string, power: number): string {
  const c = CONSUMABLES[id];
  return c.spell ? `${spellDesc(c.spell, power, SCROLL_LEVEL)} ${t('consumable.scrollNote', { n: SCROLL_LEVEL })}` : t(`consumable.${id}.desc`);
}

/** Lines for stats and mods (reuses the talent effect texts). */
export function effectLines(stats: Stats, mods: ModPatch = {}): string[] {
  const once: Record<string, number> = {};
  for (const k of STAT_KEYS) if (stats[k]) once[k === 'lead' ? 'lead' : k] = stats[k]!;
  return perkLines({ once, mods } as unknown as PerkDef);
}

export const rarityName = (r: ItemRarity): string => t(`itemRarity.${r}`);

/** Title, colour and description lines of an item for a hero of `faction`. */
export function itemInfo(inst: ItemInst, faction: string, setCount = 0): { title: string; color: string; sub: string; lines: { text: string; color?: string }[] } {
  const d = ITEMS[inst.id];
  const lines: { text: string; color?: string }[] = [];
  const st = itemStats({ ...inst, bonus: undefined }, faction);
  for (const l of effectLines(st, d.mods)) lines.push({ text: l });
  if (inst.bonus) {
    const isStat = (STAT_KEYS as string[]).includes(inst.bonus.key);
    const l = effectLines(isStat ? { [inst.bonus.key]: inst.bonus.v } : {}, isStat ? {} : { [inst.bonus.key]: inst.bonus.v } as ModPatch)[0];
    if (l) lines.push({ text: `✦ ${l}`, color: '#9fe0ff' });
  }
  if (d.faction) {
    const ok = d.faction === faction;
    lines.push({ text: t('item.peopleBonus', { people: t(`faction.${d.faction}`) }), color: ok ? '#9fe39f' : '#a89a80' });
  }
  if (d.set) {
    const s = setById(d.set);
    lines.push({ text: `${t(`set.${s.id}`)} (${setCount}/${s.pieces.length})`, color: RARITY_COLOR.set });
    const b2 = effectLines(s.two.stats ?? {}, s.two.mods).join(', ');
    const b3 = effectLines(s.three.stats ?? {}, s.three.mods).join(', ');
    lines.push({ text: `2: ${b2}`, color: setCount >= 2 ? '#9fe39f' : '#a89a80' });
    lines.push({ text: `3: ${b3}`, color: setCount >= 3 ? '#9fe39f' : '#a89a80' });
  }
  lines.push({ text: t('item.sellValue', { n: sellPrice(inst) }), color: '#c9b896' });
  return { title: itemName(inst.id), color: RARITY_COLOR[d.rarity], sub: `${t(`itemSlot.${d.slot}`)} · ${rarityName(d.rarity)}`, lines };
}

/** Fill a container with an item description block (title, subtitle, lines). Returns the height used. */
export function itemInfoBlock(scene: Phaser.Scene, c: Phaser.GameObjects.Container, x: number, y: number, width: number,
  info: { title: string; color: string; sub: string; lines: { text: string; color?: string }[] }, size = 22): number {
  const tt = scene.add.text(x, y, info.title, textStyle(size + 6, info.color, true));
  const sb = scene.add.text(x, y + tt.height + 2, info.sub, textStyle(size - 3, '#c9b896'));
  c.add([tt, sb]);
  let yy = y + tt.height + sb.height + 10;
  for (const l of info.lines) {
    const tx = scene.add.text(x, yy, l.text, { ...textStyle(size, l.color ?? '#efe3c8'), wordWrap: { width } });
    c.add(tx);
    yy += tx.height + 3;
  }
  return yy - y;
}

export { SETS };
