// Simulates whole act-1 runs with the AI playing both sides. Usage: npx tsx sim/run_sim.ts [runs]
import { Battle } from '../src/battle/engine';
import { newRun, setRun, run, availableNodes, gainXp, draftPool, rebalance, MAX_SLOTS, addLeadership, count, grantPerk, owner, spellReward, learnSpell, stashItem, addConsumable } from '../src/run/state';
import { rollItem, rollConsumable } from '../src/run/items';
import { offer, bossRelics } from '../src/run/perks';
import { MAX_UNIT_LEVEL, upgradeOptions, levelUpUnit } from '../src/run/state';
import { buildEnemy, battleConfig, DIFFICULTY, finalConfig } from '../src/run/encounters';
import { advanceAct } from '../src/run/state';
import type { RunBattleConfig } from '../src/run/encounters';
import { HEROES } from '../src/run/heroes';
import { Rng } from '../src/run/rng';

const RUNS = Number(process.argv[2] ?? 200);
if (process.argv[3]) Object.assign(DIFFICULTY, JSON.parse(process.argv[3]));
const PERKS_ON = process.argv[4] !== 'noperks';
const MAGIC_ON = process.argv[5] !== 'nomagic';
const ITEMS_ON = process.argv[6] !== 'noitems';
console.log('DIFFICULTY', JSON.stringify(DIFFICULTY));
const deaths: Record<string, number> = {};
let bossKills = 0;
let treasure = 0, goblins = 0;
const byHero: Record<string, [number, number]> = {};
const lossByType: Record<string, number[]> = {};
const actBoss: Record<number, number> = {};
const act1ByHero: Record<string, number> = {};
for (let i = 0; i < RUNS; i++) {
  const hero = HEROES[i % HEROES.length];
  setRun(newRun(hero.id, 1000 + i));
  (byHero[hero.id] ??= [0, 0])[1]++;
  const pick = new Rng(77 + i);
  let alive = true;
  while (alive) {
    const r = run();
    const opts = availableNodes();
    if (!opts.length) break;
    const node = pick.pick(opts);
    r.currentNode = node.id; r.visited.push(node.id);
    if (node.type === 'rest') { const s = pick.pick(r.army); if (s.level < MAX_UNIT_LEVEL) { const o = upgradeOptions(s); levelUpUnit(s, o.length ? pick.pick(o).id : null); } continue; }
    if (node.type === 'shop') { while (r.gold >= 50) { r.gold -= 50; addLeadership(10); } continue; }
    if (node.type === 'treasure') { r.gold += 80; if (ITEMS_ON && pick.next() < 0.5) stashItem(rollItem(pick, node.floor)); continue; }
    if (node.type === 'shrine' || node.type === 'event') { r.gold += 20; continue; }
    const cfg: RunBattleConfig = node.type === 'final' as string ? finalConfig() : battleConfig(node, buildEnemy(node));
    const b = new Battle(cfg.setup);
    let g = 0;
    if (!MAGIC_ON) { cfg.setup.player.hero.spells = []; }
    const b2 = MAGIC_ON ? b : new Battle(cfg.setup);
    while (!b2.winner && g++ < 600) { b2.nextTurn(); if (b2.winner) break; if (MAGIC_ON) b2.aiCast(b2.active!.side); if (b2.winner) break; if (ITEMS_ON) b2.aiItem(b2.active!.side); if (b2.winner) break; b2.act(b2.decide()); }
    for (const i of b2.usedItems.player) if (r.belt) r.belt[i] = null;
    const pl = b2.stacks.filter((s) => s.side === 'player');
    const loss = 1 - pl.reduce((a, s) => a + s.count * s.def.cost, 0) / pl.reduce((a, s) => a + s.startCount * s.def.cost, 0);
    (lossByType[`${node.type}@${r.act}.${node.floor}`] ??= []).push(loss);
    if (b2.winner !== 'player' && process.env.WHO) console.log('died', r.act, node.floor, r.biome, cfg.setup.enemy.army.map((a) => `${a.def.id}x${a.count}`).join(' '), '| player', cfg.setup.player.army.map((a) => `${a.def.id}x${a.count}`).join(' '));
    if (b2.winner !== 'player') { alive = false; deaths[`${node.type}@${r.act}.${node.floor}`] = (deaths[`${node.type}@${r.act}.${node.floor}`] ?? 0) + 1; break; }
    if (node.type === 'boss') {
      actBoss[r.act] = (actBoss[r.act] ?? 0) + 1;
      if (r.act === 1) act1ByHero[hero.id] = (act1ByHero[hero.id] ?? 0) + 1;
      if (PERKS_ON && !process.env.NORELIC) { const o = bossRelics(cfg.setup.enemy.army[0].def.id, owner(), pick); if (o.length) grantPerk(pick.pick(o).id); }
      if (r.act < 3) { advanceAct(); continue; }
      // final battle
      const fc = finalConfig();
      const fb = new Battle(fc.setup);
      let k = 0;
      while (!fb.winner && k++ < 900) { fb.nextTurn(); if (fb.winner) break; if (MAGIC_ON) fb.aiCast(fb.active!.side); if (fb.winner) break; if (ITEMS_ON) fb.aiItem(fb.active!.side); if (fb.winner) break; fb.act(fb.decide()); }
      if (fb.winner === 'player') { bossKills++; byHero[hero.id][0]++; } else deaths['final'] = (deaths['final'] ?? 0) + 1;
      break;
    }
    r.gold += cfg.reward.gold;
    if (b2.treasureKilled()) treasure++;
    if (cfg.setup.enemy.army.some((a) => a.def.id === 'neutral_treasure_goblin')) goblins++;
    const ups = gainXp(cfg.reward.xp);
    for (let u = 0; u < ups && PERKS_ON; u++) {
      const sr = MAGIC_ON && pick.next() < 0.3 ? spellReward(pick) : null;
      if (sr) { learnSpell(sr.id); continue; }
      const o = offer('talent', 3, owner(), pick); if (o.length) grantPerk(pick.pick(o).id);
    }
    if (ITEMS_ON) {
      if (node.type === 'elite' && pick.next() < 0.33) stashItem(rollItem(pick, node.floor, 'rare'));
      else if (node.type !== 'elite') { if (pick.next() < 0.35) stashItem(rollItem(pick, node.floor)); if (pick.next() < 0.15) addConsumable(rollConsumable(pick)); }
    }
    if (node.type === 'elite' && PERKS_ON) { const o = offer('artifact', 3, owner(), pick); if (o.length) grantPerk(pick.pick(o).id); }
    if (cfg.reward.draft) {
      const id = pick.pick(draftPool(owner().faction, node.floor));
      const own = r.army.find((s) => s.unitId === id);
      if (own && own.level < MAX_UNIT_LEVEL && !process.env.NODRAFTUP) { const o = upgradeOptions(own); levelUpUnit(own, o.length ? pick.pick(o).id : null); }
      else if (r.army.length < MAX_SLOTS && !own) { r.army.push({ unitId: id, alloc: 0, level: 0, ups: [] }); rebalance(); }
    }
    void count;
  }
}
console.log(`act bosses beaten: ${[1, 2, 3].map((a) => `act ${a} ${(100 * (actBoss[a] ?? 0) / RUNS).toFixed(0)}%`).join(', ')}`);
console.log(`Void God beaten (run won) in ${(100 * bossKills / RUNS).toFixed(0)}% of runs (AI plays the player)`);
console.log('act 1 boss by hero:', Object.entries(byHero).map(([k, [, n]]) => `${k.replace(/_hero/, '')} ${(100 * (act1ByHero[k] ?? 0) / n).toFixed(0)}%`).join(', '));
console.log('run won by hero:', Object.entries(byHero).map(([k, [w, n]]) => `${k.replace(/_hero/, '')} ${(100 * w / n).toFixed(0)}%`).join(', '));
console.log(`treasure goblins: ${goblins} met, ${treasure} killed`);
console.log('deaths:', Object.entries(deaths).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
const avg = (a: number[]) => (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0);
const byFloor: Record<string, number[]> = {};
for (const [k, v] of Object.entries(lossByType)) { const [t] = k.split('@'); (byFloor[t] ??= []).push(...v); }
console.log('avg army loss per fight:', Object.entries(byFloor).map(([k, v]) => `${k} ${avg(v)}% (n=${v.length})`).join(', '));
if (process.env.LOSS) {
  for (const k of Object.keys(lossByType).sort()) if (lossByType[k].length >= 5) console.log(k, avg(lossByType[k]) + '%', 'n=' + lossByType[k].length);
}
