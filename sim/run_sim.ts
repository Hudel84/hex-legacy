// Simulates whole act-1 runs with the AI playing both sides. Usage: npx tsx sim/run_sim.ts [runs]
import { Battle } from '../src/battle/engine';
import { newRun, setRun, run, availableNodes, gainXp, applyBoon, BOONS, draftPool, rebalance, MAX_SLOTS, addLeadership, count } from '../src/run/state';
import { buildEnemy, battleConfig } from '../src/run/encounters';
import { HEROES } from '../src/run/heroes';
import { Rng } from '../src/run/rng';

const RUNS = Number(process.argv[2] ?? 200);
const deaths: Record<string, number> = {};
let bossKills = 0;
const lossByType: Record<string, number[]> = {};
for (let i = 0; i < RUNS; i++) {
  const hero = HEROES[i % HEROES.length];
  setRun(newRun(hero.id, 1000 + i));
  const pick = new Rng(77 + i);
  let alive = true;
  while (alive) {
    const r = run();
    const opts = availableNodes();
    if (!opts.length) break;
    const node = pick.pick(opts);
    r.currentNode = node.id; r.visited.push(node.id);
    if (node.type === 'rest') { const s = pick.pick(r.army); if (s.level < 2) s.level++; continue; }
    if (node.type === 'shop') { while (r.gold >= 50) { r.gold -= 50; addLeadership(10); } continue; }
    if (node.type === 'treasure') { r.gold += 80; continue; }
    if (node.type === 'shrine' || node.type === 'event') { r.gold += 20; continue; }
    const cfg = battleConfig(node, buildEnemy(node));
    const b = new Battle(cfg.setup);
    let g = 0;
    while (!b.winner && g++ < 600) { b.nextTurn(); if (b.winner) break; b.act(b.decide()); }
    const pl = b.stacks.filter((s) => s.side === 'player');
    const loss = 1 - pl.reduce((a, s) => a + s.count * s.def.cost, 0) / pl.reduce((a, s) => a + s.startCount * s.def.cost, 0);
    (lossByType[`${node.type}@${node.floor}`] ??= []).push(loss);
    if (b.winner !== 'player') { alive = false; deaths[`${node.type}@${node.floor}`] = (deaths[`${node.type}@${node.floor}`] ?? 0) + 1; break; }
    if (node.type === 'boss') { bossKills++; break; }
    r.gold += cfg.reward.gold;
    const ups = gainXp(cfg.reward.xp);
    for (let u = 0; u < ups; u++) applyBoon(pick.pick(BOONS));
    if (cfg.reward.draft) {
      const id = pick.pick(draftPool('human', node.floor));
      if (r.army.length < MAX_SLOTS && !r.army.some((s) => s.unitId === id)) { r.army.push({ unitId: id, alloc: 0, level: 0 }); rebalance(); }
    }
    void count;
  }
}
console.log(`boss killed in ${(100 * bossKills / RUNS).toFixed(0)}% of runs (AI plays the player)`);
console.log('deaths:', Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
const avg = (a: number[]) => (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
const byFloor: Record<string, number[]> = {};
for (const [k, v] of Object.entries(lossByType)) { const [t] = k.split('@'); (byFloor[t] ??= []).push(...v); }
console.log('avg army loss per fight:', Object.entries(byFloor).map(([k, v]) => `${k} ${avg(v)}% (n=${v.length})`).join(', '));
