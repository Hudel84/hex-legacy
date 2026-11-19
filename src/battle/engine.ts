// Battle rules, independent of Phaser so they can be simulated headless.
// Follows GDD chapter 3: stacks, initiative, damage formula 3.3, one counter per round.
import { type Hex, key, eq, neighbors, distance, inBounds, allHexes, COLS, ROWS } from './hex';
import type { UnitDef, Stack, Side, HeroStats, BattleEvent } from './types';

export interface ArmySetup { hero: HeroStats; army: { def: UnitDef; count: number }[]; }
export interface BattleSetup { player: ArmySetup; enemy: ArmySetup; seed?: number; obstacles?: Hex[]; startCols?: [number, number]; }

export interface AttackPreview { minDmg: number; maxDmg: number; minKills: number; maxKills: number; }

export type Action =
  | { type: 'move'; to: Hex }
  | { type: 'melee'; target: number; from: Hex }
  | { type: 'shoot'; target: number }
  | { type: 'wait' }
  | { type: 'defend' };

/** Small deterministic RNG (mulberry32) so battles can be replayed and simulated. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const START_ROWS: Record<number, number[]> = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [0, 2, 4, 6] };

export class Battle {
  stacks: Stack[] = [];
  heroes: Record<Side, HeroStats>;
  obstacles = new Set<string>();
  round = 0;
  activeUid = -1;
  winner: Side | null = null;
  private queue: number[] = [];
  private waitQueue: number[] = [];
  private random: () => number;

  constructor(setup: BattleSetup) {
    this.random = rng(setup.seed ?? Date.now());
    this.heroes = { player: setup.player.hero, enemy: setup.enemy.hero };
    let uid = 1;
    for (const side of ['player', 'enemy'] as Side[]) {
      const army = setup[side].army;
      const rows = START_ROWS[army.length] ?? START_ROWS[3];
      army.forEach((a, i) => {
        this.stacks.push({
          uid: uid++, def: a.def, side, count: a.count, startCount: a.count, topHp: a.def.hp,
          pos: { col: side === 'player' ? (setup.startCols?.[0] ?? 0) : (setup.startCols?.[1] ?? COLS - 1), row: rows[i] ?? i },
          shots: a.def.ranged ?? 0, retaliated: false, defending: false, waited: false, acted: false,
        });
      });
    }
    for (const h of setup.obstacles ?? []) this.obstacles.add(key(h));
  }

  // ---------- queries ----------

  get alive(): Stack[] { return this.stacks.filter((s) => s.count > 0); }
  stack(uid: number): Stack { return this.stacks.find((s) => s.uid === uid)!; }
  get active(): Stack | undefined { return this.stacks.find((s) => s.uid === this.activeUid); }
  stackAt(h: Hex): Stack | undefined { return this.alive.find((s) => eq(s.pos, h)); }
  isFree(h: Hex): boolean { return inBounds(h) && !this.obstacles.has(key(h)) && !this.stackAt(h); }
  enemiesOf(s: Stack): Stack[] { return this.alive.filter((o) => o.side !== s.side); }
  alliesOf(s: Stack): Stack[] { return this.alive.filter((o) => o.side === s.side && o.uid !== s.uid); }
  has(s: Stack, passive: string): boolean { return !!s.def.passives?.includes(passive); }

  /** Upcoming turn order: rest of this round, then the next round. */
  turnOrder(max = 12): { uid: number; nextRound: boolean }[] {
    const out: { uid: number; nextRound: boolean }[] = [];
    const cur = [this.activeUid, ...this.queue, ...this.waitQueue].filter((u) => u > 0 && this.stack(u).count > 0);
    for (const u of cur) out.push({ uid: u, nextRound: false });
    for (const u of this.initiativeOrder()) out.push({ uid: u, nextRound: true });
    return out.slice(0, max);
  }

  /** Hexes the stack can move to this turn, with the path to each. */
  reachable(s: Stack): Map<string, Hex[]> {
    const res = new Map<string, Hex[]>();
    if (s.def.flying) {
      for (const h of allHexes()) {
        const d = distance(s.pos, h);
        if (d > 0 && d <= s.def.speed && this.isFree(h)) res.set(key(h), [h]);
      }
      return res;
    }
    const frontier: { h: Hex; path: Hex[] }[] = [{ h: s.pos, path: [] }];
    const seen = new Set([key(s.pos)]);
    while (frontier.length) {
      const { h, path } = frontier.shift()!;
      if (path.length >= s.def.speed) continue;
      for (const n of neighbors(h)) {
        const k = key(n);
        if (seen.has(k) || !this.isFree(n)) continue;
        seen.add(k);
        const p = [...path, n];
        res.set(k, p);
        frontier.push({ h: n, path: p });
      }
    }
    return res;
  }

  adjacentEnemies(s: Stack): Stack[] {
    return this.enemiesOf(s).filter((e) => distance(e.pos, s.pos) === 1);
  }

  canShoot(s: Stack): boolean {
    return !!s.def.ranged && s.shots > 0 && this.adjacentEnemies(s).length === 0;
  }

  /** Hexes from which `s` can melee `target` (its own hex or a reachable neighbour of the target). */
  meleeFrom(s: Stack, target: Stack, reach = this.reachable(s)): Hex[] {
    return neighbors(target.pos).filter((n) => eq(n, s.pos) || reach.has(key(n)));
  }

  // ---------- damage ----------

  private effAtk(att: Stack, at: Hex): number {
    let a = att.def.atk + this.heroes[att.side].atk;
    if (this.has(att, 'formation')) {
      a += this.alliesOf(att).filter((o) => distance(o.pos, at) === 1).length;
    }
    return a;
  }

  private effDef(def: Stack, attacker: Stack, ranged: boolean): number {
    let d = def.def.def + this.heroes[def.side].def;
    if (def.defending) d = Math.ceil(d * 1.3);
    if (ranged && this.has(attacker, 'pierce')) d = Math.max(0, d - 1);
    return d;
  }

  /** Multiplier without the random roll. */
  private multiplier(att: Stack, def: Stack, ranged: boolean, at: Hex): number {
    let m = 1 + 0.05 * (this.effAtk(att, at) - this.effDef(def, att, ranged));
    m = Math.min(4, Math.max(0.5, m));
    if (this.has(att, 'holyBane') && (def.def.undead || def.def.faction === 'demon')) m *= 1.3;
    if (this.has(def, 'ethereal')) m *= 0.5;
    if (!ranged && att.def.ranged) m *= 0.5;   // shooters are weak in melee
    return m;
  }

  private killsFor(def: Stack, dmg: number): number {
    const total = (def.count - 1) * def.def.hp + def.topHp;
    if (dmg >= total) return def.count;
    const left = total - dmg;
    return def.count - Math.ceil(left / def.def.hp);
  }

  preview(att: Stack, def: Stack, ranged: boolean, at: Hex = att.pos): AttackPreview {
    const m = this.multiplier(att, def, ranged, at);
    const minDmg = Math.max(1, Math.round(att.count * att.def.dmg[0] * m));
    const maxDmg = Math.max(1, Math.round(att.count * att.def.dmg[1] * m));
    return { minDmg, maxDmg, minKills: this.killsFor(def, minDmg), maxKills: this.killsFor(def, maxDmg) };
  }

  private roll(att: Stack, def: Stack, ranged: boolean): number {
    const [lo, hi] = att.def.dmg;
    // sum of individual rolls for small stacks, averaged roll for big ones
    let base = 0;
    const n = Math.min(att.count, 10);
    for (let i = 0; i < n; i++) base += lo + Math.floor(this.random() * (hi - lo + 1));
    base = (base / n) * att.count;
    return Math.max(1, Math.round(base * this.multiplier(att, def, ranged, att.pos)));
  }

  private strike(att: Stack, def: Stack, ranged: boolean, counter: boolean): BattleEvent[] {
    const dmg = this.roll(att, def, ranged);
    const kills = this.killsFor(def, dmg);
    const total = (def.count - 1) * def.def.hp + def.topHp - dmg;
    if (total <= 0) { def.count = 0; def.topHp = 0; }
    else { def.count = Math.ceil(total / def.def.hp); def.topHp = total - (def.count - 1) * def.def.hp; }
    const ev: BattleEvent[] = [{ type: 'attack', uid: att.uid, target: def.uid, ranged, counter, damage: dmg, kills, left: def.count }];
    if (this.has(att, 'lifesteal') && att.count > 0) {
      const heal = Math.floor(dmg * 0.3);
      const before = att.count;
      const cur = (att.count - 1) * att.def.hp + att.topHp;
      const max = att.startCount * att.def.hp;
      const nt = Math.min(max, cur + heal);
      att.count = Math.ceil(nt / att.def.hp);
      att.topHp = nt - (att.count - 1) * att.def.hp;
      if (nt > cur) ev.push({ type: 'heal', uid: att.uid, amount: nt - cur, count: att.count });
      void before;
    }
    if (def.count === 0) ev.push({ type: 'death', uid: def.uid });
    return ev;
  }

  // ---------- turn flow ----------

  private initiativeOrder(): number[] {
    return this.alive
      .slice()
      .sort((a, b) => b.def.ini - a.def.ini || (a.side === 'player' ? -1 : 1) - (b.side === 'player' ? -1 : 1) || a.uid - b.uid)
      .map((s) => s.uid);
  }

  private startRound(): BattleEvent[] {
    this.round++;
    for (const s of this.alive) { s.retaliated = false; s.waited = false; s.acted = false; }
    this.queue = this.initiativeOrder();
    this.waitQueue = [];
    return [{ type: 'round', round: this.round }];
  }

  /** Advance to the next stack that may act. Returns events (round start, auras, turn). */
  nextTurn(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.checkEnd(ev)) return ev;
    for (;;) {
      if (!this.queue.length && !this.waitQueue.length) ev.push(...this.startRound());
      const uid = this.queue.length ? this.queue.shift()! : this.waitQueue.shift()!;
      const s = this.stack(uid);
      if (s.count <= 0) continue;
      this.activeUid = uid;
      s.defending = false;
      if (this.has(s, 'healAura')) {
        for (const a of this.alliesOf(s).filter((o) => distance(o.pos, s.pos) === 1)) {
          const missing = a.def.hp - a.topHp;
          const amount = Math.min(missing, Math.ceil(a.def.hp * 0.25) * s.count);
          if (amount > 0) { a.topHp += amount; ev.push({ type: 'heal', uid: a.uid, amount, count: a.count }); }
        }
      }
      ev.push({ type: 'turn', uid });
      return ev;
    }
  }

  private checkEnd(ev: BattleEvent[]): boolean {
    if (this.winner) return true;
    const p = this.alive.some((s) => s.side === 'player');
    const e = this.alive.some((s) => s.side === 'enemy');
    if (p && e) return false;
    this.winner = p ? 'player' : 'enemy';
    ev.push({ type: 'end', winner: this.winner });
    return true;
  }

  /** Is this action legal for the active stack? */
  isLegal(a: Action): boolean {
    const s = this.active;
    if (!s || this.winner) return false;
    switch (a.type) {
      case 'move': return this.reachable(s).has(key(a.to));
      case 'shoot': { const t = this.stack(a.target); return !!t && t.count > 0 && t.side !== s.side && this.canShoot(s); }
      case 'melee': {
        const t = this.stack(a.target);
        if (!t || t.count <= 0 || t.side === s.side || distance(a.from, t.pos) !== 1) return false;
        return eq(a.from, s.pos) || this.reachable(s).has(key(a.from));
      }
      case 'wait': return !s.waited;
      case 'defend': return true;
    }
  }

  /** Perform an action for the active stack. Returns the events that happened (without the next turn). */
  act(a: Action): BattleEvent[] {
    const s = this.active!;
    if (!this.isLegal(a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
    const ev: BattleEvent[] = [];
    switch (a.type) {
      case 'move': {
        ev.push({ type: 'move', uid: s.uid, path: this.reachable(s).get(key(a.to))! });
        s.pos = a.to;
        break;
      }
      case 'shoot': {
        s.shots--;
        ev.push(...this.strike(s, this.stack(a.target), true, false));
        break;
      }
      case 'melee': {
        const t = this.stack(a.target);
        if (!eq(a.from, s.pos)) {
          ev.push({ type: 'move', uid: s.uid, path: this.reachable(s).get(key(a.from))! });
          s.pos = a.from;
        }
        ev.push(...this.strike(s, t, false, false));
        if (t.count > 0 && !t.retaliated && !this.has(s, 'noRetaliation')) {
          t.retaliated = true;
          ev.push(...this.strike(t, s, false, true));
        }
        break;
      }
      case 'wait': {
        s.waited = true;
        this.waitQueue.push(s.uid);
        ev.push({ type: 'wait', uid: s.uid });
        this.activeUid = -1;
        return ev;
      }
      case 'defend': {
        s.defending = true;
        ev.push({ type: 'defend', uid: s.uid });
        break;
      }
    }
    s.acted = true;
    this.activeUid = -1;
    this.checkEnd(ev);
    return ev;
  }

  // ---------- AI ----------

  private value(s: Stack): number { return s.def.cost; }

  /** Pick an action for the active stack (used for the enemy and for simulations). */
  decide(): Action {
    const s = this.active!;
    const enemies = this.enemiesOf(s);
    const expected = (p: AttackPreview) => (p.minKills + p.maxKills) / 2;

    if (this.canShoot(s)) {
      let best = enemies[0];
      let bestScore = -1;
      for (const e of enemies) {
        const sc = expected(this.preview(s, e, true)) * this.value(e) + (e.def.ranged ? 5 : 0);
        if (sc > bestScore) { bestScore = sc; best = e; }
      }
      return { type: 'shoot', target: best.uid };
    }

    const reach = this.reachable(s);
    let bestAct: Action | null = null;
    let bestScore = -Infinity;
    for (const e of enemies) {
      for (const from of this.meleeFrom(s, e, reach)) {
        if (s.def.ranged && !eq(from, s.pos)) continue; // shooters don't run into melee
        const p = this.preview(s, e, false, from);
        let sc = expected(p) * this.value(e) + 1;
        if (!e.retaliated && !this.has(s, 'noRetaliation') && expected(p) < e.count) {
          // rough counter estimate against us
          const counterKills = Math.min(s.count, (this.preview(e, s, false, e.pos).minKills));
          sc -= counterKills * this.value(s) * 0.5;
        }
        sc -= distance(s.pos, from) * 0.01; // prefer short walks
        if (sc > bestScore) { bestScore = sc; bestAct = { type: 'melee', target: e.uid, from }; }
      }
    }
    if (bestAct) return bestAct;

    // shooters out of ammo or blocked with nothing in reach: defend
    if (s.def.ranged && s.shots > 0) return { type: 'defend' };

    // move towards the most valuable reachable-ish enemy
    let target = enemies[0];
    for (const e of enemies) if (distance(s.pos, e.pos) < distance(s.pos, target.pos)) target = e;
    let bestHex: Hex | null = null;
    let bestD = distance(s.pos, target.pos);
    for (const [, path] of reach) {
      const h = path[path.length - 1];
      const d = distance(h, target.pos);
      if (d < bestD) { bestD = d; bestHex = h; }
    }
    if (bestHex) return { type: 'move', to: bestHex };
    return { type: 'defend' };
  }

  /** Random obstacle layout in the middle columns (never on start columns). */
  static randomObstacles(seed: number, n = 3): Hex[] {
    const r = rng(seed ^ 0x9e3779b9);
    const out: Hex[] = [];
    while (out.length < n) {
      const h = { col: 2 + Math.floor(r() * (COLS - 4)), row: Math.floor(r() * ROWS) };
      if (!out.some((o) => eq(o, h))) out.push(h);
    }
    return out;
  }
}
