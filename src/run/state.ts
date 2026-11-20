// Run state: everything about the current run, saved to localStorage after every node.
import { UNITS } from '../data/units';
import type { UnitDef } from '../battle/types';
import { generateMap, type MapNode } from './mapgen';
import { heroById } from './heroes';
import { Rng } from './rng';
import { bonus, unitUnlocked, type Res } from '../meta/meta';

export const MAX_SLOTS = 3;
export const MAX_UNIT_LEVEL = 2;

export interface ArmySlot { unitId: string; alloc: number; level: number; }

export interface RunState {
  version: 1;
  seed: number;
  rngState: number;
  act: number;
  biome: string;
  heroId: string;
  atk: number;
  def: number;
  leadership: number;
  level: number;
  xp: number;
  gold: number;
  army: ArmySlot[];
  map: MapNode[];
  currentNode: number | null;
  visited: number[];
  shopBuys: number;
  battlesWon: number;
  pending?: { kind: 'reward'; nodeId: number } | null;
  seenEvents?: string[];
  loot: Partial<Record<Res, number>>;
}

const KEY = 'hexlegacy.run.v1';
export const ACT1_BIOMES = ['meadows', 'autumn_forest', 'rocky_coast'];

export function newRun(heroId: string, seed = Math.floor(Math.random() * 2 ** 31)): RunState {
  const hero = heroById(heroId);
  const rng = new Rng(seed);
  const biome = rng.pick(ACT1_BIOMES);
  const leadership = hero.leadership + bonus.leadership();
  const share = Math.floor(leadership / hero.startArmy.length);
  return {
    version: 1, seed, rngState: seed ^ 0x51f15e, act: 1, biome,
    heroId, atk: hero.atk + bonus.atk(), def: hero.def + bonus.def(), leadership, level: 1, xp: 0, gold: 60 + bonus.startGold(),
    army: hero.startArmy.map((unitId, i) => ({ unitId, alloc: share, level: i < bonus.smithy() ? 1 : 0 })),
    map: generateMap(seed), currentNode: null, visited: [], shopBuys: 0, battlesWon: 0, pending: null, loot: {},
  };
}

let current: RunState | null = null;

export function run(): RunState {
  if (!current) throw new Error('no run');
  return current;
}
export function setRun(r: RunState | null): void { current = r; save(); }

export function save(): void {
  try {
    if (current) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch { /* ignore */ }
}

export function hasSave(): boolean {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}

export function loadSave(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const r = JSON.parse(raw) as RunState;
    if (r.version !== 1) return false;
    current = r;
    return true;
  } catch { return false; }
}

export function rng(): Rng {
  const r = new Rng(run().rngState);
  // the caller uses it right away; store the advanced state afterwards via commitRng
  return r;
}
export function commitRng(r: Rng): void { run().rngState = r.state; }

// ---------- army ----------

export const unitDef = (id: string): UnitDef => UNITS[id];

export function count(slot: ArmySlot): number {
  return Math.floor(slot.alloc / unitDef(slot.unitId).cost);
}

export function freeLeadership(r = run()): number {
  return r.leadership - r.army.reduce((a, s) => a + s.alloc, 0);
}

/** Unit stats with the slot's upgrade level applied (+12 % HP and damage per level). */
export function upgradedDef(slot: ArmySlot): UnitDef {
  const d = unitDef(slot.unitId);
  if (!slot.level) return d;
  const m = 1 + 0.12 * slot.level;
  return {
    ...d, level: slot.level,
    hp: Math.round(d.hp * m),
    dmg: [Math.max(1, Math.round(d.dmg[0] * m)), Math.max(1, Math.round(d.dmg[1] * m))],
    atk: d.atk + slot.level, def: d.def + slot.level,
  };
}

/** Split all leadership evenly over the slots (used when the army changes). */
export function rebalance(r = run()): void {
  if (!r.army.length) return;
  const share = Math.floor(r.leadership / r.army.length);
  for (const s of r.army) s.alloc = share;
}

/** Give newly gained leadership to the slots (evenly). */
export function addLeadership(n: number, r = run()): void {
  r.leadership += n;
  if (!r.army.length) return;
  const per = Math.floor(n / r.army.length);
  for (const s of r.army) s.alloc += per;
}

/** Move leadership between a slot and the free pool, in steps of one unit. */
export function shiftAlloc(slotIdx: number, dir: 1 | -1, r = run()): boolean {
  const s = r.army[slotIdx];
  const cost = unitDef(s.unitId).cost;
  if (dir > 0) {
    if (freeLeadership(r) < cost) {
      // take from the slot with the most leadership above one unit
      const donor = r.army
        .map((o, i) => ({ o, i }))
        .filter(({ o, i }) => i !== slotIdx && count(o) > 1)
        .sort((a, b) => b.o.alloc - a.o.alloc)[0];
      if (!donor) return false;
      const dcost = unitDef(donor.o.unitId).cost;
      let freed = 0;
      while (freeLeadership(r) + freed < cost && count({ ...donor.o, alloc: donor.o.alloc - freed - dcost }) >= 1) freed += dcost;
      if (freeLeadership(r) + freed < cost) return false;
      donor.o.alloc -= freed;
    }
    s.alloc += cost;
    return true;
  }
  if (count(s) <= 1) return false;
  s.alloc -= cost;
  return true;
}

// ---------- hero progression ----------

export const xpForLevel = (lvl: number): number => 15 * lvl * (lvl + 1) / 2 + 5 * (lvl - 1);

/** Adds xp, returns how many level-ups happened. */
export function gainXp(n: number, r = run()): number {
  r.xp += n;
  let ups = 0;
  while (r.xp >= xpForLevel(r.level)) {
    r.xp -= xpForLevel(r.level);
    r.level++;
    ups++;
    addLeadership(5, r);
  }
  return ups;
}

export type Boon = 'atk2' | 'def2' | 'lead20' | 'atkdef' | 'gold60';
export const BOONS: Boon[] = ['atk2', 'def2', 'lead20', 'atkdef', 'gold60'];

export function applyBoon(b: Boon, r = run()): void {
  switch (b) {
    case 'atk2': r.atk += 2; break;
    case 'def2': r.def += 2; break;
    case 'lead20': addLeadership(20, r); break;
    case 'atkdef': r.atk += 1; r.def += 1; break;
    case 'gold60': r.gold += 60; break;
  }
}

// ---------- map helpers ----------

export function nodeById(id: number, r = run()): MapNode { return r.map.find((n) => n.id === id)!; }

export function availableNodes(r = run()): MapNode[] {
  if (r.currentNode === null) return r.map.filter((n) => n.floor === 0);
  return nodeById(r.currentNode, r).next.map((id) => nodeById(id, r));
}

export function draftPool(faction: string, floor: number): string[] {
  const maxTier = floor < 3 ? 3 : floor < 7 ? 4 : 5;
  return Object.values(UNITS).filter((u) => u.faction === faction && u.tier <= maxTier && unitUnlocked(u.id)).map((u) => u.id);
}

/** Meta resources found during the run (transferred to the city at the end). */
export function addLoot(gain: Partial<Record<Res, number>>, r = run()): void {
  r.loot ??= {};
  for (const [k, v] of Object.entries(gain) as [Res, number][]) r.loot[k] = (r.loot[k] ?? 0) + v;
}

export function lootFor(type: string, floor: number): Partial<Record<Res, number>> {
  switch (type) {
    case 'boss': return { wood: 5, stone: 5, ore: 5, crystals: 4, seal: 5 };
    case 'elite': return { wood: 2, stone: 2, ore: 3, crystals: 1, seal: 2 };
    case 'treasure': return { wood: 3, stone: 3, ore: 1 };
    default: return { wood: 4 + Math.floor(floor / 3), stone: 3 + Math.floor(floor / 4), seal: 1 };
  }
}
