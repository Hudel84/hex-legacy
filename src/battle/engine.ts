// Battle rules, independent of Phaser so they can be simulated headless.
// Follows GDD chapter 3: stacks, initiative, damage formula 3.3, one counter per round,
// unit passives and active abilities with cooldowns (3.8).
import { type Hex, key, eq, neighbors, distance, inBounds, allHexes, behind, COLS, ROWS } from './hex';
import type { UnitDef, Stack, Side, HeroStats, BattleEvent, StatusId } from './types';

export interface ArmySetup { hero: HeroStats; army: { def: UnitDef; count: number }[]; }
export interface BattleSetup { player: ArmySetup; enemy: ArmySetup; seed?: number; obstacles?: Hex[]; startCols?: [number, number]; }

export interface AttackPreview { minDmg: number; maxDmg: number; minKills: number; maxKills: number; }

export type Action =
  | { type: 'move'; to: Hex }
  | { type: 'melee'; target: number; from: Hex }
  | { type: 'shoot'; target: number }
  | { type: 'ability'; target?: number }
  | { type: 'wait' }
  | { type: 'defend' };

export type AbilityTarget = 'self' | 'enemy' | 'ally';
export interface AbilityInfo { id: string; cooldown: number; target: AbilityTarget; }

/** Active abilities: id -> cooldown and what it targets. Effects live in Battle.useAbility. */
export const ABILITIES: Record<string, AbilityInfo> = {
  spearWall: { id: 'spearWall', cooldown: 3, target: 'self' },
  aimedShot: { id: 'aimedShot', cooldown: 3, target: 'enemy' },
  shieldFormation: { id: 'shieldFormation', cooldown: 4, target: 'self' },
  revival: { id: 'revival', cooldown: 4, target: 'ally' },
  dive: { id: 'dive', cooldown: 3, target: 'enemy' },
  holyStrike: { id: 'holyStrike', cooldown: 4, target: 'self' },
  boneSwarm: { id: 'boneSwarm', cooldown: 99, target: 'self' },
  rotStench: { id: 'rotStench', cooldown: 3, target: 'self' },
  disembody: { id: 'disembody', cooldown: 4, target: 'self' },
  bloodFrenzy: { id: 'bloodFrenzy', cooldown: 3, target: 'enemy' },
  deathWave: { id: 'deathWave', cooldown: 4, target: 'enemy' },
  decayBreath: { id: 'decayBreath', cooldown: 3, target: 'enemy' },
};

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

interface StrikeOpts { mult?: number; ignoreDefend?: boolean; noLifesteal?: boolean; kind?: 'normal' | 'counter' | 'first' | 'area' }

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
  private nextUid = 1;

  constructor(setup: BattleSetup) {
    this.random = rng(setup.seed ?? Date.now());
    this.heroes = { player: setup.player.hero, enemy: setup.enemy.hero };
    for (const side of ['player', 'enemy'] as Side[]) {
      const army = setup[side].army;
      const rows = START_ROWS[army.length] ?? START_ROWS[3];
      army.forEach((a, i) => {
        // wide (two-hex) units stand one column further in so their back half fits on the board
        const col = side === 'player' ? (setup.startCols?.[0] ?? 0) + (a.def.wide ? 1 : 0) : (setup.startCols?.[1] ?? COLS - 1) - (a.def.wide ? 1 : 0);
        this.addStack(a.def, side, a.count, { col, row: rows[i] ?? i });
      });
    }
    for (const h of setup.obstacles ?? []) this.obstacles.add(key(h));
  }

  private addStack(def: UnitDef, side: Side, count: number, pos: Hex): Stack {
    const s: Stack = {
      uid: this.nextUid++, def, side, count, startCount: count, topHp: def.hp, pos,
      shots: def.ranged ?? 0, retaliated: false, defending: false, waited: false, acted: false,
      cooldown: 0, statuses: [],
    };
    this.stacks.push(s);
    return s;
  }

  // ---------- queries ----------

  get alive(): Stack[] { return this.stacks.filter((s) => s.count > 0); }
  stack(uid: number): Stack { return this.stacks.find((s) => s.uid === uid)!; }
  get active(): Stack | undefined { return this.stacks.find((s) => s.uid === this.activeUid); }
  /** Hexes a stack covers when its head stands on `pos` (wide units also cover the hex behind them). */
  cells(s: Stack, pos: Hex = s.pos): Hex[] {
    return s.def.wide ? [pos, { col: pos.col + (s.side === 'enemy' ? 1 : -1), row: pos.row }] : [pos];
  }
  /** Distance between two stacks (or a stack placed at `at`), using their nearest covered hexes. */
  sdist(a: Stack, b: Stack, aAt: Hex = a.pos): number {
    let d = Infinity;
    for (const x of this.cells(a, aAt)) for (const y of this.cells(b)) d = Math.min(d, distance(x, y));
    return d;
  }
  stackAt(h: Hex): Stack | undefined { return this.alive.find((s) => this.cells(s).some((c) => eq(c, h))); }
  isFree(h: Hex, ignore?: Stack): boolean {
    if (!inBounds(h) || this.obstacles.has(key(h))) return false;
    const o = this.stackAt(h);
    return !o || o === ignore;
  }
  /** Can stack `s` stand with its head on `pos`? */
  fits(s: Stack, pos: Hex): boolean { return this.cells(s, pos).every((c) => this.isFree(c, s)); }
  enemiesOf(s: Stack): Stack[] { return this.alive.filter((o) => o.side !== s.side); }
  alliesOf(s: Stack): Stack[] { return this.alive.filter((o) => o.side === s.side && o.uid !== s.uid); }
  has(s: Stack, passive: string): boolean { return !!s.def.passives?.includes(passive); }
  status(s: Stack, id: StatusId): number { return s.statuses.find((x) => x.id === id)?.value ?? 0; }
  hasStatus(s: Stack, id: StatusId): boolean { return s.statuses.some((x) => x.id === id); }
  /** Disembodied ghosts cannot be attacked. */
  targetable(s: Stack): boolean { return s.count > 0 && !this.hasStatus(s, 'disembodied'); }

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
        if (d > 0 && d <= s.def.speed && this.fits(s, h)) res.set(key(h), [h]);
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
        if (seen.has(k) || !this.fits(s, n)) continue;
        seen.add(k);
        const p = [...path, n];
        res.set(k, p);
        frontier.push({ h: n, path: p });
      }
    }
    return res;
  }

  adjacentEnemies(s: Stack, at: Hex = s.pos): Stack[] {
    return this.enemiesOf(s).filter((e) => this.sdist(s, e, at) === 1);
  }
  adjacentAllies(s: Stack, at: Hex = s.pos): Stack[] {
    return this.alliesOf(s).filter((o) => this.sdist(s, o, at) === 1);
  }

  canShoot(s: Stack): boolean {
    return !!s.def.ranged && s.shots > 0 && this.adjacentEnemies(s).filter((e) => this.targetable(e)).length === 0;
  }

  /** Hexes from which `s` can melee `target` (its own hex or a reachable neighbour of the target). */
  meleeFrom(s: Stack, target: Stack, reach = this.reachable(s)): Hex[] {
    if (!this.targetable(target)) return [];
    const heads: Hex[] = [s.pos, ...[...reach.values()].map((p) => p[p.length - 1])];
    return heads.filter((h) => this.sdist(s, target, h) === 1);
  }

  // ---------- damage ----------

  effAtk(att: Stack, at: Hex = att.pos): number {
    let a = att.def.atk + this.heroes[att.side].atk - this.status(att, 'atkDown');
    if (this.has(att, 'formation')) a += this.adjacentAllies(att, at).length;
    return a;
  }

  effDef(def: Stack, attacker?: Stack, ranged = false, ignoreDefend = false): number {
    let d = def.def.def + this.heroes[def.side].def + this.status(def, 'shield') - this.status(def, 'defDown');
    if (def.defending && !ignoreDefend) d = Math.ceil(d * 1.3);
    if (ranged && attacker && this.has(attacker, 'pierce')) d -= 1;
    return Math.max(0, d);
  }

  /** Multiplier without the random roll. */
  private multiplier(att: Stack, def: Stack, ranged: boolean, at: Hex, o: StrikeOpts = {}): number {
    let m = 1 + 0.05 * (this.effAtk(att, at) - this.effDef(def, att, ranged, o.ignoreDefend));
    m = Math.min(4, Math.max(0.5, m));
    if (this.has(att, 'holyBane') && (def.def.undead || def.def.faction === 'demon')) m *= 1.3;
    if (this.has(def, 'ethereal')) m *= 0.5;
    if (this.has(def, 'antiMounted') && att.def.mounted) m *= 0.6;
    if (this.has(att, 'rage') && att.topHp < att.def.hp / 2 && att.count === 1) m *= 1.5;
    if (!ranged && att.def.ranged && o.kind !== 'area') m *= 0.5;   // shooters are weak in melee
    return m * (o.mult ?? 1);
  }

  private killsFor(def: Stack, dmg: number): number {
    const total = (def.count - 1) * def.def.hp + def.topHp;
    if (dmg >= total) return def.count;
    const left = total - dmg;
    return def.count - Math.ceil(left / def.def.hp);
  }

  preview(att: Stack, def: Stack, ranged: boolean, at: Hex = att.pos, o: StrikeOpts = {}): AttackPreview {
    const m = this.multiplier(att, def, ranged, at, o);
    const minDmg = Math.max(1, Math.round(att.count * att.def.dmg[0] * m));
    const maxDmg = Math.max(1, Math.round(att.count * att.def.dmg[1] * m));
    return { minDmg, maxDmg, minKills: this.killsFor(def, minDmg), maxKills: this.killsFor(def, maxDmg) };
  }

  private roll(att: Stack, def: Stack, ranged: boolean, o: StrikeOpts): number {
    const [lo, hi] = att.def.dmg;
    let base = 0;
    const n = Math.min(att.count, 10);
    for (let i = 0; i < n; i++) base += lo + Math.floor(this.random() * (hi - lo + 1));
    base = (base / n) * att.count;
    return Math.max(1, Math.round(base * this.multiplier(att, def, ranged, att.pos, o)));
  }

  /** Apply raw damage to a stack. */
  private damage(def: Stack, dmg: number): number {
    const kills = this.killsFor(def, dmg);
    const total = (def.count - 1) * def.def.hp + def.topHp - dmg;
    if (total <= 0) { def.count = 0; def.topHp = 0; }
    else { def.count = Math.ceil(total / def.def.hp); def.topHp = total - (def.count - 1) * def.def.hp; }
    return kills;
  }

  /** Heal hit points; can bring back fallen creatures up to the starting size. */
  private heal(s: Stack, amount: number, revive: boolean): number {
    const cur = (s.count - 1) * s.def.hp + s.topHp;
    const max = revive ? s.startCount * s.def.hp : s.count * s.def.hp;
    const nt = Math.min(max, cur + amount);
    if (nt <= cur) return 0;
    s.count = Math.ceil(nt / s.def.hp);
    s.topHp = nt - (s.count - 1) * s.def.hp;
    return nt - cur;
  }

  private addStatus(s: Stack, id: StatusId, turns: number, value: number, ev: BattleEvent[]): void {
    if (id === 'poison' && (s.def.undead || s.def.passives?.includes('construct'))) return;
    const ex = s.statuses.find((x) => x.id === id);
    if (ex) { ex.turns = Math.max(ex.turns, turns); ex.value = Math.max(ex.value, value); }
    else { s.statuses.push({ id, turns, value }); ev.push({ type: 'status', uid: s.uid, status: id, on: true }); }
  }

  private strike(att: Stack, def: Stack, ranged: boolean, o: StrikeOpts = {}): BattleEvent[] {
    const dmg = this.roll(att, def, ranged, o);
    const kills = this.damage(def, dmg);
    const kind = o.kind ?? 'normal';
    const ev: BattleEvent[] = [{ type: 'attack', uid: att.uid, target: def.uid, ranged, counter: kind === 'counter', damage: dmg, kills, left: def.count }];
    if (this.has(att, 'lifesteal') && att.count > 0 && !o.noLifesteal) {
      const healed = this.heal(att, Math.floor(dmg * 0.3), true);
      if (healed > 0) ev.push({ type: 'heal', uid: att.uid, amount: healed, count: att.count });
    }
    if (def.count > 0) {
      if (this.has(att, 'poisonHit')) this.addStatus(def, 'poison', 2, Math.max(2, Math.round(dmg * 0.2)), ev);
      if (this.has(att, 'curseHit')) this.addStatus(def, 'atkDown', 2, 2, ev);
      if (this.has(att, 'corrode')) this.addStatus(def, 'defDown', 2, 2, ev);
    }
    if (def.count === 0) ev.push({ type: 'death', uid: def.uid });
    return ev;
  }

  /** Melee attack with spear wall, counter and so on. */
  private meleeExchange(s: Stack, t: Stack, o: StrikeOpts = {}, allowCounter = true): BattleEvent[] {
    const ev: BattleEvent[] = [];
    if (this.hasStatus(t, 'spearwall') && !s.def.ranged) {
      ev.push(...this.strike(t, s, false, { mult: 0.5, kind: 'first' }));
      if (s.count <= 0) return ev;
    }
    ev.push(...this.strike(s, t, false, o));
    if (allowCounter && t.count > 0 && (!t.retaliated || this.has(t, 'unlimitedRetaliation')) && !this.has(s, 'noRetaliation')) {
      t.retaliated = true;
      ev.push(...this.strike(t, s, false, { kind: 'counter' }));
    }
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

  /** Start-of-turn effects for a stack: statuses tick, regeneration, auras, summons expire, fear. */
  private turnStart(s: Stack, ev: BattleEvent[]): boolean {
    s.defending = false;
    if (s.cooldown > 0) s.cooldown--;
    if (s.summonRounds !== undefined) {
      s.summonRounds--;
      if (s.summonRounds <= 0) { s.count = 0; ev.push({ type: 'vanish', uid: s.uid }); return false; }
    }
    // statuses
    for (const st of [...s.statuses]) {
      if (st.id === 'poison') {
        const kills = this.damage(s, st.value);
        ev.push({ type: 'dot', uid: s.uid, damage: st.value, kills, left: s.count });
        if (s.count <= 0) { ev.push({ type: 'death', uid: s.uid }); return false; }
      }
      st.turns--;
      if (st.turns <= 0) {
        s.statuses = s.statuses.filter((x) => x !== st);
        ev.push({ type: 'status', uid: s.uid, status: st.id, on: false });
      }
    }
    if (this.has(s, 'regen') && s.topHp < s.def.hp) {
      const amount = s.def.hp - s.topHp;
      s.topHp = s.def.hp;
      ev.push({ type: 'heal', uid: s.uid, amount, count: s.count });
    }
    if (this.has(s, 'healAura')) {
      for (const a of this.adjacentAllies(s)) {
        const amount = this.heal(a, Math.ceil(a.def.hp * 0.25) * s.count, false);
        if (amount > 0) ev.push({ type: 'heal', uid: a.uid, amount, count: a.count });
      }
    }
    // fear: next to a bone dragon there is a chance to lose the turn
    const dragons = this.enemiesOf(s).filter((e) => this.has(e, 'fearAura') && this.sdist(s, e) === 1);
    if (dragons.length && !s.def.undead && this.random() < 0.25) {
      ev.push({ type: 'skip', uid: s.uid, reason: 'fear' });
      return false;
    }
    return true;
  }

  /** Advance to the next stack that may act. Returns events (round start, effects, turn). */
  nextTurn(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    for (;;) {
      if (this.checkEnd(ev)) return ev;
      if (!this.queue.length && !this.waitQueue.length) ev.push(...this.startRound());
      const uid = this.queue.length ? this.queue.shift()! : this.waitQueue.shift()!;
      const s = this.stack(uid);
      if (s.count <= 0) continue;
      this.activeUid = uid;
      if (!this.turnStart(s, ev)) { this.activeUid = -1; continue; }
      ev.push({ type: 'turn', uid });
      return ev;
    }
  }

  private checkEnd(ev: BattleEvent[]): boolean {
    if (this.winner) return true;
    // summoned stacks alone do not keep a side alive
    const p = this.alive.some((s) => s.side === 'player' && s.summonRounds === undefined);
    const e = this.alive.some((s) => s.side === 'enemy' && s.summonRounds === undefined);
    if (p && e) return false;
    this.winner = p ? 'player' : 'enemy';
    ev.push({ type: 'end', winner: this.winner });
    return true;
  }

  // ---------- abilities ----------

  ability(s: Stack): AbilityInfo | null { return s.def.active ? ABILITIES[s.def.active] ?? null : null; }

  /** Targets the active ability of `s` may use right now (uids); [s.uid] for self abilities; [] = not usable. */
  abilityTargets(s: Stack): number[] {
    const ab = this.ability(s);
    if (!ab || s.cooldown > 0) return [];
    const enemies = this.enemiesOf(s).filter((e) => this.targetable(e));
    switch (ab.id) {
      case 'spearWall': case 'disembody': return [s.uid];
      case 'shieldFormation': return [s.uid];
      case 'holyStrike': return this.adjacentEnemies(s).some((e) => this.targetable(e)) ? [s.uid] : [];
      case 'rotStench': return this.adjacentEnemies(s).length ? [s.uid] : [];
      case 'boneSwarm': return neighbors(s.pos).some((h) => this.isFree(h)) ? [s.uid] : [];
      case 'aimedShot': return this.canShoot(s) ? enemies.map((e) => e.uid) : [];
      case 'revival': return [s, ...this.alliesOf(s)].filter((a) => a.summonRounds === undefined && (a.count - 1) * a.def.hp + a.topHp < a.startCount * a.def.hp).map((a) => a.uid);
      case 'dive': return enemies.filter((e) => this.landingHex(s, e, s.def.speed) !== null).map((e) => e.uid);
      case 'bloodFrenzy': return enemies.filter((e) => this.landingHex(s, e) !== null).map((e) => e.uid);
      case 'deathWave': return enemies.map((e) => e.uid);
      case 'decayBreath': return this.adjacentEnemies(s).filter((e) => this.targetable(e)).map((e) => e.uid);
    }
    return [];
  }

  /** Free hex next to `target` closest to `from` (used by dive and blood frenzy). */
  private landingHex(s: Stack, target: Stack, maxDist = 99): Hex | null {
    const around = new Map<string, Hex>();
    for (const c of this.cells(target)) for (const n of neighbors(c)) around.set(key(n), n);
    // a wide attacker may also stand with its head one hex further away
    if (s.def.wide) for (const h of [...around.values()]) for (const n of neighbors(h)) around.set(key(n), n);
    const opts = [...around.values()].filter((h) => this.fits(s, h) && this.sdist(s, target, h) === 1 && distance(s.pos, h) <= maxDist);
    opts.sort((a, b) => distance(s.pos, a) - distance(s.pos, b));
    return opts[0] ?? null;
  }

  private useAbility(s: Stack, targetUid: number | undefined): BattleEvent[] {
    const ab = this.ability(s)!;
    const ev: BattleEvent[] = [{ type: 'ability', uid: s.uid, ability: ab.id, target: targetUid }];
    s.cooldown = ab.cooldown;
    const t = targetUid !== undefined ? this.stack(targetUid) : s;
    switch (ab.id) {
      case 'spearWall': this.addStatus(s, 'spearwall', 1, 1, ev); break;
      case 'disembody': this.addStatus(s, 'disembodied', 1, 1, ev); break;
      case 'shieldFormation':
        for (const a of [s, ...this.adjacentAllies(s)]) this.addStatus(a, 'shield', 2, 4, ev);
        break;
      case 'rotStench':
        for (const e of this.adjacentEnemies(s)) this.addStatus(e, 'atkDown', 2, 3, ev);
        break;
      case 'aimedShot':
        s.shots--;
        ev.push(...this.strike(s, t, true, { mult: 1.5, ignoreDefend: true }));
        break;
      case 'revival': {
        const amount = this.heal(t, s.count * 20, true);
        ev.push({ type: 'heal', uid: t.uid, amount, count: t.count });
        break;
      }
      case 'dive': {
        const from = s.pos;
        const land = this.landingHex(s, t, s.def.speed)!;
        if (!eq(land, s.pos)) { ev.push({ type: 'teleport', uid: s.uid, to: land }); s.pos = land; }
        ev.push(...this.meleeExchange(s, t));
        if (s.count > 0 && !eq(from, s.pos) && this.fits(s, from)) { ev.push({ type: 'teleport', uid: s.uid, to: from }); s.pos = from; }
        break;
      }
      case 'bloodFrenzy': {
        const land = this.landingHex(s, t)!;
        if (!eq(land, s.pos)) { ev.push({ type: 'teleport', uid: s.uid, to: land }); s.pos = land; }
        ev.push(...this.meleeExchange(s, t));
        break;
      }
      case 'holyStrike': {
        for (const e of this.adjacentEnemies(s).filter((x) => this.targetable(x))) ev.push(...this.strike(s, e, false, { mult: 0.75, kind: 'area' }));
        for (const a of this.adjacentAllies(s)) {
          const amount = this.heal(a, Math.ceil(a.def.hp * 0.3) * s.count, true);
          if (amount > 0) ev.push({ type: 'heal', uid: a.uid, amount, count: a.count });
        }
        break;
      }
      case 'deathWave': {
        const victims = [t, ...this.enemiesOf(s).filter((e) => e !== t && this.sdist(e, t) === 1)].filter((e) => this.targetable(e) && !e.def.undead);
        for (const v of victims) ev.push(...this.strike(s, v, true, { mult: v === t ? 0.8 : 0.6, kind: 'area', noLifesteal: true }));
        break;
      }
      case 'decayBreath': {
        ev.push(...this.strike(s, t, false, { kind: 'area' }));
        // the stack standing behind the target in the same direction is hit as well
        const bh = behind(s.pos, t.pos);
        const b = inBounds(bh) ? this.stackAt(bh) : undefined;
        if (b && b.side !== s.side && this.targetable(b)) ev.push(...this.strike(s, b, false, { kind: 'area' }));
        break;
      }
      case 'boneSwarm': {
        const free = neighbors(s.pos).find((h) => this.isFree(h))!;
        const n = this.addStack(s.def, s.side, Math.max(1, Math.ceil(s.count / 2)), free);
        n.summonRounds = 2;
        n.cooldown = 99;
        this.queue.push(n.uid);
        ev.push({ type: 'summon', uid: n.uid });
        break;
      }
    }
    return ev;
  }

  // ---------- actions ----------

  /** Is this action legal for the active stack? */
  isLegal(a: Action): boolean {
    const s = this.active;
    if (!s || this.winner) return false;
    switch (a.type) {
      case 'move': return this.reachable(s).has(key(a.to));
      case 'shoot': { const t = this.stack(a.target); return !!t && this.targetable(t) && t.side !== s.side && this.canShoot(s); }
      case 'melee': {
        const t = this.stack(a.target);
        if (!t || !this.targetable(t) || t.side === s.side || this.sdist(s, t, a.from) !== 1) return false;
        return eq(a.from, s.pos) || this.reachable(s).has(key(a.from));
      }
      case 'ability': {
        const targets = this.abilityTargets(s);
        if (!targets.length) return false;
        const ab = this.ability(s)!;
        return ab.target === 'self' ? true : a.target !== undefined && targets.includes(a.target);
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
        ev.push(...this.strike(s, this.stack(a.target), true));
        break;
      }
      case 'melee': {
        const t = this.stack(a.target);
        if (!eq(a.from, s.pos)) {
          ev.push({ type: 'move', uid: s.uid, path: this.reachable(s).get(key(a.from))! });
          s.pos = a.from;
        }
        ev.push(...this.meleeExchange(s, t));
        break;
      }
      case 'ability': ev.push(...this.useAbility(s, a.target)); break;
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
  private hpTotal(s: Stack): number { return (s.count - 1) * s.def.hp + s.topHp; }

  /** Score for using the active ability now (and on which target); null if not worth it. */
  private abilityChoice(s: Stack): { score: number; target?: number } | null {
    const targets = this.abilityTargets(s);
    if (!targets.length) return null;
    const ab = this.ability(s)!;
    const exp = (p: AttackPreview) => (p.minKills + p.maxKills) / 2;
    const enemies = this.enemiesOf(s);
    const threatened = enemies.some((e) => !e.def.ranged && this.sdist(s, e) <= e.def.speed + 1);
    switch (ab.id) {
      case 'spearWall': return threatened && !this.adjacentEnemies(s).length ? { score: 8 } : null;
      case 'disembody': return this.adjacentEnemies(s).length && this.hpTotal(s) < s.startCount * s.def.hp * 0.6 ? { score: 12 } : null;
      case 'shieldFormation': {
        const allies = this.adjacentAllies(s).length;
        return threatened && allies >= 1 && !this.adjacentEnemies(s).length ? { score: 6 + allies * 4 } : null;
      }
      case 'rotStench': return this.adjacentEnemies(s).length >= 2 ? { score: 15 } : null;
      case 'boneSwarm': return this.round <= 2 ? { score: 20 } : null;
      case 'holyStrike': {
        const n = this.adjacentEnemies(s).length;
        return n >= 2 ? { score: 40 * n } : null;
      }
      case 'revival': {
        let best: number | undefined; let bs = 0;
        for (const uid of targets) {
          const a = this.stack(uid);
          const missing = a.startCount * a.def.hp - this.hpTotal(a);
          const sc = Math.min(missing, s.count * 20) / a.def.hp * a.def.cost;
          if (sc > bs) { bs = sc; best = uid; }
        }
        return best !== undefined && bs > 15 ? { score: bs * 1.2, target: best } : null;
      }
      case 'aimedShot': case 'deathWave': case 'decayBreath': case 'dive': case 'bloodFrenzy': {
        let best: number | undefined; let bs = -1;
        for (const uid of targets) {
          const e = this.stack(uid);
          let sc = exp(this.preview(s, e, ab.id === 'aimedShot' || ab.id === 'deathWave', s.pos,
            ab.id === 'aimedShot' ? { mult: 1.5, ignoreDefend: true } : ab.id === 'deathWave' ? { mult: 0.8 } : {})) * this.value(e);
          if (ab.id === 'deathWave') sc += this.enemiesOf(s).filter((o) => o !== e && this.sdist(o, e) === 1).length * 25;
          if (sc > bs) { bs = sc; best = uid; }
        }
        // these are just better attacks: always use them when they are ready
        return best !== undefined ? { score: 1000 + bs, target: best } : null;
      }
    }
    return null;
  }

  /** Pick an action for the active stack (used for the enemy and for simulations). */
  decide(): Action {
    const s = this.active!;
    const enemies = this.enemiesOf(s).filter((e) => this.targetable(e));
    const expected = (p: AttackPreview) => (p.minKills + p.maxKills) / 2;
    const abil = this.abilityChoice(s);
    if (abil && abil.score >= 1000) return { type: 'ability', target: abil.target };

    if (this.canShoot(s) && enemies.length) {
      let best = enemies[0];
      let bestScore = -1;
      for (const e of enemies) {
        const sc = expected(this.preview(s, e, true)) * this.value(e) + (e.def.ranged ? 5 : 0);
        if (sc > bestScore) { bestScore = sc; best = e; }
      }
      if (abil && abil.score > bestScore) return { type: 'ability', target: abil.target };
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
          const counterKills = Math.min(s.count, (this.preview(e, s, false, e.pos).minKills));
          sc -= counterKills * this.value(s) * 0.5;
        }
        sc -= distance(s.pos, from) * 0.01;
        if (sc > bestScore) { bestScore = sc; bestAct = { type: 'melee', target: e.uid, from }; }
      }
    }
    if (abil && abil.score > bestScore) return { type: 'ability', target: abil.target };
    if (bestAct) return bestAct;
    if (abil) return { type: 'ability', target: abil.target };

    if (s.def.ranged && s.shots > 0) return { type: 'defend' };
    if (!enemies.length) return { type: 'defend' };

    let target = enemies[0];
    for (const e of enemies) if (this.sdist(s, e) < this.sdist(s, target)) target = e;
    let bestHex: Hex | null = null;
    let bestD = this.sdist(s, target);
    for (const [, path] of reach) {
      const h = path[path.length - 1];
      const d = this.sdist(s, target, h);
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
