// Passives that work through battle modifiers (v0.14, GDD 17.3): the people passives of humans and elves
// and one own passive for every creature. Effects are SideMods for that stack only; the descriptions
// are generated from the modifiers (ui/perkUi.perkLines), names come from i18n passiveName.<id>.
import { combine, type ModPatch, type SideMods } from './mods';
import type { UnitDef } from './types';

/** People passives as modifiers: humans – Valor (+10 % morale), elves – Keen Eye (+10 % critical chance). */
export const RACE_MODS: Partial<Record<string, ModPatch>> = {
  human: { morale: 0.1 },
  elf: { crit: 0.1 },
};

export const PASSIVE_MODS: Record<string, ModPatch> = {
  vermin: { morale: 0.1, ini: 1 },  // neutral_giant_rat
  ambush: { firstStrike: 0.4 },  // neutral_goblin_raider
  dirtyFighting: { crit: 0.1, critDmg: 0.5 },  // neutral_bandit_thug
  sneakyShots: { crit: 0.15 },  // neutral_kobold_trapper
  quickDraw: { ranged: 0.1, ini: 1 },  // neutral_bandit_archer
  packHunter: { crit: 0.1, morale: 0.1 },  // neutral_dire_wolf
  goringCharge: { firstStrike: 0.3, critDmg: 0.5 },  // neutral_wild_boar
  slimy: { taken: 0.1 },  // neutral_acid_slime
  fanatic: { morale: 0.15 },  // neutral_cultist
  flicker: { ini: 2, morale: 0.1 },  // neutral_will_o_wisps
  scavenger: { executioner: 0.3 },  // neutral_gnoll_hunter
  lurker: { firstStrike: 0.3, ini: 1 },  // neutral_giant_spider, elite_giant_spider
  steelShell: { taken: 0.1 },  // neutral_animated_armor
  arcaneFocus: { crit: 0.1, ranged: 0.1 },  // neutral_hedge_mage
  mauling: { critDmg: 1.0 },  // neutral_cave_bear
  deepRoots: { taken: 0.08, counterDmg: 0.3 },  // neutral_treant
  rallyingCry: { morale: 0.2, crit: 0.1 },  // elite_bandit_captain
  labyrinthFury: { crit: 0.1, critDmg: 1.0 },  // elite_minotaur
  echolocation: { crit: 0.15 },  // neutral_giant_bat
  cutthroat: { crit: 0.1, critDmg: 0.5 },  // neutral_skeleton_pirate
  coldBlooded: { taken: 0.08, counterDmg: 0.2 },  // neutral_lizardman_warrior
  swoop: { firstStrike: 0.3 },  // neutral_harpy
  shrillCry: { morale: 0.15, ini: 1 },  // neutral_harpy_v2
  merryTune: { morale: 0.15 },  // neutral_satyr_piper
  tusks: { critDmg: 0.75 },  // neutral_boar_beastman
  drillmaster: { morale: 0.1, counters: 1 },  // neutral_hobgoblin_captain
  backstab: { crit: 0.2, critDmg: 0.5 },  // neutral_rogue_assassin
  surprise: { firstStrike: 0.6 },  // neutral_mimic
  stoneHide: { taken: 0.1 },  // neutral_stone_gargoyle
  sporeBody: { thorns: 0.15 },  // neutral_myconid_brute
  witchcraft: { executioner: 0.25 },  // neutral_bog_witch
  embalmed: { taken: 0.1 },  // neutral_mummy
  peck: { crit: 0.15 },  // neutral_cockatrice
  stingerCarapace: { taken: 0.08, crit: 0.1 },  // neutral_giant_scorpion
  ringleader: { morale: 0.15, crit: 0.1 },  // neutral_bandit_chieftain
  ferocity: { crit: 0.05, critDmg: 0.75 },  // neutral_owlbear
  bloodMoon: { crit: 0.15, morale: 0.1 },  // neutral_werewolf
  steppeArcher: { ranged: 0.1, crit: 0.1 },  // neutral_centaur
  trollHide: { taken: 0.1 },  // neutral_cave_troll
  serpentStrike: { ini: 2, crit: 0.1 },  // neutral_naga
  thunderRoar: { morale: 0.15 },  // neutral_yeti
  tidalSurge: { counters: 1, counterDmg: 0.2 },  // neutral_water_elemental
  deadlyGaze: { crit: 0.15, critDmg: 0.5 },  // neutral_basilisk
  tailSpikes: { firstStrike: 0.3, crit: 0.1 },  // neutral_manticore
  threeHeads: { counters: 1, crit: 0.1 },  // neutral_chimera
  twoHeads: { crit: 0.1, morale: 0.1 },  // neutral_ettin
  devour: { executioner: 0.3 },  // neutral_sand_wurm
  mossCover: { regen: 0.03 },  // neutral_moss_stone_golem
  darkChampion: { crit: 0.15, morale: 0.1 },  // neutral_black_knight
  crushingBlow: { critDmg: 1.0 },  // neutral_cyclops
  blazingFlight: { ini: 2, morale: 0.1 },  // neutral_phoenix
  wyvernStrike: { crit: 0.15, firstStrike: 0.3 },  // elite_bog_wyvern
  moltenHide: { thorns: 0.2 },  // elite_magma_salamander
  voidHunger: { lifesteal: 0.15 },  // summon_void_spawn
  allSeeingEye: { crit: 0.2 },  // summon_void_eye_tentacle
  steadyAim: { crit: 0.1 },  // human_t2_crossbowman
  skyKnight: { crit: 0.1, morale: 0.05 },  // human_t5_griffin_rider
  natureGrace: { regen: 0.03 },  // elf_t4_dryad
  tunnelFighter: { counterDmg: 0.3 },  // dwarf_t1_miner
  crushingHammer: { critDmg: 0.75 },  // dwarf_t2_hammerer
  veteranEye: { crit: 0.1 },  // dwarf_t3_crossbow_veteran
  bruteForce: { critDmg: 1.0 },  // orc_t5_ogre
  warBlood: { morale: 0.1 },  // orc_t1_grunt
  mischief: { morale: 0.15 },  // demon_t1_imp
  hellPack: { crit: 0.1, morale: 0.1 },  // demon_t2_hellhound
  infernalFocus: { ranged: 0.1, crit: 0.1 },  // demon_t5_fire_lord
};

/** Modifiers a unit brings with it: people passive and modifier passives. */
export function innateMods(d: UnitDef): ModPatch[] {
  const out: ModPatch[] = [];
  const race = RACE_MODS[d.faction];
  if (race) out.push(race);
  for (const p of d.passives ?? []) if (PASSIVE_MODS[p]) out.push(PASSIVE_MODS[p]);
  return out;
}

/** All modifiers of one unit outside of battle (side modifiers + upgrades + innate), e.g. for the unit card. */
export function unitMods(d: UnitDef, side: ModPatch = {}): SideMods {
  return combine(side, d.mods ?? {}, ...innateMods(d));
}
