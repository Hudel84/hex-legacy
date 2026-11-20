// Equipment (GDD 5.3): items in 9 slots, a small backpack, three belt slots for consumables.
// Items have fixed stats (and sometimes a fixed effect); from "rare" on they roll one random bonus.
// People items give +50 % stats to heroes of their people. Sets give bonuses for 2 and 3 pieces.
import type { ModPatch } from '../battle/mods';
import type { Faction } from '../battle/types';
import type { Rng } from './rng';
import { ITEM_DATA } from './itemData';

export type ItemSlot = 'weapon' | 'offhand' | 'head' | 'chest' | 'cloak' | 'boots' | 'ring' | 'amulet';
/** Places on the hero: rings have two. */
export type EquipSlot = 'head' | 'amulet' | 'chest' | 'cloak' | 'weapon' | 'offhand' | 'ring1' | 'ring2' | 'boots';
export const EQUIP_SLOTS: EquipSlot[] = ['head', 'amulet', 'chest', 'cloak', 'weapon', 'offhand', 'ring1', 'ring2', 'boots'];
export const slotOf = (e: EquipSlot): ItemSlot => (e === 'ring1' || e === 'ring2' ? 'ring' : e);

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'set';
export const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
export const RARITY_COLOR: Record<ItemRarity, string> = {
  common: '#d9c7a0', uncommon: '#8fe08f', rare: '#7ec8ff', epic: '#d08bff', legendary: '#ffb347', set: '#5fe0c0',
};

export type StatKey = 'atk' | 'def' | 'power' | 'knowledge' | 'lead';
export type Stats = Partial<Record<StatKey, number>>;

export interface ItemDef {
  id: string;            // also the icon: icons/equipment/icon_equip_<id>.webp
  slot: ItemSlot;
  rarity: ItemRarity;
  stats: Stats;
  mods?: ModPatch;
  faction?: Faction;
  set?: string;
}

/** A found item: the type plus its random bonus. */
export interface ItemInst { uid: number; id: string; bonus?: { key: string; v: number }; }

// ---------- sets ----------

export interface SetDef { id: string; pieces: string[]; two: { stats?: Stats; mods?: ModPatch }; three: { stats?: Stats; mods?: ModPatch }; }
export const SETS: SetDef[] = [
  { id: 'light', pieces: ['chest_paladin_plate', 'boots_paladin_greaves', 'weapon_holy_hammer'],
    two: { stats: { def: 2 } }, three: { mods: { undeadDmg: 0.2, startShield: 3 } } },
  { id: 'necro', pieces: ['chest_necromancer_robe', 'weapon_bone_scepter', 'offhand_soul_lantern'],
    two: { stats: { power: 2 } }, three: { mods: { spellDmg: 0.2, lifesteal: 0.08 } } },
  { id: 'ranger', pieces: ['head_ranger_hat', 'cloak_ranger', 'boots_ranger'],
    two: { mods: { ini: 1 } }, three: { mods: { ranged: 0.15, shots: 2 } } },
  { id: 'bulwark', pieces: ['head_dwarven_rune_helm', 'chest_dwarven_cuirass', 'offhand_dwarven_tower_shield'],
    two: { stats: { def: 3 } }, three: { mods: { taken: 0.08, thorns: 0.1 } } },
  { id: 'royal', pieces: ['cloak_royal_cape', 'ring_lion_gold', 'head_laurel_circlet'],
    two: { stats: { lead: 20 } }, three: { stats: { atk: 2, def: 2 }, mods: { dmg: 0.05 } } },
  { id: 'archmage', pieces: ['weapon_crystal_staff', 'cloak_starry_wizard', 'head_mage_hood'],
    two: { stats: { knowledge: 2 } }, three: { mods: { spellDmg: 0.15, mana: 10 } } },
];
export const setById = (id: string): SetDef => SETS.find((s) => s.id === id)!;

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(ITEM_DATA.map((d) => {
  const set = SETS.find((s) => s.pieces.includes(d.id));
  return [d.id, set ? { ...d, rarity: 'set' as ItemRarity, set: set.id } : d];
}));
export const itemDef = (id: string): ItemDef => ITEMS[id];
export const itemIconKey = (id: string): string => `item_${id}`;
export const itemIconPath = (id: string): string => `icons/equipment/icon_equip_${id}.webp`;

// ---------- random bonus (rare and better) ----------

/** Pool of random bonuses: value at "rare"; epic ×1.5, legendary ×2 (rounded). Flat stats and battle mods. */
const BONUS_POOL: { key: string; v: number; w: number }[] = [
  { key: 'atk', v: 1, w: 10 }, { key: 'def', v: 1, w: 10 }, { key: 'power', v: 1, w: 8 }, { key: 'knowledge', v: 1, w: 8 },
  { key: 'lead', v: 8, w: 8 }, { key: 'melee', v: 0.06, w: 6 }, { key: 'ranged', v: 0.06, w: 6 }, { key: 'taken', v: 0.04, w: 5 },
  { key: 'hp', v: 0.05, w: 5 }, { key: 'ini', v: 1, w: 3 }, { key: 'spellDmg', v: 0.08, w: 5 }, { key: 'mana', v: 4, w: 5 },
  { key: 'firstStrike', v: 0.1, w: 4 }, { key: 'crit', v: 0.03, w: 3 }, { key: 'counterDmg', v: 0.1, w: 3 },
];
const BONUS_MUL: Partial<Record<ItemRarity, number>> = { rare: 1, epic: 1.5, legendary: 2 };
export const STAT_KEYS: StatKey[] = ['atk', 'def', 'power', 'knowledge', 'lead'];

let uidCounter = Date.now() % 100000;
export function makeItem(id: string, g: Rng): ItemInst {
  const d = ITEMS[id];
  const inst: ItemInst = { uid: ++uidCounter, id };
  const mul = BONUS_MUL[d.rarity];
  if (mul) {
    const total = BONUS_POOL.reduce((a, b) => a + b.w, 0);
    let r = g.next() * total;
    let b = BONUS_POOL[0];
    for (const x of BONUS_POOL) { r -= x.w; if (r <= 0) { b = x; break; } }
    const v = Number.isInteger(b.v) ? Math.max(1, Math.round(b.v * mul)) : Math.round(b.v * mul * 100) / 100;
    inst.bonus = { key: b.key, v };
  }
  return inst;
}

/** Random item; better rarities become more likely on later floors. */
export function rollItem(g: Rng, floor: number, minRarity: ItemRarity = 'common', slot?: ItemSlot): ItemInst {
  const w: Record<string, number> = {
    common: 40 - 2 * floor, uncommon: 30, rare: 18 + floor, epic: 7 + 0.6 * floor, legendary: 2 + 0.3 * floor,
  };
  const minI = RARITIES.indexOf(minRarity === 'set' ? 'rare' : minRarity);
  let rar: ItemRarity = 'common';
  if (g.next() < 0.05 && minI <= 3) rar = 'set';
  else {
    const allowed = RARITIES.filter((_, i) => i >= minI);
    const tot = allowed.reduce((a, k) => a + Math.max(1, w[k]), 0);
    let r = g.next() * tot;
    rar = allowed[allowed.length - 1];
    for (const k of allowed) { r -= Math.max(1, w[k]); if (r <= 0) { rar = k; break; } }
  }
  let pool = Object.values(ITEMS).filter((d) => d.rarity === rar && (!slot || d.slot === slot));
  if (!pool.length) pool = Object.values(ITEMS).filter((d) => !slot || d.slot === slot);
  return makeItem(g.pick(pool).id, g);
}

export const ITEM_PRICE: Record<ItemRarity, number> = { common: 40, uncommon: 60, rare: 90, epic: 140, legendary: 220, set: 130 };
export const sellPrice = (inst: ItemInst): number => Math.round(ITEM_PRICE[ITEMS[inst.id].rarity] * 0.4);

// ---------- what an item gives ----------

/** Stats of one item for a hero of `faction` (people items +50 % stats) incl. its random bonus. */
export function itemStats(inst: ItemInst, faction: string): Stats {
  const d = ITEMS[inst.id];
  const boost = d.faction && d.faction === faction ? 1.5 : 1;
  const out: Stats = {};
  for (const [k, v] of Object.entries(d.stats) as [StatKey, number][]) out[k] = Math.ceil(v * boost);
  if (inst.bonus && (STAT_KEYS as string[]).includes(inst.bonus.key)) {
    const k = inst.bonus.key as StatKey;
    out[k] = (out[k] ?? 0) + inst.bonus.v;
  }
  return out;
}

/** Modifiers that count in whole steps (initiative, shots …); the others are shares. */
const FLAT_MODS = ['ini', 'speed', 'shots', 'counters', 'startShield', 'cooldown', 'round1Ini', 'mana', 'frost', 'markShots', 'furyMax'];

/** Battle mods of one item for a hero of `faction` (people items: +50 % here too) incl. its random bonus. */
export function itemMods(inst: ItemInst, faction = ''): ModPatch {
  const d = ITEMS[inst.id];
  const boost = d.faction && d.faction === faction ? 1.5 : 1;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.mods ?? {}) as [string, number][]) {
    out[k] = boost === 1 ? v : FLAT_MODS.includes(k) ? Math.ceil(v * boost) : Math.round(v * boost * 1000) / 1000;
  }
  if (inst.bonus && !(STAT_KEYS as string[]).includes(inst.bonus.key)) out[inst.bonus.key] = (out[inst.bonus.key] ?? 0) + inst.bonus.v;
  return out as ModPatch;
}

/** Number of equipped pieces per set. */
export function setCounts(equipped: ItemInst[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of equipped) { const s = ITEMS[i.id].set; if (s) out[s] = (out[s] ?? 0) + 1; }
  return out;
}

/** Active set bonuses (2 and 3 pieces). */
export function setBonuses(equipped: ItemInst[]): { stats: Stats; mods: ModPatch }[] {
  const out: { stats: Stats; mods: ModPatch }[] = [];
  for (const [id, n] of Object.entries(setCounts(equipped))) {
    const s = setById(id);
    if (n >= 2) out.push({ stats: s.two.stats ?? {}, mods: s.two.mods ?? {} });
    if (n >= 3) out.push({ stats: s.three.stats ?? {}, mods: s.three.mods ?? {} });
  }
  return out;
}

export function addStats(a: Stats, b: Stats): Stats {
  const out: Stats = { ...a };
  for (const [k, v] of Object.entries(b) as [StatKey, number][]) out[k] = (out[k] ?? 0) + v;
  return out;
}

// ---------- consumables ----------

export interface ConsumableDef { id: string; kind: 'potion' | 'scroll'; spell?: string; tint?: number; price: number; target: 'ally' | 'enemy' | 'area' | 'massEnemy' | 'none'; }
export const CONSUMABLES: Record<string, ConsumableDef> = Object.fromEntries(([
  { id: 'potionHeal', kind: 'potion', tint: 0xff6a5a, price: 35, target: 'ally' },
  { id: 'potionMana', kind: 'potion', tint: 0x6aa8ff, price: 30, target: 'none' },
  { id: 'potionStrength', kind: 'potion', tint: 0xffa040, price: 35, target: 'ally' },
  { id: 'potionStone', kind: 'potion', tint: 0xb8a070, price: 30, target: 'ally' },
  { id: 'potionHaste', kind: 'potion', tint: 0x7ee07e, price: 30, target: 'ally' },
  { id: 'scroll_fireball', kind: 'scroll', spell: 'fireball', price: 45, target: 'area' },
  { id: 'scroll_lightningBolt', kind: 'scroll', spell: 'lightningBolt', price: 45, target: 'enemy' },
  { id: 'scroll_smite', kind: 'scroll', spell: 'smite', price: 40, target: 'enemy' },
  { id: 'scroll_slow', kind: 'scroll', spell: 'slow', price: 35, target: 'enemy' },
  { id: 'scroll_earthquake', kind: 'scroll', spell: 'earthquake', price: 50, target: 'massEnemy' },
  { id: 'scroll_curseOfWeakness', kind: 'scroll', spell: 'curseOfWeakness', price: 35, target: 'enemy' },
] as ConsumableDef[]).map((c) => [c.id, c]));
/** Scrolls cast their spell at this level, with the hero's spell power, without mana. */
export const SCROLL_LEVEL = 2;
export const BELT_SIZE = 3;
export const BAG_SIZE = 4;
export const rollConsumable = (g: Rng): string => g.pick(Object.keys(CONSUMABLES));
