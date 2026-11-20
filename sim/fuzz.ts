// Random armies from all units, AI vs AI: checks that no rule throws and battles end. Usage: npx tsx sim/fuzz.ts [n]
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import { PERKS } from '../src/run/perks';
import { combine } from '../src/battle/mods';
const ids = Object.keys(UNITS);
const N = Number(process.argv[2] ?? 400);
let ok = 0, stuck = 0; const used: Record<string, number> = {};
let seed = 7;
const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
for (let i = 0; i < N; i++) {
  const army = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => { const d = UNITS[ids[Math.floor(r() * ids.length)]]; return { def: d, count: Math.max(1, Math.round(150 / d.cost)) }; });
  const mods = () => combine(...Array.from({ length: 6 }, () => PERKS[Math.floor(r() * PERKS.length)].mods ?? {}));
  const b = new Battle({ seed: i, obstacles: Battle.randomObstacles(i), player: { hero: { atk: 1, def: 1 }, army: army(), mods: mods() }, enemy: { hero: { atk: 1, def: 1 }, army: army(), mods: mods() } });
  let g = 0;
  try {
    while (!b.winner && g++ < 800) {
      b.nextTurn(); if (b.winner) break;
      const a = b.decide();
      if (a.type === 'ability') used[b.active!.def.active!] = (used[b.active!.def.active!] ?? 0) + 1;
      b.act(a);
    }
    if (b.winner) ok++; else stuck++;
  } catch (e) { console.log('ERROR battle', i, (e as Error).stack); process.exit(1); }
}
console.log(`ok ${ok}, stuck ${stuck}`);
console.log('abilities used:', used);
