// Random armies from all units, AI vs AI: checks that no rule throws and battles end. Usage: npx tsx sim/fuzz.ts [n]
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import { PERKS } from '../src/run/perks';
import { combine } from '../src/battle/mods';
import { SPELLS } from '../src/battle/spells';
import type { Faction } from '../src/battle/types';
const SP = Object.keys(SPELLS);
const PEOPLES: Faction[] = ['human', 'elf', 'dwarf', 'undead', 'orc', 'demon'];
const ids = Object.keys(UNITS);
const N = Number(process.argv[2] ?? 400);
let ok = 0, stuck = 0; const used: Record<string, number> = {}; const spells: Record<string, number> = {};
let seed = 7;
const r = () => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed / 2 ** 31; };
for (let i = 0; i < N; i++) {
  // units of the peoples that have no data yet are simulated by re-labelling existing units (tests the people passives)
  const army = () => Array.from({ length: 1 + Math.floor(r() * 3) }, () => {
    let d = UNITS[ids[Math.floor(r() * ids.length)]];
    if (r() < 0.4) d = { ...d, faction: PEOPLES[Math.floor(r() * PEOPLES.length)] };
    return { def: d, count: Math.max(1, Math.round(150 / d.cost)) };
  });
  const hero = () => ({ atk: 1, def: 1, power: Math.floor(r() * 6), knowledge: 1 + Math.floor(r() * 5),
    spells: Array.from({ length: Math.floor(r() * 6) }, () => ({ id: SP[Math.floor(r() * SP.length)], level: 1 + Math.floor(r() * 3) }))
      .filter((x, j, a) => a.findIndex((y) => y.id === x.id) === j) });
  const mods = () => combine(...Array.from({ length: 6 }, () => PERKS[Math.floor(r() * PERKS.length)].mods ?? {}));
  const b = new Battle({ seed: i, obstacles: Battle.randomObstacles(i), player: { hero: hero(), army: army(), mods: mods() }, enemy: { hero: hero(), army: army(), mods: mods() } });
  let g = 0;
  try {
    while (!b.winner && g++ < 800) {
      b.nextTurn(); if (b.winner) break;
      for (const ev of b.aiCast(b.active!.side)) if (ev.type === 'cast') spells[ev.spell] = (spells[ev.spell] ?? 0) + 1;
      if (b.winner) break;
      const a = b.decide();
      if (a.type === 'ability') used[b.active!.def.active!] = (used[b.active!.def.active!] ?? 0) + 1;
      b.act(a);
    }
    if (b.winner) ok++; else { stuck++; console.log("stuck", i, b.round, b.alive.map((s) => `${s.side}:${s.def.id}(${s.def.faction})x${s.count} ${s.statuses.map((x) => x.id)}`).join(" | ")); }
  } catch (e) { console.log('ERROR battle', i, (e as Error).stack); process.exit(1); }
}
console.log(`ok ${ok}, stuck ${stuck}`);
console.log('abilities used:', used);
console.log('spells cast:', spells);
console.log('never cast:', SP.filter((x) => !spells[x]).join(', ') || '-');
