import type { Faction } from '../battle/types';

export interface HeroDef {
  id: string;
  faction: Faction;
  atk: number;
  def: number;
  leadership: number;
  startArmy: string[];
  bonus: string;   // i18n key of the hero's start bonus text
  power: number;   // spell power (Zauberkraft)
  knowledge: number; // 10 mana per point (Wissen)
  spells: string[];  // start spells (level 1) from the people's two schools
}

export const HEROES: HeroDef[] = [
  { id: 'human_hero_knight_commander', faction: 'human', atk: 1, def: 1, leadership: 110,
    startArmy: ['human_t1_spearman', 'human_t2_crossbowman'], bonus: 'heroBonus.knight',
    power: 1, knowledge: 1, spells: ['blessing', 'haste'] },
  { id: 'human_hero_guard_captain', faction: 'human', atk: 2, def: 2, leadership: 108,
    startArmy: ['human_t1_spearman', 'human_t3_swordsman'], bonus: 'heroBonus.captain',
    power: 1, knowledge: 2, spells: ['divineShield', 'slow'] },
  { id: 'human_hero_priestess_of_light', faction: 'human', atk: 1, def: 2, leadership: 104,
    startArmy: ['human_t2_crossbowman', 'human_t4_cleric'], bonus: 'heroBonus.priestess',
    power: 2, knowledge: 2, spells: ['holyHeal', 'smite', 'blessing'] },
  { id: 'undead_hero_death_lord', faction: 'undead', atk: 1, def: 2, leadership: 106,
    startArmy: ['undead_t1_skeleton', 'undead_t2_zombie'], bonus: 'heroBonus.deathLord',
    power: 1, knowledge: 2, spells: ['raiseDead', 'battleFocus'] },
  { id: 'undead_hero_necromancer', faction: 'undead', atk: 1, def: 1, leadership: 104,
    startArmy: ['undead_t1_skeleton', 'undead_t3_ghost'], bonus: 'heroBonus.necromancer',
    power: 2, knowledge: 2, spells: ['lifeDrain', 'curseOfWeakness', 'fear'] },
  { id: 'undead_hero_grave_robber', faction: 'undead', atk: 2, def: 1, leadership: 110,
    startArmy: ['undead_t2_zombie', 'undead_t3_ghost'], bonus: 'heroBonus.graveRobber',
    power: 1, knowledge: 2, spells: ['confusion', 'slow'] },
];

export const FACTIONS = ['human', 'undead'] as const;
export const heroesOf = (faction: string): HeroDef[] => HEROES.filter((h) => h.faction === faction);

export const heroById = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
