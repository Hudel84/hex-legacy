// Hero magic (GDD 3.9 / 5.5 / 17.4): six schools, every spell has a tier T1-T3 (access) and a level 1-3 (strength).
// This file holds the data; the effects live in Battle.cast (engine.ts) so they can use the battle rules.
import type { Faction } from './types';

export type School = 'light' | 'nature' | 'earth' | 'storm' | 'dark' | 'fire';
export const SCHOOLS: School[] = ['light', 'nature', 'earth', 'storm', 'dark', 'fire'];
export type Tier = 1 | 2 | 3;

/** Damage element: decides resistances (demons resist fire, undead resist death, holy hurts undead and demons). */
export type Element = 'holy' | 'death' | 'nature' | 'earth' | 'fire' | 'lightning';

/** enemy/ally = one stack; area = one enemy stack and every enemy next to it; massEnemy/massAlly = no target. */
export type SpellTarget = 'enemy' | 'ally' | 'area' | 'massEnemy' | 'massAlly';
/** Spells that are cast without choosing a target. */
export const noTarget = (t: SpellTarget | string): boolean => t === 'massEnemy' || t === 'massAlly';

export interface SpellDef {
  id: string;
  school: School;
  tier: Tier;
  icon: string;          // icons/spells/icon_spell_<icon>.webp
  cost: number;          // mana
  target: SpellTarget;
  element?: Element;     // damage spells
}

export interface SpellSlot { id: string; level: number; }

const S = (id: string, school: School, tier: Tier, icon: string, cost: number, target: SpellTarget, element?: Element): SpellDef =>
  ({ id, school, tier, icon, cost, target, element });

export const SPELLS: Record<string, SpellDef> = Object.fromEntries([
  // Light: healing, holy damage, protection
  S('holyHeal', 'light', 1, 'holy_heal', 6, 'ally'),
  S('smite', 'light', 1, 'smite', 6, 'enemy', 'holy'),
  S('blessing', 'light', 1, 'blessing', 5, 'ally'),
  S('divineShield', 'light', 2, 'divine_shield', 6, 'ally'),
  S('radiantBurst', 'light', 2, 'radiant_burst', 10, 'area', 'holy'),
  S('resurrection', 'light', 3, 'resurrection', 12, 'ally'),
  // Storm: tempo and lightning
  S('haste', 'storm', 1, 'haste', 5, 'ally'),
  S('slow', 'storm', 1, 'slow', 6, 'enemy'),
  S('lightningBolt', 'storm', 1, 'lightning_bolt', 8, 'enemy', 'lightning'),
  S('chainLightning', 'storm', 2, 'chain_lightning', 12, 'enemy', 'lightning'),
  S('battleFocus', 'storm', 2, 'battle_focus', 5, 'ally'),
  S('thunderstorm', 'storm', 3, 'thunderstorm', 16, 'massEnemy', 'lightning'),
  // Dark: curses, fear, life drain, the dead
  S('curseOfWeakness', 'dark', 1, 'curse_of_weakness', 5, 'enemy'),
  S('lifeDrain', 'dark', 1, 'life_drain', 8, 'enemy', 'death'),
  S('confusion', 'dark', 1, 'confusion', 6, 'enemy'),
  S('fear', 'dark', 2, 'fear', 8, 'enemy'),
  S('raiseDead', 'dark', 2, 'raise_dead', 9, 'ally'),
  S('deathCloud', 'dark', 2, 'death_cloud', 10, 'area', 'death'),
  S('soulHarvest', 'dark', 3, 'soul_harvest', 16, 'massEnemy', 'death'),
  // Nature: roots, poison, growth, the wild
  S('entanglingRoots', 'nature', 1, 'entangling_roots', 5, 'enemy'),
  S('thornArmor', 'nature', 1, 'thorn_armor', 5, 'ally'),
  S('regrowth', 'nature', 1, 'regrowth', 6, 'ally'),
  S('poisonSpores', 'nature', 2, 'poison_spores', 8, 'area'),
  S('healingRain', 'nature', 2, 'healing_rain', 10, 'massAlly'),
  S('callOfTheWild', 'nature', 3, 'call_of_the_wild', 14, 'massAlly'),
  // Earth: stone skin, rocks, quakes
  S('stoneSkin', 'earth', 1, 'stone_skin', 5, 'ally'),
  S('rockSpike', 'earth', 1, 'rock_spike', 6, 'enemy', 'earth'),
  S('quicksand', 'earth', 1, 'quicksand', 5, 'enemy'),
  S('boulderThrow', 'earth', 2, 'boulder_throw', 10, 'area', 'earth'),
  S('earthquake', 'earth', 3, 'earthquake', 14, 'massEnemy', 'earth'),
  // Fire: burning, rage, explosions
  S('inferno', 'fire', 1, 'inferno', 6, 'enemy'),
  S('bloodRage', 'fire', 1, 'blood_rage', 4, 'ally'),
  S('fireball', 'fire', 2, 'fireball', 10, 'area', 'fire'),
  S('meteor', 'fire', 3, 'meteor', 16, 'area', 'fire'),
].map((s) => [s.id, s]));

export const spellById = (id: string): SpellDef => SPELLS[id];
export const spellsOfSchool = (school: School): SpellDef[] => Object.values(SPELLS).filter((s) => s.school === school);
export const spellIconKey = (id: string): string => `spell_${SPELLS[id].icon}`;
export const spellIconPath = (id: string): string => `icons/spells/icon_spell_${SPELLS[id].icon}.webp`;

/** Every people has two core schools (GDD 5.5/17.4); every school belongs to two peoples. */
export const FACTION_SCHOOLS: Record<Faction, School[]> = {
  human: ['light', 'storm'], elf: ['nature', 'light'], dwarf: ['earth', 'fire'],
  undead: ['dark', 'earth'], orc: ['storm', 'nature'], demon: ['fire', 'dark'], neutral: [],
};

/** Old school ids (saves, texts before v0.15). */
export const OLD_SCHOOL: Record<string, School> = { mind: 'storm', death: 'dark', chaos: 'fire' };


export const MAX_SPELL_LEVEL = 3;
/** Spells of a foreign school can only be raised to level 2. */
export const MAX_FOREIGN_LEVEL = 2;

/** Strength factor of a spell level: 1 / 1.5 / 2. */
export const lvlMul = (level: number): number => 1 + 0.5 * (Math.max(1, Math.min(3, level)) - 1);

/** Numbers shown in descriptions and used by the engine. p = spell power, l = spell level. */
export function spellNumbers(id: string, p: number, l: number): Record<string, number> {
  const m = lvlMul(l);
  const r = (x: number) => Math.round(x);
  switch (id) {
    case 'holyHeal': return { n: r((20 + 8 * p) * m) };
    case 'smite': return { n: r((16 + 7 * p) * m) };
    case 'blessing': return { n: 20 + 10 * (l - 1), t: 3 };
    case 'divineShield': return { n: r((25 + 10 * p) * m), t: 3 };
    case 'resurrection': return { n: r((35 + 12 * p) * m) };
    case 'haste': return { s: l >= 2 ? 2 : 1, i: l + 1, t: 3 };
    case 'slow': return { s: l >= 2 ? 2 : 1, i: l + 1, t: 3 };
    case 'battleFocus': return { n: 1 + 2 * l, t: 3 };
    case 'confusion': return { t: l >= 3 ? 3 : 2 };
    case 'lifeDrain': return { n: r((16 + 6 * p) * m) };
    case 'curseOfWeakness': return { n: 1 + 2 * l, t: 3 };
    case 'fear': return { t: l >= 3 ? 3 : 2 };
    case 'raiseDead': return { n: r((30 + 12 * p) * m) };
    case 'deathCloud': return { n: r((10 + 4 * p) * m) };
    case 'entanglingRoots': return { t: l >= 2 ? 2 : 1, d: l >= 3 ? 3 : 0 };
    case 'regrowth': return { n: r((8 + 4 * p) * m), t: 3 };
    case 'poisonSpores': return { n: r((5 + 2 * p) * m), t: 3 };
    case 'thornArmor': return { n: 10 + 10 * l, t: 3 };
    case 'stoneSkin': return { n: 2 + 2 * l, t: 3 };
    case 'rockSpike': return { n: r((18 + 8 * p) * m) };
    case 'quicksand': return { n: 1 + 2 * l, t: 3 };
    case 'earthquake': return { n: r((12 + 5 * p) * m) };
    case 'radiantBurst': return { n: r((12 + 5 * p) * m) };
    case 'thunderstorm': return { n: r((14 + 6 * p) * m) };
    case 'soulHarvest': return { n: r((11 + 5 * p) * m), h: 50 };
    case 'healingRain': return { n: r((14 + 6 * p) * m) };
    case 'callOfTheWild': return { n: r((40 + 15 * p) * m) };
    case 'boulderThrow': return { n: r((15 + 6 * p) * m) };
    case 'meteor': return { n: r((24 + 10 * p) * m), b: r((5 + 2 * p) * m), t: 2 };
    case 'fireball': return { n: r((12 + 5 * p) * m) };
    case 'lightningBolt': return { n: r((22 + 9 * p) * m) };
    case 'chainLightning': return { n: r((20 + 8 * p) * m) };
    case 'inferno': return { n: r((7 + 3 * p) * m), t: 3 };
    case 'bloodRage': return { n: 20 + 10 * l, t: 3 };
  }
  return {};
}

/** Maximum mana of a hero: 10 per point of knowledge plus flat bonuses. */
export const maxMana = (knowledge: number, bonus = 0): number => Math.max(0, 10 * knowledge + bonus);
