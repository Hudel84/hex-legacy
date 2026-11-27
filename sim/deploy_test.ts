// Tactics set-up rules (v0.18): random formations and moves never leave the zone, never overlap,
// and the battle still runs to the end. Usage: npx tsx sim/deploy_test.ts [battles]
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import { key } from '../src/battle/hex';
import { Rng } from '../src/run/rng';

const N = Number(process.argv[2] ?? 300);
const ids = Object.keys(UNITS).filter((id) => !id.startsWith('summon_') && !id.includes('treasure') && !id.startsWith('boss_final'));
const wideIds = ids.filter((id) => UNITS[id].wide);
let moves = 0, okMoves = 0, fails = 0;
const fail = (m: string) => { fails++; if (fails < 10) console.log('FAIL', m); };
for (let i = 0; i < N; i++) {
  const g = new Rng(31 + i);
  const cols = g.int(2, 4);
  const n = g.int(1, 3);
  const pick = () => (g.next() < 0.25 && wideIds.length ? g.pick(wideIds) : g.pick(ids));
  const army = Array.from({ length: n }, () => ({ def: UNITS[pick()], count: g.int(2, 20) }));
  const playerPos = army.map(() => (g.next() < 0.7 ? { col: g.int(0, cols - 1), row: g.int(0, 6) } : null));
  const seed = 1000 + i;
  const b = new Battle({ seed, obstacles: Battle.randomObstacles(seed, 3), deployCols: cols, playerPos,
    player: { hero: { atk: 1, def: 1 }, army }, enemy: { hero: { atk: 1, def: 1 }, army: [{ def: UNITS[g.pick(ids)], count: g.int(2, 20) }] } });
  const check = (what: string) => {
    const seen = new Set<string>();
    for (const s of b.stacks.filter((x) => x.side === 'player')) for (const c of b.cells(s)) {
      if (!b.inDeployZone(c, cols)) fail(`${what}: ${s.def.id} outside zone at ${key(c)} (cols ${cols})`);
      if (seen.has(key(c))) fail(`${what}: overlap at ${key(c)}`);
      seen.add(key(c));
    }
  };
  check('formation');
  for (let m = 0; m < 6; m++) {
    const own = b.stacks.filter((x) => x.side === 'player');
    const s = g.pick(own);
    const h = { col: g.int(0, cols), row: g.int(0, 6) };   // sometimes one column outside the zone
    const can = b.canDeploy(s.uid, h, cols);
    const before = own.map((x) => key(x.pos)).join(' ');
    const did = b.deploy(s.uid, h, cols);
    moves++; if (did) okMoves++;
    if (can !== did) fail(`canDeploy ${can} but deploy ${did}`);
    if (!did && own.map((x) => key(x.pos)).join(' ') !== before) fail('refused move changed positions');
    check('move');
  }
  let k = 0;
  while (!b.winner && k++ < 600) { b.nextTurn(); if (b.winner) break; b.act(b.decide()); }
  if (b.deploy(b.stacks[0].uid, { col: 0, row: 0 }, cols) && b.round > 0) fail('deploy allowed after the start');
}
console.log(`battles ${N}, moves ${moves} (${okMoves} allowed), failures ${fails}`);
if (fails) process.exit(1);
