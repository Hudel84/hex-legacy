// Rule checks (v0.13): start-of-turn effects once per round (waiting / morale do not tick cooldowns or statuses
// again), at most one morale bonus turn per stack and round, morale and crit rates. Usage: npx tsx sim/turns_test.ts [n]
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import { combine } from '../src/battle/mods';
const ids = Object.keys(UNITS).filter((k) => !UNITS[k].sizeScale);
const N = Number(process.argv[2] ?? 300);
let seed = 11;
const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
let actions = 0, morales = 0, waits = 0, attacks = 0, crits = 0, fails = 0;
const fail = (m: string) => { if (fails++ < 10) console.log('FAIL', m); };
for (let i = 0; i < N; i++) {
  const army = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
    const d = UNITS[ids[Math.floor(r() * ids.length)]];
    return { def: d, count: Math.max(1, Math.round(150 / d.cost)) };
  });
  const hero = { atk: 1, def: 1, power: 0, knowledge: 0, spells: [], consumables: [] };
  const b = new Battle({ seed: i, obstacles: Battle.randomObstacles(i), player: { hero, army: army(), mods: combine() }, enemy: { hero, army: army(), mods: combine() } });
  // per round and stack: cooldown/status turns seen at the first activation, number of bonus turns
  let round = 0; const seen = new Map<number, { cd: number; st: string }>(); const bonus = new Map<number, number>();
  let g = 0;
  while (!b.winner && g++ < 800) {
    for (const ev of b.nextTurn()) if (ev.type === 'round') { round = ev.round; seen.clear(); bonus.clear(); }
    if (b.winner) break;
    const s = b.active!;
    const st = s.statuses.map((x) => `${x.id}:${x.turns}`).join(',');
    const prev = seen.get(s.uid);
    if (prev) {
      // a later activation in the same round: nothing may have ticked down
      if (s.cooldown < prev.cd) fail(`battle ${i} round ${round}: cooldown of ${s.def.id} fell ${prev.cd} -> ${s.cooldown} within the round`);
      const before = new Map(prev.st.split(',').filter(Boolean).map((x) => x.split(':') as [string, string]));
      for (const x of s.statuses) if (before.has(x.id) && x.turns < Number(before.get(x.id))) fail(`battle ${i}: status ${x.id} ticked twice in round ${round}`);
    }
    seen.set(s.uid, { cd: s.cooldown, st });
    // wait sometimes (the AI rarely does) to test the wait path
    const a = !s.waited && r() < 0.25 ? { type: 'wait' as const } : b.decide();
    const evs = b.act(a);
    if (a.type === 'wait') waits++;
    else if (a.type !== 'defend') actions++;
    for (const ev of evs) {
      if (ev.type === 'morale') { morales++; const n = (bonus.get(ev.uid) ?? 0) + 1; bonus.set(ev.uid, n); if (n > 1) fail(`battle ${i}: two morale turns in round ${round}`); }
      if (ev.type === 'attack' && !ev.counter) { attacks++; if (ev.crit) crits++; }
    }
  }
  if (!b.winner) fail(`battle ${i} did not end`);
}
console.log(`battles ${N}, actions ${actions}, waits ${waits}, morale ${morales} (${(100 * morales / actions).toFixed(1)} %), attacks ${attacks}, crits ${crits} (${(100 * crits / attacks).toFixed(1)} %)`);
console.log(fails ? `FAILED ${fails}` : 'all rules ok');
