// Hero magic (GDD 3.9 / 5.5): six schools, spells with levels 1-3, mana per battle.
// This file holds the data; the effects live in Battle.cast (engine.ts) so they can use the battle rules.
import type { Faction } from './types';

export type School = 'light' | 'mind' | 'death' | 'nature' | 'earth' | 'chaos';
export const SCHOOLS: School[] = ['light', 'mind', 'death', 'nature', 'earth', 'chaos'];

/** Damage element: decides resistances (demons resist fire, undead resist death, holy hurts undead and demons). */
export type Element = 'holy' | 'death' | 'nature' | 'earth' | 'fire' | 'lightning';

/** enemy/ally = one stack; area = one enemy stack and every enemy next to it; mass = all enemies, no target. */
export type SpellTarget = 'enemy' | 'ally' | 'area' | 'massEnemy';

export interface SpellDef {
  id: string;
  school: School;
  icon: string;          // icons/spells/icon_spell_<icon>.webp
  cost: number;          // mana
  target: SpellTarget;
  element?: Element;     // damage spells
}

export interface SpellSlot { id: string; level: number; }

const S = (id: string, school: School, icon: string, cost: number, target: SpellTarget, element?: Element): SpellDef =>
  ({ id, school, icon, cost, target, element });

export const SPELLS: Record<string, SpellDef> = Object.fromEntries([
  // Light: healing, holy damage, protection
  S('holyHeal', 'light', 'holy_heal', 6, 'ally'),
  S('smite', 'light', 'smite', 6, 'enemy', 'holy'),
  S('blessing', 'light', 'blessing', 5, 'ally'),
  S('divineShield', 'light', 'divine_shield', 6, 'ally'),
  S('resurrection', 'light', 'resurrection', 12, 'ally'),
  // Mind: tempo, focus and confusion
  S('haste', 'mind', 'haste', 5, 'ally'),
  S('slow', 'mind', 'slow', 6, 'enemy'),
  S('battleFocus', 'mind', 'battle_focus', 5, 'ally'),
  S('confusion', 'mind', 'confusion', 6, 'enemy'),
  // Death: curses and life drain
  S('lifeDrain', 'death', 'life_drain', 8, 'enemy', 'death'),
  S('curseOfWeakness', 'death', 'curse_of_weakness', 5, 'enemy'),
  S('fear', 'death', 'fear', 8, 'enemy'),
  S('raiseDead', 'death', 'raise_dead', 9, 'ally'),
  S('deathCloud', 'death', 'death_cloud', 10, 'area', 'death'),
  // Nature: roots, poison, regrowth
  S('entanglingRoots', 'nature', 'entangling_roots', 5, 'enemy'),
  S('regrowth', 'nature', 'regrowth', 6, 'ally'),
  S('poisonSpores', 'nature', 'poison_spores', 8, 'area'),
  S('thornArmor', 'nature', 'thorn_armor', 5, 'ally'),
  // Earth: stone skin, rocks, quakes
  S('stoneSkin', 'earth', 'stone_skin', 5, 'ally'),
  S('rockSpike', 'earth', 'rock_spike', 6, 'enemy', 'earth'),
  S('quicksand', 'earth', 'quicksand', 5, 'enemy'),
  S('earthquake', 'earth', 'earthquake', 12, 'massEnemy', 'earth'),
  // Chaos: fire, lightning, blood
  S('fireball', 'chaos', 'fireball', 10, 'area', 'fire'),
  S('lightningBolt', 'chaos', 'lightning_bolt', 8, 'enemy', 'lightning'),
  S('chainLightning', 'chaos', 'chain_lightning', 12, 'enemy', 'lightning'),
  S('inferno', 'chaos', 'inferno', 6, 'enemy'),
  S('bloodRage', 'chaos', 'blood_rage', 4, 'ally'),
].map((s) => [s.id, s]));

export const spellById = (id: string): SpellDef => SPELLS[id];
export const spellsOfSchool = (school: School): SpellDef[] => Object.values(SPELLS).filter((s) => s.school === school);
export const spellIconKey = (id: string): string => `spell_${SPELLS[id].icon}`;
export const spellIconPath = (id: string): string => `icons/spells/icon_spell_${SPELLS[id].icon}.webp`;

/** Every people has two core schools (GDD 5.5). */
export const FACTION_SCHOOLS: Record<Faction, School[]> = {
  human: ['light', 'mind'], elf: ['nature', 'light'], dwarf: ['earth', 'mind'],
  undead: ['death', 'mind'], orc: ['chaos', 'nature'], demon: ['chaos', 'death'], neutral: [],
};

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
    case 'earthquake': return { n: r((7 + 3 * p) * m) };
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
