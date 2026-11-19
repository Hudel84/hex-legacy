import { Battle } from '../src/battle/engine';
import { newRun, setRun, run, rebalance } from '../src/run/state';
import { buildEnemy, battleConfig } from '../src/run/encounters';
setRun(newRun('human_hero_knight_commander', 5));
const r = run();
r.leadership = Number(process.argv[2] ?? 175); r.atk = 4; r.def = 4;
r.army = [{ unitId: 'human_t1_spearman', alloc: 0, level: 1 }, { unitId: 'human_t2_crossbowman', alloc: 0, level: 1 }, { unitId: 'human_t3_swordsman', alloc: 0, level: 0 }];
rebalance();
const node = { id: 99, floor: 12, col: 3, type: 'boss' as const, next: [], x: 0, y: 0 };
let wins = 0;
for (let i = 0; i < 40; i++) {
  const cfg = battleConfig(node, buildEnemy(node));
  const b = new Battle({ ...cfg.setup, seed: i });
  if (i === 0) console.log('player', cfg.setup.player.army.map((a) => a.def.id + ' x' + a.count).join(', '), '| enemy', cfg.setup.enemy.army.map((a) => a.def.id + ' x' + a.count).join(', '));
  let g = 0;
  while (!b.winner && g++ < 600) {
    b.nextTurn(); if (b.winner) break;
    const s = b.active!; const a = b.decide(); const ev = b.act(a);
    if (i === 0 && b.round < 5) console.log(b.round, s.def.id, JSON.stringify(a), ev.filter((e) => e.type === 'attack').map((e: any) => `${e.counter ? 'C' : ''}dmg${e.damage} k${e.kills}`).join(' '));
  }
  if (b.winner === 'player') wins++;
}
console.log('wins', wins, '/40');
