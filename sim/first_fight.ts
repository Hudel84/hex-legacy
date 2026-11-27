// First fights of a fresh run (no city): win rate and army loss per hero and per enemy group.
// Usage: npx tsx sim/first_fight.ts [runsPerHero] [floor] ['{"start":0.4}']
import { Battle } from '../src/battle/engine';
import { newRun, setRun, run, rankUpgrades, chooseTalentUpgrade } from '../src/run/state';
import { buildEnemy, battleConfig, DIFFICULTY } from '../src/run/encounters';
import { HEROES } from '../src/run/heroes';
import { Rng } from '../src/run/rng';

const N = Number(process.argv[2] ?? 100);
const FLOOR = Number(process.argv[3] ?? 0);
if (process.argv[4]) Object.assign(DIFFICULTY, JSON.parse(process.argv[4]));
let wins = 0, total = 0;
const byHero: string[] = [];
const byGroup: Record<string, [number, number]> = {};
for (const hero of HEROES) {
  let w = 0, lossSum = 0;
  for (let i = 0; i < N; i++) {
    setRun(newRun(hero.id, 5000 + i));
    const pick = new Rng(99 + i);
    const pt = run().pendingTalent; if (pt) chooseTalentUpgrade(pick.pick(rankUpgrades(pt.theme, pt.rank)).id);
    const r = run();
    const node = r.map.find((n) => n.floor === FLOOR && n.type === 'battle') ?? { ...r.map.find((n) => n.floor === 0)!, floor: FLOOR, type: 'battle' as const };
    const cfg = battleConfig(node, buildEnemy(node));
    const b = new Battle(cfg.setup);
    let g = 0;
    while (!b.winner && g++ < 600) { b.nextTurn(); if (b.winner) break; b.aiCast(b.active!.side); if (b.winner) break; b.aiItem(b.active!.side); if (b.winner) break; b.act(b.decide()); }
    const won = b.winner === 'player';
    const pl = b.stacks.filter((s) => s.side === 'player');
    lossSum += 1 - pl.reduce((a, s) => a + s.count * s.def.cost, 0) / pl.reduce((a, s) => a + s.startCount * s.def.cost, 0);
    const key = cfg.setup.enemy.army.filter((a) => !a.def.id.includes('treasure')).map((a) => a.def.id.replace(/^neutral_/, '') + 'x' + a.count).sort().join('+');
    const gk = key.replace(/x\d+/g, '');
    (byGroup[gk] ??= [0, 0])[1]++; if (won) byGroup[gk][0]++;
    if (won) w++;
  }
  wins += w; total += N;
  byHero.push(`${hero.id.replace(/_hero$/, '')} ${(100 * w / N).toFixed(0)}% (loss ${(100 * lossSum / N).toFixed(0)}%)`);
}
console.log('DIFFICULTY', JSON.stringify(DIFFICULTY), 'floor', FLOOR);
console.log(`won ${(100 * wins / total).toFixed(0)}% of ${total}`);
console.log(byHero.join('\n'));
console.log('--- worst enemy combos:');
for (const [k, [w, n]] of Object.entries(byGroup).filter(([, [, n]]) => n >= 10).sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).slice(0, 12)) console.log(`${(100 * w / n).toFixed(0)}%  n=${n}  ${k}`);
