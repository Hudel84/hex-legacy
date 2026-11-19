// Autobattle simulation: both sides use the AI. Usage: npx tsx sim/simulate.ts [n]
import { Battle, type BattleSetup } from '../src/battle/engine';
import { UNITS } from '../src/data/units';

const N = Number(process.argv[2] ?? 500);

function army(list: [string, number][]) { return list.map(([id, count]) => ({ def: UNITS[id], count })); }

const scenarios: { name: string; setup: (seed: number) => BattleSetup }[] = [
  {
    name: 'Test battle: humans (lead 150) vs undead',
    setup: (seed) => ({
      seed, obstacles: Battle.randomObstacles(seed),
      player: { hero: { atk: 2, def: 2 }, army: army([['human_t1_spearman', 12], ['human_t2_crossbowman', 5], ['human_t3_swordsman', 2]]) },
      enemy: { hero: { atk: 1, def: 1 }, army: army([['undead_t1_skeleton', 16], ['undead_t2_zombie', 5], ['undead_t3_ghost', 2]]) },
    }),
  },
  {
    name: 'Mirror cost check: 140 lead each, T1/T2/T3',
    setup: (seed) => ({
      seed, obstacles: Battle.randomObstacles(seed),
      player: { hero: { atk: 0, def: 0 }, army: army([['human_t1_spearman', 8], ['human_t2_crossbowman', 4], ['human_t3_swordsman', 3]]) },
      enemy: { hero: { atk: 0, def: 0 }, army: army([['undead_t1_skeleton', 16], ['undead_t2_zombie', 5], ['undead_t3_ghost', 2]]) },
    }),
  },
  {
    name: 'High tiers 300 lead: T4/T5/T6 one each + fill',
    setup: (seed) => ({
      seed, obstacles: Battle.randomObstacles(seed),
      player: { hero: { atk: 3, def: 3 }, army: army([['human_t4_cleric', 2], ['human_t5_griffin_rider', 2], ['human_t6_paladin', 2]]) },
      enemy: { hero: { atk: 3, def: 3 }, army: army([['undead_t4_vampire', 2], ['undead_t5_lich', 2], ['undead_t6_bone_dragon', 2]]) },
    }),
  },
];

for (const sc of scenarios) {
  let pWins = 0, rounds = 0, turns = 0, lostValue = 0;
  for (let i = 0; i < N; i++) {
    const b = new Battle(sc.setup(1000 + i));
    let guard = 0;
    while (!b.winner && guard++ < 500) {
      b.nextTurn();
      if (b.winner) break;
      b.act(b.decide());
      turns++;
    }
    if (b.winner === 'player') {
      pWins++;
      lostValue += b.stacks.filter((s) => s.side === 'player').reduce((a, s) => a + (s.startCount - s.count) * s.def.cost, 0)
        / b.stacks.filter((s) => s.side === 'player').reduce((a, s) => a + s.startCount * s.def.cost, 0);
    }
    rounds += b.round;
  }
  console.log(`${sc.name}\n  player wins ${(100 * pWins / N).toFixed(1)}%, avg rounds ${(rounds / N).toFixed(1)}, avg actions ${(turns / N).toFixed(1)}, avg loss when winning ${(100 * lostValue / Math.max(1, pWins)).toFixed(0)}%`);
}
