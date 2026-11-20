import { UNITS } from '../data/units';
import type { BattleSetup } from '../battle/engine';
import { Battle } from '../battle/engine';
import type { MapNode } from './mapgen';
import { run, rng, commitRng, count, upgradedDef, playerMods, perkFactor, heroTotals, type RunState } from './state';
import { heroById } from './heroes';

// Themed enemy groups for act 1. Units are picked from one group per fight.
const GROUPS: Record<string, string[]> = {
  bandits: ['neutral_bandit_thug', 'neutral_bandit_archer', 'neutral_dire_wolf', 'neutral_hedge_mage'],
  wilds: ['neutral_giant_rat', 'neutral_dire_wolf', 'neutral_wild_boar', 'neutral_giant_spider', 'neutral_cave_bear'],
  goblins: ['neutral_goblin_raider', 'neutral_kobold_trapper', 'neutral_gnoll_hunter', 'neutral_wild_boar'],
  cult: ['neutral_cultist', 'neutral_bandit_thug', 'neutral_animated_armor', 'neutral_hedge_mage'],
  forest: ['neutral_will_o_wisps', 'neutral_acid_slime', 'neutral_giant_spider', 'neutral_treant'],
  undead: ['undead_t1_skeleton', 'undead_t2_zombie', 'undead_t3_ghost', 'undead_t4_vampire'],
};
const ELITES: Record<string, string[]> = {
  elite_bandit_captain: ['neutral_bandit_thug', 'neutral_bandit_archer'],
  elite_giant_spider: ['neutral_giant_spider', 'neutral_giant_rat'],
  elite_minotaur: ['neutral_wild_boar', 'neutral_cultist'],
};

const BIOME_BG: Record<string, string> = {
  meadows: 'bg_act1_meadows', autumn_forest: 'bg_act1_autumn_forest', rocky_coast: 'bg_act1_rocky_coast',
};

export interface EnemyArmy { army: { id: string; count: number }[]; hero: { atk: number; def: number }; }

/** Player army strength in leadership points (with upgrades counted a bit higher). */
function playerPower(r: RunState): number {
  return r.army.reduce((a, s) => a + count(s) * UNITS[s.unitId].cost * (1 + 0.15 * s.level), 0)
    * (1 + 0.04 * (heroTotals(r).atk + heroTotals(r).def));
}

export const DIFFICULTY = { base: 340, start: 0.5, perFloor: 0.075, elite: 1.1, boss: 0.55 };

export function buildEnemy(node: MapNode, groupOverride?: string): EnemyArmy {
  const r = run();
  const g = rng();
  const floor = node.floor;
  // fixed difficulty curve (leadership points), so the player's growth actually matters
  const curve = DIFFICULTY.base * (DIFFICULTY.start + floor * DIFFICULTY.perFloor);
  void playerPower(r);
  const heroBonus = Math.floor(floor / 4);
  const out: { id: string; count: number }[] = [];

  if (node.type === 'boss') {
    out.push({ id: 'boss_act1_bandit_king', count: 1 });
    const rest = Math.max(40, DIFFICULTY.base * DIFFICULTY.boss);
    out.push({ id: 'neutral_bandit_thug', count: Math.max(4, Math.round(rest * 0.5 / UNITS.neutral_bandit_thug.cost)) });
    out.push({ id: 'neutral_bandit_archer', count: Math.max(2, Math.round(rest * 0.5 / UNITS.neutral_bandit_archer.cost)) });
    commitRng(g);
    return { army: out, hero: { atk: 1, def: 1 } };
  }

  if (node.type === 'elite') {
    const eliteId = g.pick(Object.keys(ELITES));
    out.push({ id: eliteId, count: 1 });
    const budget = Math.max(20, curve * DIFFICULTY.elite - UNITS[eliteId].cost);
    const esc = ELITES[eliteId];
    for (const id of esc) out.push({ id, count: Math.max(2, Math.round(budget / esc.length / UNITS[id].cost)) });
    commitRng(g);
    return { army: out, hero: { atk: heroBonus + 1, def: heroBonus + 1 } };
  }

  const budget = curve;
  const groupName = groupOverride ?? g.pick(Object.keys(GROUPS));
  const maxTier = floor < 2 ? 2 : floor < 5 ? 3 : 4;
  const pool = GROUPS[groupName].filter((id) => UNITS[id].tier <= maxTier);
  const n = Math.min(pool.length, floor < 2 ? 2 : g.int(2, 3));
  const chosen = g.shuffle([...pool]).slice(0, n);
  for (const id of chosen) {
    out.push({ id, count: Math.max(1, Math.round(budget / n / UNITS[id].cost)) });
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
}

export function battleConfig(node: MapNode, enemy: EnemyArmy, rewardMul = 1): RunBattleConfig {
  const r = run();
  const seed = (r.seed ^ (node.id * 7919)) >>> 0;
  const hero = heroById(r.heroId);
  const isBoss = node.type === 'boss';
  const isElite = node.type === 'elite';
  const tot = heroTotals(r);
  const baseGold = isBoss ? 150 : isElite ? 75 : 25 + node.floor * 3;
  return {
    mode: 'run',
    nodeId: node.id,
    playerHero: hero.id,
    background: BIOME_BG[r.biome] ?? 'bg_act1_meadows',
    ambient: `amb_${r.biome}`,
    music: isBoss ? 'mus_battle_boss' : 'mus_battle',
    setup: {
      seed,
      obstacles: Battle.randomObstacles(seed, isBoss ? 2 : 3),
      player: {
        hero: {
          atk: tot.atk, def: tot.def, power: tot.power, knowledge: tot.knowledge, spells: (r.spells ?? []).map((x) => ({ ...x })),
          consumables: (r.belt ?? []).map((x) => x ?? ''),
        },
        mods: playerMods(r),
        army: r.army.filter((s) => count(s) > 0).map((s) => ({ def: upgradedDef(s), count: count(s) })),
      },
      enemy: { hero: enemy.hero, army: enemy.army.map((a) => ({ def: UNITS[a.id], count: a.count })) },
    },
    reward: {
      gold: Math.round(baseGold * rewardMul * (1 + perkFactor('gold', r))),
      xp: Math.round((isBoss ? 60 : isElite ? 30 : 12 + node.floor) * (1 + perkFactor('xp', r))),
      draft: !isBoss,
    },
  };
}
