import { Battle } from '../src/battle/engine';
import { newRun, setRun, run } from '../src/run/state';
import { buildEnemy, battleConfig } from '../src/run/encounters';
setRun(newRun('human_hero_knight_commander', 5));
const r = run();
const node = { id: 99, floor: 5, col: 3, type: 'elite' as const, next: [], x: 0, y: 0 };
let wins = 0;
for (let i = 0; i < 40; i++) {
  r.rngState = i * 31;
  const cfg = battleConfig(node, buildEnemy(node));
  const b = new Battle({ ...cfg.setup, seed: i });
  if (i === 0) console.log('player', cfg.setup.player.army.map((a) => a.def.id + ' x' + a.count).join(', '), '| enemy', cfg.setup.enemy.army.map((a) => a.def.id + ' x' + a.count).join(', '));
  let g = 0;
  while (!b.winner && g++ < 600) {
    b.nextTurn(); if (b.winner) break;
    const s = b.active!; const a = b.decide(); const ev = b.act(a);
    if (i === 0) console.log(b.round, s.def.id, s.count, JSON.stringify(a), ev.filter((e) => e.type === 'attack').map((e: any) => `${e.counter ? 'C' : ''}dmg${e.damage} k${e.kills}`).join(' '));
  }
  if (b.winner === 'player') wins++;
}
console.log('wins', wins, '/40');
