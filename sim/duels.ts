// Equal-leadership duels between two unit types, both side orders. Usage: npx tsx sim/duels.ts
import { Battle } from '../src/battle/engine';
import { UNITS } from '../src/data/units';
import type { UnitDef } from '../src/battle/types';

const LEAD = Number(process.argv[2] ?? 280);
const N = 300;
const MELEE = process.argv[3] === 'adjacent';
function run(a: UnitDef, b: UnitDef): number {
  let aw = 0;
  for (const flip of [false, true]) for (let i = 0; i < N; i++) {
    const A = { hero: { atk: 0, def: 0 }, army: [{ def: a, count: Math.max(1, Math.floor(LEAD / a.cost)) }] };
    const B = { hero: { atk: 0, def: 0 }, army: [{ def: b, count: Math.max(1, Math.floor(LEAD / b.cost)) }] };
    const bt = new Battle({ seed: i * 7 + (flip ? 1 : 0), player: flip ? B : A, enemy: flip ? A : B, obstacles: [], startCols: MELEE ? [3, 4] : undefined });
    let g = 0;
    while (!bt.winner && g++ < 400) { bt.nextTurn(); if (bt.winner) break; bt.act(bt.decide()); }
    if (bt.winner === (flip ? 'enemy' : 'player')) aw++;
  }
  return aw / (2 * N);
}
const ids = Object.keys(UNITS);
const pad = (s: string, n: number) => s.padEnd(n);
for (let t = 1; t <= 6; t++) {
  const h = UNITS[ids.find((i) => i.startsWith(`human_t${t}`))!];
  const u = UNITS[ids.find((i) => i.startsWith(`undead_t${t}`))!];
  console.log(`T${t} ${pad(h.id, 24)} vs ${pad(u.id, 22)} human win ${(100 * run(h, u)).toFixed(0)}%`);
}
