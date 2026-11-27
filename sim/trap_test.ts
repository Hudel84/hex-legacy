// Player traps (v0.20.2): enemies cannot see them and walk in. Counts sprung traps and checks that a stack
// caught on the way stops on the trap. Usage: npx tsx sim/trap_test.ts [battles]
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import { combine } from '../src/battle/mods';
import { Rng } from '../src/run/rng';

const N = Number(process.argv[2] ?? 300);
const ids = Object.keys(UNITS).filter((id) => !id.startsWith('summon_') && !id.includes('treasure') && !id.startsWith('boss_') && !id.startsWith('elite_'));
let sprung = 0, laid = 0, wins = 0, bad = 0;
for (let i = 0; i < N; i++) {
  const g = new Rng(900 + i);
  const army = () => Array.from({ length: g.int(2, 3) }, () => ({ def: UNITS[g.pick(ids)], count: g.int(4, 20) }));
  const b = new Battle({ seed: 500 + i, obstacles: Battle.randomObstacles(500 + i, 3),
    player: { hero: { atk: 1, def: 1 }, army: army(), mods: combine({ traps: 2 }) }, enemy: { hero: { atk: 1, def: 1 }, army: army() } });
  let k = 0;
  while (!b.winner && k++ < 600) {
    b.nextTurn(); if (b.winner) break;
    const ev = b.act(b.decide());
    for (const e of ev) {
      if (e.type === 'trap' && e.on === false && e.uid !== undefined && b.stack(e.uid)?.side === 'enemy') {
        sprung++;
        const st = b.stack(e.uid)!;
        if (!b.cells(st).some((c) => c.col === e.hex.col && c.row === e.hex.row)) bad++;   // must stand on the trap
      }
    }
  }
  laid += 0;
  if (b.winner === 'player') wins++;
}
console.log(`battles ${N}: enemy stacks caught in traps ${sprung} (${(sprung / N).toFixed(2)} per battle), player won ${(100 * wins / N).toFixed(0)}%, errors ${bad}`);
if (bad) process.exit(1);
