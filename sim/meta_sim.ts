// Meta progression over many runs (v0.17, GDD 17.8): the AI plays run after run, brings the loot home like
// the game does (RunEndScene), builds the city greedily and we watch play time and success.
// Usage: npx tsx sim/meta_sim.ts [campaigns=6] [maxRuns=80] [difficultyJSON]
//        FULL=1 npx tsx sim/meta_sim.ts 1 300   -> every building at max level (end-game strength)
import { Battle } from '../src/battle/engine';
import {
  newRun, setRun, run, availableNodes, gainXp, draftPool, rebalance, MAX_SLOTS, addLeadership, grantPerk, owner, stashItem, addConsumable,
  MAX_UNIT_LEVEL, upgradeOptions, levelUpUnit, advanceAct, levelUpOptions, takeThemeRank, rankUpgrades, chooseTalentUpgrade, applyBoon,
  addLoot, lootFor, runEndGain,
} from '../src/run/state';
import { rollItem, rollConsumable } from '../src/run/items';
import { offer, bossRelics } from '../src/run/perks';
import { buildEnemy, battleConfig, DIFFICULTY, finalConfig } from '../src/run/encounters';
import { HEROES } from '../src/run/heroes';
import { Rng } from '../src/run/rng';
import { getMeta, BUILDINGS, maxLevel, nextCost, canAfford, build, blockedByTownHall, addRes, heroUnlocked, type Res } from '../src/meta/meta';

const CAMPAIGNS = Number(process.argv[2] ?? 6);
const MAX_RUNS = Number(process.argv[3] ?? 80);
if (process.argv[4]) Object.assign(DIFFICULTY, JSON.parse(process.argv[4]));
const FULL = !!process.env.FULL;
// play time estimate: a battle ~2 min, any other node ~0.6 min, ~2 min per run for hero choice/talents/city
const MIN_BATTLE = 2, MIN_NODE = 0.6, MIN_RUN = 2;

function fight(cfg: ReturnType<typeof battleConfig>): Battle {
  const b = new Battle(cfg.setup);
  let g = 0;
  while (!b.winner && g++ < 900) {
    b.nextTurn(); if (b.winner) break;
    b.aiCast(b.active!.side); if (b.winner) break;
    b.aiItem(b.active!.side); if (b.winner) break;
    b.act(b.decide());
  }
  return b;
}

/** One run with the current city; returns minutes played, acts cleared and whether the run was won. */
function simRun(heroId: string, seed: number): { minutes: number; acts: number; won: boolean; floor: number } {
  setRun(newRun(heroId, seed));
  const pick = new Rng(seed * 7 + 3);
  const pickUpgrade = () => { const pt = run().pendingTalent; if (pt) chooseTalentUpgrade(pick.pick(rankUpgrades(pt.theme, pt.rank)).id); };
  pickUpgrade();
  let minutes = MIN_RUN, acts = 0, won = false;
  for (;;) {
    const r = run();
    const opts = availableNodes();
    if (!opts.length) break;
    const node = pick.pick(opts);
    r.currentNode = node.id; r.visited.push(node.id);
    if (node.type === 'rest') { minutes += MIN_NODE; const s = pick.pick(r.army); if (s.level < MAX_UNIT_LEVEL) { const o = upgradeOptions(s); levelUpUnit(s, o.length ? pick.pick(o).id : null); } continue; }
    if (node.type === 'shop') { minutes += MIN_NODE; while (r.gold >= 50) { r.gold -= 50; addLeadership(10); } continue; }
    if (node.type === 'treasure') { minutes += MIN_NODE; r.gold += 80; addLoot(lootFor('treasure', 6)); if (pick.next() < 0.5) stashItem(rollItem(pick, node.floor)); continue; }
    if (node.type === 'shrine' || node.type === 'event') { minutes += MIN_NODE; r.gold += 20; continue; }
    minutes += MIN_BATTLE;
    const cfg = battleConfig(node, buildEnemy(node));
    const b = fight(cfg);
    for (const i of b.usedItems.player) if (r.belt) r.belt[i] = null;
    if (b.winner !== 'player') break;
    r.battlesWon = (r.battlesWon ?? 0) + 1;
    addLoot(lootFor(node.type, node.floor));
    if (node.type === 'boss') {
      acts++;
      const o = bossRelics(cfg.setup.enemy.army[0].def.id, owner(), pick); if (o.length) grantPerk(pick.pick(o).id);
      if (r.act < 3) { advanceAct(); continue; }
      minutes += MIN_BATTLE;
      const fb = fight(finalConfig());
      if (fb.winner === 'player') won = true;
      break;
    }
    r.gold += cfg.reward.gold;
    const ups = gainXp(cfg.reward.xp);
    for (let u = 0; u < ups; u++) {
      const o = pick.pick(levelUpOptions(pick));
      if (o.kind === 'boon') applyBoon(o.boon); else { takeThemeRank(o.theme); pickUpgrade(); }
    }
    if (node.type === 'elite' && pick.next() < 0.33) stashItem(rollItem(pick, node.floor, 'rare'));
    else if (node.type !== 'elite') { if (pick.next() < 0.35) stashItem(rollItem(pick, node.floor)); if (pick.next() < 0.15) addConsumable(rollConsumable(pick)); }
    if (node.type === 'elite') { const o = offer('artifact', 3, owner(), pick); if (o.length) grantPerk(pick.pick(o).id); }
    if (cfg.reward.draft) {
      const id = pick.pick(draftPool(owner().faction, node.floor));
      const own = r.army.find((s) => s.unitId === id);
      if (own && own.level < MAX_UNIT_LEVEL) { const o = upgradeOptions(own); levelUpUnit(own, o.length ? pick.pick(o).id : null); }
      else if (r.army.length < MAX_SLOTS && !own) { r.army.push({ unitId: id, alloc: 0, level: 0, ups: [] }); rebalance(); }
    }
  }
  const end = runEndGain(won);
  addRes(end.gain, end.factor);
  addRes(end.production);
  return { minutes, acts, won, floor: end.floor };
}

const VALUE: Partial<Record<Res, number>> = { wood: 1, stone: 1, ore: 2, crystals: 5, fame: 1 };
const costValue = (c: Partial<Record<Res, number>>) => Object.entries(c).reduce((a, [k, v]) => a + (v ?? 0) * (VALUE[k as Res] ?? 2), 0);
const totalLevels = BUILDINGS.reduce((a, b) => a + maxLevel(b.id), 0);
const builtLevels = () => Object.values(getMeta().buildings).reduce((a, b) => a + b, 0);

/** Greedy city builder: always the cheapest affordable level (the player will do something smarter). */
function spend(): void {
  for (;;) {
    const opts = BUILDINGS.filter((b) => { const c = nextCost(b.id); return c && canAfford(c) && !blockedByTownHall(b.id); })
      .sort((a, b) => costValue(nextCost(a.id)!) - costValue(nextCost(b.id)!));
    if (!opts.length) return;
    build(opts[0].id);
  }
}

const reset = () => { const m = getMeta(); m.buildings = {}; m.res = Object.fromEntries(Object.keys(m.res).map((k) => [k, 0])) as typeof m.res; m.runs = 0; m.wins = 0; };
if (FULL) {
  reset();
  for (const b of BUILDINGS) getMeta().buildings[b.id] = maxLevel(b.id);
  for (const id of (process.env.SKIP ?? '').split(',').filter(Boolean)) getMeta().buildings[id] = 0;   // ablation
}

// per run index: act-1 success, run won, minutes; all campaigns together
const rows: { a1: number; a2: number; a3: number; won: number; min: number; lv: number }[] = [];
const doneAt: number[] = [];
for (let c = 0; c < CAMPAIGNS; c++) {
  if (!FULL) reset();
  let total = 0;
  for (let k = 0; k < MAX_RUNS; k++) {
    const heroes = HEROES.filter((h) => heroUnlocked(h.id));
    const hero = heroes[(k + c) % heroes.length];
    const res = simRun(hero.id, 5000 + c * 1000 + k);
    total += res.minutes;
    if (!FULL) spend();
    const row = (rows[k] ??= { a1: 0, a2: 0, a3: 0, won: 0, min: 0, lv: 0 });
    row.a1 += res.acts >= 1 ? 1 : 0; row.a2 += res.acts >= 2 ? 1 : 0; row.a3 += res.acts >= 3 ? 1 : 0; row.won += res.won ? 1 : 0;
    row.min += total; row.lv += builtLevels();
    if (!FULL && builtLevels() >= totalLevels && doneAt[c] === undefined) doneAt[c] = total;
  }
}
const pct = (v: number) => `${Math.round(100 * v / CAMPAIGNS)}%`.padStart(4);
console.log(`DIFFICULTY ${JSON.stringify(DIFFICULTY)}  campaigns ${CAMPAIGNS}  city levels total ${totalLevels}${FULL ? '  (FULL CITY)' : ''}`);
console.log('runs  | act1  act2  act3  won  | hours | city levels');
const step = FULL ? MAX_RUNS : 5;
for (let k = 0; k < rows.length; k += step) {
  const chunk = rows.slice(k, k + step);
  const n = chunk.length;
  const sum = (f: (r: typeof rows[0]) => number) => chunk.reduce((a, r) => a + f(r), 0) / n;
  const last = chunk[n - 1];
  console.log(`${String(k + 1).padStart(2)}-${String(k + n).padEnd(3)}| ${pct(sum((r) => r.a1))}  ${pct(sum((r) => r.a2))}  ${pct(sum((r) => r.a3))}  ${pct(sum((r) => r.won))} | ${(last.min / CAMPAIGNS / 60).toFixed(1).padStart(5)} | ${(last.lv / CAMPAIGNS).toFixed(0)}/${totalLevels}`);
}
if (!FULL) console.log('city complete after (hours):', doneAt.map((m) => (m / 60).toFixed(1)).join(', ') || 'not within ' + MAX_RUNS + ' runs');
