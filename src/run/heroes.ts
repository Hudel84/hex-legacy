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
  mods?: import('../battle/mods').ModPatch;   // the hero's own battle bonus
  runGold?: number;  // extra gold from fights (raid master)
}

export const HEROES: HeroDef[] = [
  { id: 'human_hero_knight_commander', faction: 'human', atk: 1, def: 1, leadership: 122,
    startArmy: ['human_t1_spearman', 'human_t2_crossbowman'], bonus: 'heroBonus.knight',
    power: 1, knowledge: 1, spells: ['blessing', 'haste'] },
  { id: 'human_hero_guard_captain', faction: 'human', atk: 2, def: 2, leadership: 100,
    startArmy: ['human_t1_spearman', 'human_t3_swordsman'], bonus: 'heroBonus.captain',
    power: 1, knowledge: 2, spells: ['divineShield', 'slow'] },
  { id: 'human_hero_priestess_of_light', faction: 'human', atk: 1, def: 2, leadership: 104,
    startArmy: ['human_t2_crossbowman', 'human_t4_cleric'], bonus: 'heroBonus.priestess',
    power: 2, knowledge: 2, spells: ['holyHeal', 'smite', 'blessing'] },
  { id: 'undead_hero_death_lord', faction: 'undead', atk: 1, def: 2, leadership: 106,
    startArmy: ['undead_t1_skeleton', 'undead_t2_zombie'], bonus: 'heroBonus.deathLord',
    power: 1, knowledge: 2, spells: ['raiseDead', 'stoneSkin'] },
  { id: 'undead_hero_necromancer', faction: 'undead', atk: 1, def: 1, leadership: 104,
    startArmy: ['undead_t1_skeleton', 'undead_t3_ghost'], bonus: 'heroBonus.necromancer',
    power: 2, knowledge: 2, spells: ['lifeDrain', 'curseOfWeakness', 'fear'] },
  { id: 'undead_hero_grave_robber', faction: 'undead', atk: 2, def: 1, leadership: 128,
    startArmy: ['undead_t2_zombie', 'undead_t3_ghost'], bonus: 'heroBonus.graveRobber',
    power: 1, knowledge: 2, spells: ['confusion', 'quicksand'] },
  { id: 'elf_hero_ranger_leader', faction: 'elf', atk: 2, def: 1, leadership: 112, startArmy: ['elf_t1_scout', 'elf_t2_archer'],
    bonus: 'heroBonus.rangerLeader', power: 1, knowledge: 1, spells: ['entanglingRoots', 'blessing'], mods: { shots: 2, ranged: 0.05 } },
  { id: 'elf_hero_druid', faction: 'elf', atk: 1, def: 1, leadership: 116, startArmy: ['elf_t2_archer', 'elf_t4_dryad'],
    bonus: 'heroBonus.druid', power: 2, knowledge: 2, spells: ['regrowth', 'entanglingRoots', 'poisonSpores'] },
  { id: 'elf_hero_shadow_pathfinder', faction: 'elf', atk: 2, def: 1, leadership: 104, startArmy: ['elf_t1_scout', 'elf_t3_forest_warden'],
    bonus: 'heroBonus.pathfinder', power: 1, knowledge: 2, spells: ['thornArmor', 'smite'], mods: { round1Ini: 4 } },
  { id: 'dwarf_hero_thane', faction: 'dwarf', atk: 1, def: 2, leadership: 106, startArmy: ['dwarf_t1_miner', 'dwarf_t2_hammerer'],
    bonus: 'heroBonus.thane', power: 1, knowledge: 1, spells: ['stoneSkin', 'bloodRage'], mods: { taken: 0.05 } },
  { id: 'dwarf_hero_runesmith', faction: 'dwarf', atk: 1, def: 2, leadership: 104, startArmy: ['dwarf_t2_hammerer', 'dwarf_t3_crossbow_veteran'],
    bonus: 'heroBonus.runesmith', power: 2, knowledge: 2, spells: ['stoneSkin', 'rockSpike', 'inferno'] },
  { id: 'dwarf_hero_sapper_master', faction: 'dwarf', atk: 2, def: 2, leadership: 98, startArmy: ['dwarf_t1_miner', 'dwarf_t3_crossbow_veteran'],
    bonus: 'heroBonus.sapper', power: 1, knowledge: 2, spells: ['quicksand', 'rockSpike'], mods: { startShield: 2, thorns: 0.05 } },
  { id: 'orc_hero_warchief', faction: 'orc', atk: 2, def: 0, leadership: 112, startArmy: ['orc_t1_grunt', 'orc_t2_axe_thrower'],
    bonus: 'heroBonus.warchief', power: 1, knowledge: 1, spells: ['haste', 'entanglingRoots'], mods: { melee: 0.05 } },
  { id: 'orc_hero_shaman', faction: 'orc', atk: 1, def: 1, leadership: 100, startArmy: ['orc_t1_grunt', 'orc_t4_shaman_adept'],
    bonus: 'heroBonus.shaman', power: 2, knowledge: 2, spells: ['lightningBolt', 'haste', 'regrowth'] },
  { id: 'orc_hero_raid_master', faction: 'orc', atk: 1, def: 1, leadership: 104, startArmy: ['orc_t2_axe_thrower', 'orc_t3_wolf_rider'],
    bonus: 'heroBonus.raidMaster', power: 1, knowledge: 2, spells: ['slow', 'thornArmor'], runGold: 0.3 },
  { id: 'demon_hero_pit_lord', faction: 'demon', atk: 2, def: 1, leadership: 112, startArmy: ['demon_t1_imp', 'demon_t2_hellhound'],
    bonus: 'heroBonus.pitLord', power: 1, knowledge: 1, spells: ['bloodRage', 'curseOfWeakness'], mods: { ini: 1 } },
  { id: 'demon_hero_warlock', faction: 'demon', atk: 1, def: 1, leadership: 98, startArmy: ['demon_t1_imp', 'demon_t3_succubus'],
    bonus: 'heroBonus.warlock', power: 2, knowledge: 2, spells: ['fireball', 'lifeDrain', 'inferno'] },
  { id: 'demon_hero_pact_maker', faction: 'demon', atk: 2, def: 2, leadership: 98, startArmy: ['demon_t2_hellhound', 'demon_t3_succubus'],
    bonus: 'heroBonus.pactMaker', power: 1, knowledge: 2, spells: ['bloodRage', 'fear'], mods: { dmg: 0.08, taken: -0.05 } },
];

export const FACTIONS = ['human', 'undead', 'elf', 'dwarf', 'orc', 'demon'] as const;
export const heroesOf = (faction: string): HeroDef[] => HEROES.filter((h) => h.faction === faction);

export const heroById = (id: string): HeroDef => HEROES.find((h) => h.id === id) ?? HEROES[0];
