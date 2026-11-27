import { UNITS } from '../data/units';
import type { BattleSetup } from '../battle/engine';
import type { UnitDef } from '../battle/types';
import { Battle } from '../battle/engine';
import type { MapNode } from './mapgen';
import { run, rng, commitRng, count, upgradedDef, playerMods, perkFactor, heroTotals, type RunState, summonFor } from './state';
import { heroById } from './heroes';
import { ASC, ascOf } from './ascension';
import { combine } from '../battle/mods';
import { bonus } from '../meta/meta';

// Themed enemy groups for act 1. Units are picked from one group per fight.
const GROUPS: Record<string, string[]> = {
  bandits: ['neutral_bandit_thug', 'neutral_bandit_archer', 'neutral_dire_wolf', 'neutral_hedge_mage'],
  wilds: ['neutral_giant_rat', 'neutral_dire_wolf', 'neutral_wild_boar', 'neutral_giant_spider', 'neutral_cave_bear'],
  goblins: ['neutral_goblin_raider', 'neutral_kobold_trapper', 'neutral_gnoll_hunter', 'neutral_wild_boar'],
  cult: ['neutral_cultist', 'neutral_bandit_thug', 'neutral_animated_armor', 'neutral_hedge_mage'],
  forest: ['neutral_will_o_wisps', 'neutral_acid_slime', 'neutral_giant_spider', 'neutral_treant'],
  undead: ['undead_t1_skeleton', 'undead_t2_zombie', 'undead_t3_ghost', 'undead_t4_vampire'],
};
// Acts 2 and 3: every biome has its own creatures (GDD 6.4)
const BIOME_GROUPS: Record<string, string[][]> = {
  swamp_ruins: [
    ['elf_t2_archer', 'elf_t3_forest_warden', 'elf_t4_dryad', 'elf_t5_unicorn_rider', 'neutral_will_o_wisps'],
    ['neutral_lizardman_warrior', 'neutral_naga', 'neutral_bog_witch', 'neutral_basilisk'],
    ['neutral_myconid_brute', 'neutral_acid_slime', 'neutral_will_o_wisps', 'neutral_cockatrice', 'neutral_giant_spider'],
  ],
  graveyard: [
    ['undead_t1_skeleton', 'undead_t2_zombie', 'undead_t3_ghost', 'undead_t4_vampire', 'undead_t5_lich'],
    ['neutral_mummy', 'neutral_skeleton_pirate', 'neutral_banshee', 'neutral_giant_bat', 'neutral_werewolf'],
  ],
  snowy_pass: [
    ['orc_t1_grunt', 'orc_t2_axe_thrower', 'orc_t3_wolf_rider', 'orc_t4_shaman_adept', 'orc_t5_ogre'],
    ['neutral_yeti', 'neutral_ice_elemental', 'neutral_frost_wraith', 'neutral_dire_wolf', 'neutral_ettin'],
    ['neutral_cave_troll', 'neutral_owlbear', 'neutral_giant_bat', 'neutral_hobgoblin_captain', 'neutral_centaur'],
  ],
  volcanic: [
    ['neutral_fire_elemental', 'neutral_chimera', 'neutral_manticore', 'neutral_giant_scorpion', 'neutral_phoenix'],
    ['neutral_sand_wurm', 'neutral_dragon_turtle', 'neutral_cyclops', 'neutral_boar_beastman', 'neutral_harpy_v2'],
  ],
  crystal_cavern: [
    ['dwarf_t2_hammerer', 'dwarf_t3_crossbow_veteran', 'dwarf_t4_shieldwall_guard', 'dwarf_t5_steam_golem', 'dwarf_t6_berserker_thane'],
    ['neutral_moss_stone_golem', 'neutral_stone_gargoyle', 'neutral_clockwork_golem', 'neutral_basilisk', 'neutral_mimic'],
    ['neutral_air_elemental', 'neutral_water_elemental', 'neutral_animated_armor', 'neutral_cyclops', 'neutral_mimic'],
  ],
  demon_wasteland: [
    ['demon_t2_hellhound', 'demon_t3_succubus', 'demon_t4_devil', 'demon_t5_fire_lord', 'demon_t6_archdemon'],
    ['neutral_cultist', 'neutral_black_knight', 'neutral_fire_elemental', 'neutral_chimera', 'neutral_hedge_mage'],
    ['neutral_rogue_assassin', 'neutral_bandit_chieftain', 'neutral_manticore', 'neutral_phoenix', 'neutral_harpy'],
  ],
};
// the other peoples' scouting parties in act 1
GROUPS.elves = ['elf_t1_scout', 'elf_t2_archer', 'elf_t3_forest_warden', 'neutral_will_o_wisps'];
GROUPS.orcs = ['orc_t1_grunt', 'orc_t2_axe_thrower', 'orc_t3_wolf_rider', 'neutral_dire_wolf'];
// extra act-1 creatures that were not in fights yet
GROUPS.bandits.push('neutral_bandit_chieftain', 'neutral_rogue_assassin');
GROUPS.wilds.push('neutral_owlbear', 'neutral_harpy');
GROUPS.goblins.push('neutral_hobgoblin_captain', 'neutral_boar_beastman');
GROUPS.forest.push('neutral_satyr_piper', 'neutral_werewolf', 'neutral_centaur');

const ELITES: Record<string, string[]> = {
  elite_bandit_captain: ['neutral_bandit_thug', 'neutral_bandit_archer'],
  elite_giant_spider: ['neutral_giant_spider', 'neutral_giant_rat'],
  elite_minotaur: ['neutral_wild_boar', 'neutral_cultist'],
  elite_bog_wyvern: ['neutral_lizardman_warrior', 'neutral_harpy'],
  elite_rune_sentinel: ['neutral_stone_gargoyle', 'neutral_clockwork_golem'],
  elite_magma_salamander: ['neutral_fire_elemental', 'neutral_giant_scorpion'],
};
const ACT_ELITES: Record<number, string[]> = {
  1: ['elite_bandit_captain', 'elite_giant_spider', 'elite_minotaur'],
  2: ['elite_bog_wyvern', 'elite_rune_sentinel', 'elite_minotaur'],
  3: ['elite_magma_salamander', 'elite_rune_sentinel', 'elite_bog_wyvern'],
};

/** Boss of each biome with its escort. */
const BOSSES: Record<string, { id: string; escort: string[] }> = {
  meadows: { id: 'boss_act1_bandit_king', escort: ['neutral_bandit_thug', 'neutral_bandit_archer'] },
  autumn_forest: { id: 'boss_extra_corrupted_treant', escort: ['neutral_satyr_piper', 'neutral_dire_wolf'] },
  rocky_coast: { id: 'boss_extra_green_dragon', escort: ['neutral_harpy', 'neutral_bandit_archer'] },
  swamp_ruins: { id: 'boss_act2_swamp_hydra', escort: ['neutral_lizardman_warrior', 'neutral_bog_witch'] },
  graveyard: { id: 'boss_extra_lich_sovereign', escort: ['undead_t2_zombie', 'neutral_mummy'] },
  snowy_pass: { id: 'boss_extra_frost_giant', escort: ['neutral_yeti', 'neutral_dire_wolf'] },
  volcanic: { id: 'boss_act3_magma_wyrm', escort: ['neutral_fire_elemental', 'neutral_giant_scorpion'] },
  crystal_cavern: { id: 'boss_extra_stone_colossus', escort: ['neutral_stone_gargoyle', 'neutral_water_elemental'] },
  demon_wasteland: { id: 'boss_extra_archdemon', escort: ['neutral_cultist', 'neutral_black_knight'] },
};
export const bossOf = (biome: string): string => (BOSSES[biome] ?? BOSSES.meadows).id;

export const BIOME_BG: Record<string, string> = {
  meadows: 'bg_act1_meadows', autumn_forest: 'bg_act1_autumn_forest', rocky_coast: 'bg_act1_rocky_coast',
  swamp_ruins: 'bg_act2_swamp_ruins', graveyard: 'bg_act2_graveyard', snowy_pass: 'bg_act2_snowy_pass',
  volcanic: 'bg_act3_volcanic', crystal_cavern: 'bg_act3_crystal_cavern', demon_wasteland: 'bg_act3_demon_wasteland',
};

/** Floors counted over all acts (13 per act): drives the difficulty curve, rewards and loot. */
export const globalFloor = (floor: number, r: RunState = run()): number => (r.act - 1) * 13 + floor;

/** Elites (one big unit with fixed stats) grow stronger in later acts. */
export function actScaled(def: UnitDef, act: number): UnitDef {
  if (act <= 1) return def;
  const k = act - 1;
  return {
    ...def, hp: Math.round(def.hp * (1 + 0.7 * k)), atk: def.atk + 3 * k, def: def.def + 3 * k,
    dmg: [Math.round(def.dmg[0] * (1 + 0.45 * k)), Math.round(def.dmg[1] * (1 + 0.45 * k))],
  };
}

export interface EnemyArmy { army: { id: string; count: number; act?: number; boss?: number; mult?: number }[]; hero: { atk: number; def: number }; }

/** Late bosses and the Void God are a bit tougher since unit upgrades go up to level 5 (20.11.). */
export const BOSS_SCALE: Record<number, number> = { 1: 1, 2: 1.35, 3: 1.6 };
export function bossScaled(def: UnitDef, k: number): UnitDef {
  if (k <= 1) return def;
  return { ...def, hp: Math.round(def.hp * k), dmg: [Math.round(def.dmg[0] * (1 + (k - 1) * 0.6)), Math.round(def.dmg[1] * (1 + (k - 1) * 0.6))] };
}

/** Player army strength in leadership points (with upgrades counted a bit higher). */
function playerPower(r: RunState): number {
  return r.army.reduce((a, s) => a + count(s) * UNITS[s.unitId].cost * (1 + 0.15 * s.level), 0)
    * (1 + 0.04 * (heroTotals(r).atk + heroTotals(r).def));
}

export const TREASURE_GOBLIN = 'neutral_treasure_goblin';

/** Shop (v0.19, Ben 27.11.): neutral creatures of the current biome to hire, tier rising with the floor like enemies. */
export function shopNeutrals(g: { shuffle<T>(a: T[]): T[] }, floor: number, r: RunState = run(), n = 2): string[] {
  const groups = r.act >= 2 && BIOME_GROUPS[r.biome] ? BIOME_GROUPS[r.biome].flat() : Object.values(GROUPS).flat();
  const maxTier = r.act === 1 ? (floor < 2 ? 2 : floor < 5 ? 3 : 4) : r.act === 2 ? (floor < 2 ? 3 : floor < 6 ? 4 : 5) : (floor < 2 ? 4 : floor < 6 ? 5 : 6);
  const pool = [...new Set(groups)].filter((id) => id.startsWith('neutral_') && id !== TREASURE_GOBLIN && UNITS[id] && UNITS[id].tier <= maxTier
    && !r.army.some((s) => s.unitId === id));
  // prefer the stronger creatures of the allowed tiers
  const strong = pool.filter((id) => UNITS[id].tier >= maxTier - 1);
  return g.shuffle(strong.length >= n ? strong : pool).slice(0, n);
}
/** Price of a neutral creature in the shop: 60 + 40 x tier (before discount; v0.19.0: 50 + 30 x tier). */
export const neutralPrice = (id: string): number => 60 + 40 * UNITS[id].tier;
export const TREASURE_CHANCE = 0.1;

/** early: extra factor for the very first fights of a run (index = global floor), so a fresh run without city can win its first fight (27.11.). */
export const DIFFICULTY = { base: 500, start: 0.5, perFloor: 0.075, perFloorLate: 0.015, elite: 1.1, boss: 0.55, bossEscort: 1.2, final: 1.0, finalSpawn: 7, finalHero: 6, early: [0.75, 0.88] as number[] };

/** Enemy budget factor: steep in act 1, flatter in acts 2 and 3 (the player's growth slows down there too). */
export function curveAt(gf: number): number {
  const c = DIFFICULTY.start + DIFFICULTY.perFloor * Math.min(gf, 12) + DIFFICULTY.perFloorLate * Math.max(0, gf - 12);
  return c * (DIFFICULTY.early[gf] ?? 1);
}

export function buildEnemy(node: MapNode, groupOverride?: string): EnemyArmy {
  const r = run();
  const g = rng();
  const floor = globalFloor(node.floor, r);
  // fixed difficulty curve (leadership points), so the player's growth actually matters
  const A = ascOf(r);
  const curve = DIFFICULTY.base * curveAt(floor) * ASC.enemyBudget(A);   // ascension 1 / 10
  void playerPower(r);
  const heroBonus = Math.floor(floor / 4);
  const out: EnemyArmy['army'] = [];

  if (node.type === 'boss') {
    const b = BOSSES[r.biome] ?? BOSSES.meadows;
    out.push({ id: b.id, count: 1, boss: (BOSS_SCALE[r.act] ?? 1) * ASC.boss(A) });   // ascension 5: mighty bosses
    // the escort grows with the act like normal fights (act 1: as before)
    const rest = Math.max(40, DIFFICULTY.base * DIFFICULTY.boss * (1 + DIFFICULTY.bossEscort * (r.act - 1))) * ASC.enemyBudget(A);
    for (const e of b.escort) out.push({ id: e, count: Math.max(2, Math.round(rest * 0.5 / UNITS[e].cost)) });
    commitRng(g);
    return { army: out, hero: { atk: 1 + 3 * (r.act - 1), def: 1 + 3 * (r.act - 1) } };
  }

  if (node.type === 'elite') {
    const eliteId = g.pick(ACT_ELITES[r.act] ?? ACT_ELITES[1]);
    out.push({ id: eliteId, count: 1, act: r.act, mult: ASC.elite(A) });   // ascension 2: hard elites
    const budget = Math.max(20, curve * DIFFICULTY.elite * ASC.elite(A) - UNITS[eliteId].cost);
    const esc = ELITES[eliteId];
    for (const id of esc) out.push({ id, count: Math.max(2, Math.round(budget / esc.length / UNITS[id].cost)) });
    commitRng(g);
    return { army: out, hero: { atk: heroBonus + 1, def: heroBonus + 1 } };
  }

  const budget = curve;
  const local = node.floor;
  let groupPool: string[];
  let maxTier: number;
  if (r.act >= 2 && !groupOverride && BIOME_GROUPS[r.biome]) {
    groupPool = g.pick(BIOME_GROUPS[r.biome]);
    maxTier = r.act === 2 ? (local < 2 ? 3 : local < 6 ? 4 : 5) : (local < 2 ? 4 : local < 6 ? 5 : 6);
  } else {
    groupPool = GROUPS[groupOverride ?? g.pick(Object.keys(GROUPS))];
    maxTier = local < 2 ? 2 : local < 5 ? 3 : 4;
  }
  let pool = groupPool.filter((id) => UNITS[id].tier <= maxTier);
  if (pool.length < 2) pool = [...groupPool].sort((x, y) => UNITS[x].tier - UNITS[y].tier).slice(0, 2);
  const n = Math.min(pool.length, floor < 2 ? 2 : g.int(2, 3));
  void maxTier;
  const chosen = g.shuffle([...pool]).slice(0, n);
  for (const id of chosen) {
    out.push({ id, count: Math.max(1, Math.round(budget / n / UNITS[id].cost)) });
  }
  // rare treasure goblin: runs away in round 3, killing it gives bonus gold and an item
  if (g.next() < TREASURE_CHANCE && out.length < 4) {
    out.push({ id: TREASURE_GOBLIN, count: Math.max(3, Math.round(budget * 0.1 / UNITS[TREASURE_GOBLIN].cost)), act: r.act });
  }
  commitRng(g);
  return { army: out, hero: { atk: heroBonus, def: heroBonus } };
}

export interface RunBattleConfig {
  setup: BattleSetup;
  playerHero: string;
  enemyHero?: string;
  background: string;
  ambient: string;
  music: string;
  mode: 'run';
  nodeId: number;
  reward: { gold: number; xp: number; draft: boolean };
  final?: boolean;
}

export function battleConfig(node: MapNode, enemy: EnemyArmy, rewardMul = 1): RunBattleConfig {
  const r = run();
  const seed = (r.seed ^ (node.id * 7919)) >>> 0;
  const hero = heroById(r.heroId);
  const isBoss = node.type === 'boss';
  const isElite = node.type === 'elite';
  const tot = heroTotals(r);
  const gf = globalFloor(node.floor, r);
  // gold economy v0.19.1 (Ben 27.11.: far less gold): before (boss 150 / elite 75 / 25 + 3 x floor) x (1 + 0.3 per act)
  const A = ascOf(r);
  const baseGold = (isBoss ? 90 : isElite ? 45 : 15 + gf * 1.5) * (1 + 0.1 * (r.act - 1)) * ASC.gold(A);   // ascension 3: meagre spoils
  return {
    mode: 'run',
    nodeId: node.id,
    playerHero: hero.id,
    background: BIOME_BG[r.biome] ?? 'bg_act1_meadows',
    ambient: `amb_${r.biome}`,
    music: isBoss ? 'mus_battle_boss' : isElite ? 'mus_battle_elite' : 'mus_battle',
    setup: {
      seed,
      obstacles: Battle.randomObstacles(seed, isBoss ? 2 : 3),
      deployCols: bonus.deployCols(),
      playerPos: r.army.filter((s) => count(s) > 0).map((s) => r.formation?.[s.unitId] ?? null),
      player: {
        hero: {
          atk: tot.atk, def: tot.def, power: tot.power, knowledge: tot.knowledge, spells: (r.spells ?? []).map((x) => ({ ...x })),
          consumables: (r.belt ?? []).map((x) => x ?? ''),
          summon: summonFor(r),
        },
        mods: playerMods(r),
        army: r.army.filter((s) => count(s) > 0).map((s) => ({ def: upgradedDef(s), count: count(s) })),
      },
      enemy: {
        hero: enemy.hero,
        army: enemy.army.map((a) => {
          const d = a.boss ? bossScaled(UNITS[a.id], a.boss) : a.act ? actScaled(UNITS[a.id], a.act) : UNITS[a.id];
          return { def: a.mult && a.mult !== 1 ? bossScaled(d, a.mult) : d, count: a.count };
        }),
        // ascension 4 / 5 / 8: tough, raging, battle-hardened foes
        mods: combine({ hp: ASC.enemyHp(A), bossRage: ASC.bossRage(A), crit: ASC.enemyCrit(A), morale: ASC.enemyMorale(A) }),
      },
    },
    reward: {
      gold: Math.round(baseGold * rewardMul * (1 + perkFactor('gold', r))),
      xp: Math.round((isBoss ? 60 : isElite ? 30 : 12 + gf) * (1 + 0.25 * (r.act - 1)) * (1 + perkFactor('xp', r)) * ASC.xp(A)),   // ascension 7
      draft: !isBoss,
    },
  };
}

/** The final battle against the Void God after the act-3 boss (GDD: endboss after act 3). */
export function finalConfig(): RunBattleConfig {
  const r = run();
  const node = r.map.find((n) => n.id === r.currentNode) ?? r.map[r.map.length - 1];
  const enemy: EnemyArmy = {
    army: [{ id: 'boss_final_void_god', count: 1, boss: DIFFICULTY.final }, { id: 'summon_void_spawn', count: DIFFICULTY.finalSpawn * ASC.voidSpawn(ascOf(r)) }],
    hero: { atk: DIFFICULTY.finalHero, def: DIFFICULTY.finalHero },
  };
  const cfg = battleConfig(node, enemy);
  cfg.final = true;
  cfg.background = 'bg_act3_demon_wasteland';
  cfg.ambient = 'amb_demon_wasteland';
  cfg.music = 'mus_battle_final';
  cfg.reward = { gold: 0, xp: 0, draft: false };
  return cfg;
}
