import type { Faction } from '../battle/types';

export interface HeroDef {
  id: string;
  faction: Faction;
  atk: number;
  def: number;
  leadership: number;
  startArmy: string[];
  bonus: string;   // i18n key of the hero's start bonus text
}

export const HEROES: HeroDef[] = [
  { id: 'human_hero_knight_commander', faction: 'human', atk: 1, def: 1, leadership: 110,
    startArmy: ['human_t1_spearman', 'human_t2_crossbowman'], bonus: 'heroBonus.knight' },
  { id: 'human_hero_guard_captain', faction: 'human', atk: 2, def: 2, leadership: 90,
    startArmy: ['human_t1_spearman', 'human_t3_swordsman'], bonus: 'heroBonus.captain' },
  { id: 'human_hero_priestess_of_light', faction: 'human', atk: 1, def: 2, leadership: 95,
    startArmy: ['human_t2_crossbowman', 'human_t4_cleric'], bonus: 'heroBonus.priestess' },
];

export const heroById = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
