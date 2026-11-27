// Battle rules, independent of Phaser so they can be simulated headless.
// Follows GDD chapter 3: stacks, initiative, damage formula 3.3, one counter per round,
// unit passives and active abilities with cooldowns (3.8).
import { type Hex, key, eq, neighbors, distance, inBounds, allHexes, behind, COLS, ROWS } from './hex';
import type { UnitDef, Stack, Side, HeroStats, BattleEvent, StatusId, Status } from './types';
import { innateMods } from './passives';
import { NO_MODS, combine, BASE_CRIT, BASE_CRIT_DMG, BASE_MORALE, type SideMods } from './mods';
import { SPELLS, spellNumbers, maxMana, noTarget, type SpellSlot } from './spells';
import { CONSUMABLES, SCROLL_LEVEL } from '../run/items';
import { UNITS } from '../data/units';

export interface ArmySetup { hero: HeroStats; army: { def: UnitDef; count: number }[]; mods?: SideMods; }
export interface BattleSetup {
  player: ArmySetup; enemy: ArmySetup; seed?: number; obstacles?: Hex[]; startCols?: [number, number];
  /** Tactics (v0.18): remembered start hexes of the player's stacks (same order as the army), within `deployCols`. */
  playerPos?: (Hex | null | undefined)[];
  deployCols?: number;
}

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
  // elves
  mark: { id: 'mark', cooldown: 3, target: 'enemy' },
  doubleShot: { id: 'doubleShot', cooldown: 3, target: 'enemy' },
  entangle: { id: 'entangle', cooldown: 3, target: 'enemy' },
  sporeCloud: { id: 'sporeCloud', cooldown: 4, target: 'enemy' },
  lightLance: { id: 'lightLance', cooldown: 3, target: 'enemy' },
  rootStrike: { id: 'rootStrike', cooldown: 4, target: 'self' },
  // dwarves
  burrow: { id: 'burrow', cooldown: 4, target: 'enemy' },
  quakeStrike: { id: 'quakeStrike', cooldown: 3, target: 'enemy' },
  explosiveBolt: { id: 'explosiveBolt', cooldown: 4, target: 'enemy' },
  ironStance: { id: 'ironStance', cooldown: 3, target: 'self' },
  overpressure: { id: 'overpressure', cooldown: 3, target: 'self' },
  finalStand: { id: 'finalStand', cooldown: 4, target: 'enemy' },
  // orcs
  warcry: { id: 'warcry', cooldown: 3, target: 'self' },
  axeVolley: { id: 'axeVolley', cooldown: 3, target: 'enemy' },
  hunt: { id: 'hunt', cooldown: 3, target: 'enemy' },
  bloodSacrifice: { id: 'bloodSacrifice', cooldown: 4, target: 'ally' },
  smash: { id: 'smash', cooldown: 4, target: 'enemy' },
  rampage: { id: 'rampage', cooldown: 3, target: 'self' },
  // demons
  fireSpark: { id: 'fireSpark', cooldown: 2, target: 'enemy' },
  howl: { id: 'howl', cooldown: 3, target: 'self' },
  seduce: { id: 'seduce', cooldown: 4, target: 'enemy' },
  hellPortal: { id: 'hellPortal', cooldown: 3, target: 'enemy' },
  infernoBlast: { id: 'infernoBlast', cooldown: 4, target: 'enemy' },
  worldfire: { id: 'worldfire', cooldown: 5, target: 'self' },
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

/** Harmful statuses that holy heal can remove. */
const NEGATIVE = new Set<StatusId>(['poison', 'atkDown', 'defDown', 'slow', 'fear', 'root', 'burn', 'confused']);

const START_ROWS: Record<number, number[]> = { 1: [3], 2: [2, 4], 3: [1, 3, 5], 4: [0, 2, 4, 6] };

interface StrikeOpts { mult?: number; ignoreDefend?: boolean; noLifesteal?: boolean; kind?: 'normal' | 'counter' | 'first' | 'area'; noCrit?: boolean }

export class Battle {
  stacks: Stack[] = [];
  heroes: Record<Side, HeroStats>;
  mods: Record<Side, SideMods>;
  obstacles = new Set<string>();
  round = 0;
  activeUid = -1;
  winner: Side | null = null;
  /** Hero mana left in this battle and whether the hero already cast a spell this round. */
  mana: Record<Side, number> = { player: 0, enemy: 0 };
  maxMana: Record<Side, number> = { player: 0, enemy: 0 };
  castThisRound: Record<Side, boolean> = { player: false, enemy: false };   // true = no more spells this round
  private castsDone: Record<Side, number> = { player: 0, enemy: 0 };
  private freeUsed: Record<Side, Set<string>> = { player: new Set(), enemy: new Set() };
  itemThisRound: Record<Side, boolean> = { player: false, enemy: false };
  belts: Record<Side, string[]> = { player: [], enemy: [] };
  /** Belt places used up in this battle (removed from the run afterwards). */
  usedItems: Record<Side, number[]> = { player: [], enemy: [] };
  /** Traps on the board: hex key -> owner side and damage share. */
  traps = new Map<string, { side: Side; share: number }>();
  /** Stacks that ran away (treasure goblins). */
  fled = new Set<number>();
  private lastAbsorb = 0;
  private unitMods = new Map<number, SideMods>();
  private queue: number[] = [];
  private waitQueue: number[] = [];
  private random: () => number;
  private nextUid = 1;

  constructor(setup: BattleSetup) {
    this.random = rng(setup.seed ?? Date.now());
    this.heroes = { player: setup.player.hero, enemy: setup.enemy.hero };
    this.mods = { player: setup.player.mods ?? NO_MODS, enemy: setup.enemy.mods ?? NO_MODS };
    for (const h of setup.obstacles ?? []) this.obstacles.add(key(h));
    for (const side of ['player', 'enemy'] as Side[]) {
      const army = setup[side].army;
      const rows = START_ROWS[army.length] ?? START_ROWS[3];
      army.forEach((a, i) => {
        // wide (two-hex) units stand one column further in so their back half fits on the board
        const col = side === 'player' ? (setup.startCols?.[0] ?? 0) + (a.def.wide ? 1 : 0) : (setup.startCols?.[1] ?? COLS - 1) - (a.def.wide ? 1 : 0);
        this.addStack(a.def, side, a.count, { col, row: rows[i] ?? i });
      });
    }
    if (setup.playerPos?.some(Boolean)) this.applyFormation(setup.playerPos, setup.deployCols ?? 2);
    for (const side of ['player', 'enemy'] as Side[]) {
      const hs = this.heroes[side];
      this.maxMana[side] = hs.spells?.length ? maxMana(hs.knowledge ?? 0, this.mods[side].mana) : 0;
      this.mana[side] = this.maxMana[side];
      this.belts[side] = [...(hs.consumables ?? [])];
    }
    for (const st of this.stacks) {
      const sh = this.sm(st).startShield;
      if (sh > 0) st.statuses.push({ id: 'shield', turns: 2, value: sh });
    }
  }

  private addStack(def0: UnitDef, side: Side, count: number, pos: Hex): Stack {
    const base = this.mods?.[side] ?? NO_MODS;
    // per-unit modifiers (unit upgrades, synergies, people passive, modifier passives) on top of the side's modifiers
    const innate = innateMods(def0);
    const m = def0.mods || innate.length ? combine(base, def0.mods ?? {}, ...innate) : base;
    const def: UnitDef = (m.hp || m.ini || m.speed || (m.shots && def0.ranged))
      ? { ...def0, hp: Math.round(def0.hp * (1 + m.hp)), ini: def0.ini + m.ini, speed: def0.speed + m.speed,
        ranged: def0.ranged ? def0.ranged + m.shots : undefined }
      : def0;
    const s: Stack = {
      uid: this.nextUid++, def, side, count, startCount: count, topHp: def.hp, pos,
      shots: def.ranged ?? 0, retaliated: false, defending: false, waited: false, acted: false,
      started: false, bonusTurn: false, cooldown: 0, statuses: [], attacks: 0, counters: 0,
    };
    if (m !== base) this.unitMods.set(s.uid, m);
    this.stacks.push(s);
    return s;
  }

  /** Modifiers of one stack: its side's modifiers plus its own (upgrades). */
  sm(s: Stack): SideMods { return this.unitMods.get(s.uid) ?? this.mods[s.side]; }

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
  /** Spell-based speed/initiative changes: haste and slow store the spell level. */
  private tempoOf(st: Status | undefined): { s: number; i: number } {
    return st ? { s: st.value >= 2 ? 2 : 1, i: st.value + 1 } : { s: 0, i: 0 };
  }
  /** Movement this turn (haste, slow, roots, talents already in def.speed). */
  speedOf(s: Stack): number {
    if (this.hasStatus(s, 'root')) return 0;
    const h = this.tempoOf(s.statuses.find((x) => x.id === 'haste'));
    const sl = this.tempoOf(s.statuses.find((x) => x.id === 'slow'));
    return Math.max(1, s.def.speed + h.s - sl.s);
  }

  /**
   * People passives (one per people):
   * humans – Valor: +10 % morale, elves – Keen Eye: +10 % critical chance (both as modifiers, see passives.ts);
   * dwarves – Unyielding: immune to weakening (−ATK, −DEF) and slow;
   * undead – Undead: immune to poison (and fear);
   * orcs – Fury: +1 ATK each time they are attacked (max +4 per battle);
   * demons – Hellborn: immune to burning, fire spells deal only half damage.
   */
  immune(s: Stack, id: StatusId): boolean {
    const f = s.def.faction;
    switch (id) {
      case 'poison': return !!s.def.undead || this.has(s, 'construct');
      case 'fear': return !!s.def.undead || !!s.def.sizeScale || this.has(s, 'construct');
      case 'burn': return f === 'demon';
      case 'stun': return !!s.def.sizeScale || this.has(s, 'stunImmune');
      case 'atkDown': case 'defDown': case 'slow': return f === 'dwarf';
    }
    return false;
  }

  /** Critical chance (5 % base + modifiers, max 65 %) and damage multiplier (x2 + modifiers). */
  critChance(s: Stack): number { return Math.min(0.65, BASE_CRIT + this.sm(s).crit); }
  critMult(s: Stack): number { return BASE_CRIT_DMG + this.sm(s).critDmg; }
  /** Morale: chance for one extra action right after the stack's turn (5 % base + modifiers). */
  moraleChance(s: Stack): number { return Math.max(0, Math.min(1, BASE_MORALE + this.sm(s).morale)); }
  /** After an action (not wait/defend): roll morale; on success the stack acts again at once (max once per round). */
  private rollMorale(s: Stack, ev: BattleEvent[]): void {
    if (s.count <= 0 || s.bonusTurn || this.hasStatus(s, 'stun')) return;
    if (this.random() >= this.moraleChance(s)) return;
    s.bonusTurn = true;
    this.queue.unshift(s.uid);
    ev.push({ type: 'morale', uid: s.uid });
  }

  /** Disembodied ghosts cannot be attacked. */
  targetable(s: Stack): boolean { return s.count > 0 && !this.hasStatus(s, 'disembodied'); }

  /** Upcoming turn order: rest of this round, then the next round. */
  turnOrder(max = 12): { uid: number; nextRound: boolean }[] {
    const out: { uid: number; nextRound: boolean }[] = [];
    const cur = [this.activeUid, ...this.queue, ...this.waitQueue].filter((u) => u > 0 && this.stack(u).count > 0);
    for (const u of cur) out.push({ uid: u, nextRound: false });
    // the next round is ordered by the current initiative (haste and slow included)
    const saved = this.round; this.round = Math.max(this.round, 2);
    for (const u of this.initiativeOrder()) out.push({ uid: u, nextRound: true });
    this.round = saved;
    return out.slice(0, max);
  }

  /** Hexes the stack can move to this turn, with the path to each. */
  reachable(s: Stack): Map<string, Hex[]> {
    const res = new Map<string, Hex[]>();
    const speed = this.speedOf(s);
    if (this.hasStatus(s, 'root')) return res;
    if (s.def.flying) {
      for (const h of allHexes()) {
        const d = distance(s.pos, h);
        if (d > 0 && d <= speed && this.fits(s, h)) res.set(key(h), [h]);
      }
      return res;
    }
    const frontier: { h: Hex; path: Hex[] }[] = [{ h: s.pos, path: [] }];
    const seen = new Set([key(s.pos)]);
    while (frontier.length) {
      const { h, path } = frontier.shift()!;
      if (path.length >= speed) continue;
      for (const n of neighbors(h)) {
        const k = key(n);
        if (seen.has(k)) continue;
        const stand = this.fits(s, n);
        if (!stand) continue;
        seen.add(k);
        const p = [...path, n];
        if (stand) res.set(k, p);
        // a stack may step onto an enemy trap, but not walk through it - unless it cannot see the traps (it walks in)
        if (this.blindToTraps(s) || !this.cells(s, n).some((c) => this.hostileTrap(s, c))) frontier.push({ h: n, path: p });
      }
    }
    return res;
  }

  /** The player's traps are hidden from the enemy (Ben 27.11.): it plans as if they were not there and runs into them. */
  blindToTraps(s: Stack): boolean { return s.side === 'enemy'; }

  /** Walk along a path; a hidden trap on the way stops the stack there and springs. Returns true if a trap sprang. */
  private walk(s: Stack, path: Hex[], ev: BattleEvent[]): boolean {
    let stop = path.length - 1;
    for (let i = 0; i < path.length; i++) if (this.cells(s, path[i]).some((c) => this.hostileTrap(s, c))) { stop = i; break; }
    const p = path.slice(0, stop + 1);
    ev.push({ type: 'move', uid: s.uid, path: p });
    s.pos = p[p.length - 1];
    return this.springTraps(s, ev);
  }

  /** Is there a trap of the other side on this hex? */
  hostileTrap(s: Stack, h: Hex): boolean {
    const tr = this.traps.get(key(h));
    return !!tr && tr.side !== s.side;
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
    let a = att.def.atk + this.heroes[att.side].atk - this.status(att, 'atkDown') + this.status(att, 'focus') + this.status(att, 'fury');
    if (this.has(att, 'formation')) a += this.adjacentAllies(att, at).length;
    a += 2 * this.adjacentAllies(att, at).filter((o) => this.has(o, 'warTotem')).length;
    return a;
  }

  effDef(def: Stack, attacker?: Stack, ranged = false, ignoreDefend = false): number {
    let d = def.def.def + this.heroes[def.side].def + this.status(def, 'shield') - this.status(def, 'defDown');
    d += 2 * this.adjacentAllies(def).filter((o) => this.has(o, 'guardAura')).length;
    if (def.defending && !ignoreDefend) d = Math.ceil(d * 1.3);
    if (ranged && attacker && this.has(attacker, 'pierce')) d -= 1;
    if (attacker && this.has(attacker, 'armorPierce')) d = Math.floor(d * 0.7);
    if (attacker && this.sm(attacker).pierceDef > 0) d = Math.floor(d * (1 - this.sm(attacker).pierceDef));
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
    if (!ranged && att.def.ranged && o.kind !== 'area' && !this.has(att, 'meleeArcher')) m *= 0.5;   // shooters are weak in melee
    if (this.has(def, 'barkskin')) m *= 0.85;
    if (ranged && this.has(def, 'rangedResist')) m *= 0.6;
    if (ranged && this.hasStatus(def, 'marked')) m *= 1.25;
    if (this.has(def, 'lastStand') && def.count * 2 < def.startCount) m *= 0.7;
    if (this.has(att, 'charge') && att.attacks === 0 && o.kind !== 'counter') m *= 1.3;
    if (ranged && this.has(att, 'heavyAxes') && this.sdist(att, def, at) <= 3) m *= 1.25;
    const am = this.sm(att), dm = this.sm(def);
    let bonus = am.dmg + (ranged ? am.ranged : am.melee);
    if (o.kind === 'counter') bonus += am.counterDmg;
    if (att.attacks === 0 && o.kind !== 'counter') bonus += am.firstStrike;
    if (def.def.sizeScale) bonus += am.vsBig;
    if (def.def.undead) bonus += am.undeadDmg;
    bonus += (this.status(att, 'bless') + this.status(att, 'frenzy')) / 100;
    if (this.hasStatus(def, 'frenzy')) m *= 1.2;
    if (def.count * 2 < def.startCount) bonus += am.executioner;
    m *= Math.max(0.1, 1 + bonus) * (1 - dm.taken);
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

  /** Apply raw damage to a stack. A divine shield (ward) absorbs damage first; the absorbed part is in lastAbsorb. */
  private damage(def: Stack, dmg: number): number {
    this.lastAbsorb = 0;
    const w = def.statuses.find((x) => x.id === 'ward');
    if (w && dmg > 0) {
      const a = Math.min(w.value, dmg);
      w.value -= a; dmg -= a; this.lastAbsorb = a;
      if (w.value <= 0) def.statuses = def.statuses.filter((x) => x !== w);
    }
    if (dmg <= 0) return 0;
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

  /** Add or refresh a status. Returns false if the stack is immune (spells then show "resisted"). */
  private addStatus(s: Stack, id: StatusId, turns: number, value: number, ev: BattleEvent[], announce = false): boolean {
    if (this.immune(s, id)) { if (announce) ev.push({ type: 'resist', uid: s.uid, status: id }); return false; }
    const ex = s.statuses.find((x) => x.id === id);
    if (ex) { ex.turns = Math.max(ex.turns, turns); ex.value = Math.max(ex.value, value); }
    else { s.statuses.push({ id, turns, value }); ev.push({ type: 'status', uid: s.uid, status: id, on: true }); }
    return true;
  }

  private wardEvent(s: Stack, ev: BattleEvent[]): void {
    if (this.lastAbsorb <= 0) return;
    ev.push({ type: 'ward', uid: s.uid, absorbed: this.lastAbsorb });
    if (!this.hasStatus(s, 'ward')) ev.push({ type: 'status', uid: s.uid, status: 'ward', on: false });
  }

  /** Orc fury: +1 ATK each time the stack is attacked (max +4). */
  private fury(s: Stack, ev: BattleEvent[]): void {
    if (s.def.faction !== 'orc' || s.count <= 0) return;
    const f = s.statuses.find((x) => x.id === 'fury');
    if (f) f.value = Math.min(4 + this.sm(s).furyMax, f.value + 1);
    else { s.statuses.push({ id: 'fury', turns: 999, value: 1 }); ev.push({ type: 'status', uid: s.uid, status: 'fury', on: true }); }
  }

  private strike(att: Stack, def: Stack, ranged: boolean, o: StrikeOpts = {}): BattleEvent[] {
    const am = this.sm(att);
    const crit = !o.noCrit && this.random() < this.critChance(att);
    const bonus = o.kind !== 'counter' && att.bonusTurn && this.activeUid === att.uid ? 1 + am.moraleDmg : 1;
    const raw = Math.round(this.roll(att, def, ranged, o) * (crit ? this.critMult(att) : 1) * bonus);
    if (o.kind !== 'counter') att.attacks++;
    const kills = this.damage(def, raw);
    const dmg = raw - this.lastAbsorb;
    const kind = o.kind ?? 'normal';
    const ev: BattleEvent[] = [];
    this.wardEvent(def, ev);
    ev.push({ type: 'attack', uid: att.uid, target: def.uid, ranged, counter: kind === 'counter', damage: dmg, kills, left: def.count, crit });
    this.fury(def, ev);
    if (kills > 0 && this.has(att, 'bloodthirst')) this.fury(att, ev);
    const steal = (this.has(att, 'lifesteal') ? 0.3 : 0) + am.lifesteal;
    if (steal > 0 && att.count > 0 && !o.noLifesteal) {
      const healed = this.heal(att, Math.floor(dmg * steal), true);
      if (healed > 0) ev.push({ type: 'heal', uid: att.uid, amount: healed, count: att.count });
    }
    if (def.count > 0) {
      if (this.has(att, 'poisonHit')) this.addStatus(def, 'poison', 2, Math.max(2, Math.round(dmg * 0.2)), ev);
      else if (am.poison > 0 && !ranged) this.addStatus(def, 'poison', 2, Math.max(1, Math.round(dmg * am.poison)), ev);
      if (this.has(att, 'curseHit')) this.addStatus(def, 'atkDown', 2, 2, ev);
      if (this.has(att, 'corrode')) this.addStatus(def, 'defDown', 2, 2, ev);
      if (this.has(att, 'burnHit')) this.addStatus(def, 'burn', 2, Math.max(2, Math.round(dmg * 0.15)), ev);
      if (this.has(att, 'frostHit')) this.addStatus(def, 'slow', 2, 1, ev);
      // talents: fire, frost and marking hits
      if (am.burn > 0 && o.kind !== 'counter') this.addStatus(def, 'burn', 2, Math.max(1, Math.round(dmg * am.burn)), ev);
      if (am.frost > 0 && o.kind !== 'counter') this.addStatus(def, 'slow', 2, 1, ev);
      if (am.markShots > 0 && ranged) this.addStatus(def, 'marked', 2, 1, ev);
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
    const before = this.hpTotal(t);
    ev.push(...this.strike(s, t, false, o));
    const thorns = this.sm(t).thorns + this.status(t, 'thornskin') / 100;
    if (thorns > 0 && s.count > 0) {
      const dealt = before - this.hpTotal(t);
      const back = Math.max(1, Math.round(dealt * thorns));
      const kills = this.damage(s, back);
      this.wardEvent(s, ev);
      ev.push({ type: 'dot', uid: s.uid, damage: back - this.lastAbsorb, kills, left: s.count, source: 'thorns' });
      if (s.count <= 0) { ev.push({ type: 'death', uid: s.uid }); return ev; }
    }
    const maxCounters = 1 + this.sm(t).counters;
    if (allowCounter && t.count > 0 && !this.hasStatus(t, 'confused') && (t.counters < maxCounters || this.has(t, 'unlimitedRetaliation')) && !this.has(s, 'noRetaliation') && !this.has(s, 'bladeDance') && !this.has(s, 'charm')
      && !(this.has(s, 'skirmish') && this.iniOf(t) < this.iniOf(s))) {
      t.counters++;
      t.retaliated = t.counters >= maxCounters;
      ev.push(...this.strike(t, s, false, { kind: 'counter' }));
    }
    return ev;
  }

  // ---------- turn flow ----------

  /** Initiative including the round-1 bonus (the queue is built right after the round counter rises). */
  iniOf(s: Stack): number {
    const h = this.tempoOf(s.statuses.find((x) => x.id === 'haste'));
    const sl = this.tempoOf(s.statuses.find((x) => x.id === 'slow'));
    return s.def.ini + h.i - sl.i + (this.round <= 1 ? this.sm(s).round1Ini : 0);
  }

  private initiativeOrder(): number[] {
    return this.alive
      .slice()
      .sort((a, b) => this.iniOf(b) - this.iniOf(a) || (a.side === 'player' ? -1 : 1) - (b.side === 'player' ? -1 : 1) || a.uid - b.uid)
      .map((s) => s.uid);
  }

  private startRound(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    // end of the previous round: Burning (hellfire talent)
    if (this.round >= 1) for (const side of ['player', 'enemy'] as Side[]) this.hellfireRound(side, ev);
    if (this.winner) return ev;
    this.round++;
    for (const s of this.alive) { s.retaliated = false; s.counters = 0; s.waited = false; s.acted = false; s.started = false; s.bonusTurn = false; }
    this.queue = this.initiativeOrder();
    this.waitQueue = [];
    this.castThisRound = { player: false, enemy: false };
    this.castsDone = { player: 0, enemy: 0 };
    this.itemThisRound = { player: false, enemy: false };
    ev.push({ type: 'round', round: this.round });
    for (const side of ['player', 'enemy'] as Side[]) {
      this.relicSkills(side, ev);
      this.talentRound(side, ev);
    }
    for (const s of this.alive) if (s.def.sizeScale && s.summonRounds === undefined) this.bossSkill(s, ev);
    return ev;
  }

  // ---------- boss skills, relics and traps ----------

  private hurt(s: Stack, dmg: number, ev: BattleEvent[], source: 'trap' | 'skill' | 'decay' | 'hellfire'): void {
    const kills = this.damage(s, dmg);
    this.wardEvent(s, ev);
    ev.push({ type: 'dot', uid: s.uid, damage: dmg - this.lastAbsorb, kills, left: s.count, source });
    if (s.count <= 0) ev.push({ type: 'death', uid: s.uid });
  }
  private power(s: Stack): number { return s.count * s.def.cost; }
  private foesOf(side: Side): Stack[] { return this.alive.filter((o) => o.side !== side && this.targetable(o)); }

  /** Lay up to `n` traps of `side` on free hexes one or two steps in front of enemy stacks. */
  private layTraps(side: Side, n: number, share: number, max: number, ev: BattleEvent[]): number {
    const own = [...this.traps.values()].filter((t) => t.side === side).length;
    const foes = this.alive.filter((o) => o.side !== side);
    const friends = this.alive.filter((o) => o.side === side);
    let left = Math.min(n, max - own);
    let laid = 0;
    while (left-- > 0) {
      const opts: { h: Hex; sc: number }[] = [];
      for (const h of allHexes()) {
        if (!this.isFree(h) || this.traps.has(key(h))) continue;
        const d = Math.min(...foes.map((f) => Math.min(...this.cells(f).map((c) => distance(c, h)))));
        if (d < 1 || d > 2) continue;
        // between the enemy and our own stacks is best: that is where they will walk
        const dOwn = friends.length ? Math.min(...friends.map((f) => distance(f.pos, h))) : 0;
        opts.push({ h, sc: (d === 1 ? 2 : 1) - dOwn * 0.3 + this.random() * 1.5 });
      }
      if (!opts.length) break;
      opts.sort((a, b) => b.sc - a.sc);
      const h = opts[0].h;
      this.traps.set(key(h), { side, share });
      ev.push({ type: 'trap', hex: h, side, on: true });
      laid++;
    }
    return laid;
  }

  /** A stack that ends its move on an enemy trap is hurt and rooted. Returns true if a trap sprang. */
  private springTraps(s: Stack, ev: BattleEvent[]): boolean {
    for (const c of this.cells(s)) {
      const k = key(c);
      const tr = this.traps.get(k);
      if (!tr || tr.side === s.side) continue;
      this.traps.delete(k);
      ev.push({ type: 'trap', hex: c, side: tr.side, on: false, uid: s.uid });
      const tm = this.mods[tr.side];
      const dmg = Math.max(1, Math.round(this.hpTotal(s) * tr.share * (1 + tm.trapDmg)));
      this.hurt(s, dmg, ev, 'trap');
      if (s.count > 0) this.addStatus(s, 'root', 2, 1, ev);
      if (s.count > 0 && tm.trapPoison > 0) this.addStatus(s, 'poison', 3, Math.max(1, Math.round(dmg * 0.3)), ev);
      if (s.count > 0 && tm.trapSlow > 0) this.addStatus(s, 'slow', 2, 1, ev);
      if (s.count > 0 && tm.trapStun > 0 && !s.def.sizeScale) this.addStatus(s, 'stun', 1, 1, ev);
      return true;
    }
    return false;
  }

  /** Summon `count` creatures of `unitId` for `side` next to its stacks (they don't keep the side alive). */
  private summonFor(side: Side, unitId: string, count: number, near: Stack[], ev: BattleEvent[]): boolean {
    const def = UNITS[unitId];
    if (!def || count <= 0) return false;
    const around = near.flatMap((x) => this.cells(x).flatMap((c) => neighbors(c))).filter((h) => this.isFree(h) && !this.traps.has(key(h)));
    const free = around[Math.floor(this.random() * around.length)]
      ?? allHexes().filter((h) => this.isFree(h)).sort((a, b) => distance(a, near[0]?.pos ?? a) - distance(b, near[0]?.pos ?? b))[0];
    if (!free) return false;
    const st = this.addStack(def, side, count, free);
    st.summonRounds = 99;
    this.queue.push(st.uid);
    ev.push({ type: 'summon', uid: st.uid });
    return true;
  }

  /** Hero talents at round start: Death and Decay, automatic healing, Summoning (GDD 17.5/17.7). */
  private talentRound(side: Side, ev: BattleEvent[]): void {
    const m = this.mods[side];
    const hero = this.heroes[side];
    const own = this.alive.filter((o) => o.side === side && o.summonRounds === undefined);
    if (!own.length) return;
    const skill = (name: string) => ev.push({ type: 'skill', side, name: `skill.${name}` });
    if (hero.summon && (this.round === 1 || (this.round === 4 && m.summonTwice > 0))) {
      const at = ev.length;
      if (this.summonFor(side, hero.summon.id, hero.summon.count, own, ev)) ev.splice(at, 0, { type: 'skill', side, name: 'skill.summon' });
    }
    if (m.decay > 0) {
      const foes = this.foesOf(side);
      const dmg = Math.max(1, Math.round(m.decay * (1.6 + 0.6 * hero.atk + 1 * (hero.power ?? 0))));
      if (foes.length) skill('decay');
      for (const e of foes) {
        const d = Math.max(1, Math.round(dmg * (1 - this.sm(e).taken)));
        this.hurt(e, d, ev, 'decay');
        if (e.count <= 0) continue;
        if (m.decayWeak > 0) this.addStatus(e, 'atkDown', 2, m.decayWeak, ev, true);
        if (m.decayArmor > 0) this.addStatus(e, 'defDown', 2, m.decayArmor, ev, true);
        if (m.decaySlow > 0) this.addStatus(e, 'slow', 2, 1, ev, true);
        if (m.decayPoison > 0) this.addStatus(e, 'poison', 2, Math.max(1, Math.round(d * m.decayPoison)), ev, true);
        if (m.decayFear > 0 && this.random() < m.decayFear) this.addStatus(e, 'fear', 1, 1, ev, true);
      }
    }
    if (m.autoHeal > 0) {
      const a = own.slice().sort((x, y) => (y.startCount * y.def.hp - this.hpTotal(y)) - (x.startCount * x.def.hp - this.hpTotal(x)))[0];
      if (a && a.startCount * a.def.hp > this.hpTotal(a)) {
        skill('autoHeal');
        this.spellHeal(side, a, m.autoHeal * (10 + 5 * (hero.power ?? 0)), true, ev);
      }
    }
  }

  /** Burning talent at round end: fire damage to the strongest enemy stack(s). */
  private hellfireRound(side: Side, ev: BattleEvent[]): void {
    const m = this.mods[side];
    if (m.hellfire <= 0 || this.winner) return;
    const hero = this.heroes[side];
    if (!this.alive.some((o) => o.side === side && o.summonRounds === undefined)) return;
    const targets = this.foesOf(side).sort((a, b) => this.power(b) - this.power(a)).slice(0, 1 + m.hellTargets);
    if (!targets.length) return;
    ev.push({ type: 'skill', side, name: 'skill.hellfire' });
    const base = m.hellfire * (4 + 1.3 * hero.atk + 2 * (hero.power ?? 0));
    for (const t of targets) {
      if (t.count <= 0) continue;
      const crit = m.hellCrit > 0 && this.random() < m.hellCrit;
      const resist = t.def.faction === 'demon' ? 0.5 : 1;
      const d = Math.max(1, Math.round(base * (crit ? 2 : 1) * resist * (1 - this.sm(t).taken)));
      const near = m.hellSplash > 0 ? this.foesOf(side).filter((o) => o !== t && this.sdist(o, t) === 1) : [];
      this.hurt(t, d, ev, 'hellfire');
      if (t.count > 0 && m.hellBurn > 0 && !this.immune(t, 'burn')) this.addStatus(t, 'burn', 2, Math.max(1, Math.round(d * m.hellBurn)), ev, true);
      for (const o of near) if (o.count > 0) this.hurt(o, Math.max(1, Math.round(d * m.hellSplash)), ev, 'hellfire');
    }
    this.checkEnd(ev);
  }

  /** Round-start effects of the legendary boss relics (side modifiers). */
  private relicSkills(side: Side, ev: BattleEvent[]): void {
    const m = this.mods[side];
    const r = this.round;
    const foes = () => this.foesOf(side);
    const own = this.alive.filter((o) => o.side === side && o.summonRounds === undefined);
    if (!own.length) return;
    const skill = (name: string) => ev.push({ type: 'skill', side, name: `skill.${name}` });
    if (m.traps > 0) {
      const at = ev.length;
      if (this.layTraps(side, m.traps, 0.1, 3 * m.traps, ev)) ev.splice(at, 0, { type: 'skill', side, name: 'skill.traps' });
    }
    if (m.entangle > 0 && r % 2 === 1) {
      const t = foes().filter((e) => !e.def.flying && !this.immune(e, 'root')).sort((a, b) => this.power(b) - this.power(a))[0];
      if (t) { skill('entangle'); this.addStatus(t, 'root', 2, 1, ev, true); }
    }
    if (m.breath > 0 && r % 3 === 0 && foes().length) {
      skill('breath');
      for (const e of foes()) this.addStatus(e, 'poison', 2, Math.max(1, Math.round(this.hpTotal(e) * m.breath)), ev, true);
    }
    if (m.regrow > 0 && r < 20) {
      let any = false;
      for (const a of own) {
        const amount = this.heal(a, Math.ceil(a.startCount * a.def.hp * m.regrow), true);
        if (amount > 0) { if (!any) skill('regrow'); any = true; ev.push({ type: 'heal', uid: a.uid, amount, count: a.count }); }
      }
    }
    const army = own.reduce((a, o) => a + o.startCount * o.def.cost, 0);
    if (m.raise > 0 && r % 3 === 2) {
      const n = Math.max(2, Math.round(army * 0.1 * m.raise / UNITS.undead_t1_skeleton.cost));
      const at = ev.length;
      if (this.summonFor(side, 'undead_t1_skeleton', n, own, ev)) ev.splice(at, 0, { type: 'skill', side, name: 'skill.raise' });
    }
    if (m.imps > 0 && r % 3 === 2) {
      const n = Math.max(2, Math.round(army * 0.1 * m.imps / UNITS.demon_t1_imp.cost));
      const at = ev.length;
      if (this.summonFor(side, 'demon_t1_imp', n, own, ev)) ev.splice(at, 0, { type: 'skill', side, name: 'skill.imps' });
    }
    if (m.chill > 0 && r % 3 === 1 && foes().length) {
      skill('chill');
      for (const e of foes()) this.addStatus(e, 'slow', 2, 1, ev, true);
    }
    if (m.eruption > 0) {
      const list = foes().filter((e) => !this.immune(e, 'burn'));
      const t = list[Math.floor(this.random() * list.length)];
      if (t) { skill('eruption'); this.addStatus(t, 'burn', 2, Math.max(1, Math.round(this.hpTotal(t) * m.eruption)), ev, true); }
    }
  }

  /** Bosses do something extra at the start of every round (GDD: boss mechanics). */
  private bossSkill(s: Stack, ev: BattleEvent[]): void {
    const r = this.round;
    // ascension 5: skills of every second round fire every round
    const on = (parity: number) => this.sm(s).bossRage > 0 || r % 2 === parity;
    const skill = (p: string) => ev.push({ type: 'skill', side: s.side, uid: s.uid, name: `passiveName.${p}` });
    const foes = this.foesOf(s.side);
    const pick = (list: Stack[]) => list[Math.floor(this.random() * list.length)];
    if (this.has(s, 'trapper')) {
      const at = ev.length;
      if (this.layTraps(s.side, 2, 0.12, 6, ev)) ev.splice(at, 0, { type: 'skill', side: s.side, uid: s.uid, name: 'passiveName.trapper' });
    }
    if (this.has(s, 'rootGrasp') && on(1)) {
      const t = foes.filter((e) => !e.def.flying).sort((a, b) => this.power(b) - this.power(a))[0];
      if (t) {
        skill('rootGrasp');
        this.hurt(t, Math.max(1, Math.round(this.hpTotal(t) * 0.04)), ev, 'skill');
        if (t.count > 0) this.addStatus(t, 'root', 2, 1, ev, true);
      }
    }
    if (this.has(s, 'poisonBreath') && on(0) && foes.length) {
      skill('poisonBreath');
      for (const e of foes) this.addStatus(e, 'poison', 2, Math.max(1, Math.round(this.hpTotal(e) * 0.04)), ev, true);
    }
    if (this.has(s, 'regrow') && r < 20) {
      const amount = this.heal(s, Math.round(s.startCount * s.def.hp * 0.06), true);
      if (amount > 0) { skill('regrow'); ev.push({ type: 'heal', uid: s.uid, amount, count: s.count }); }
    }
    if (this.has(s, 'raiseDead') && on(0)) {
      const n = Math.round(s.def.cost * 0.12 / UNITS.undead_t1_skeleton.cost) + Math.floor(r / 2);
      const at = ev.length;
      if (this.summonFor(s.side, 'undead_t1_skeleton', n, [s], ev)) ev.splice(at, 0, { type: 'skill', side: s.side, uid: s.uid, name: 'passiveName.raiseDead' });
    }
    if (this.has(s, 'blizzard') && on(0) && foes.length) {
      skill('blizzard');
      for (const e of foes) {
        this.hurt(e, Math.max(1, Math.round(this.hpTotal(e) * 0.03)), ev, 'skill');
        if (e.count > 0) this.addStatus(e, 'slow', 2, 1, ev, true);
      }
    }
    if (this.has(s, 'eruption')) {
      const list = foes.filter((e) => !this.immune(e, 'burn'));
      if (list.length) skill('eruption');
      for (let i = 0; i < 2 && list.length; i++) {
        const t = pick(list);
        list.splice(list.indexOf(t), 1);
        this.addStatus(t, 'burn', 2, Math.max(1, Math.round(this.hpTotal(t) * 0.06)), ev, true);
      }
    }
    if (this.has(s, 'stoneSkin')) {
      const sh = s.statuses.find((x) => x.id === 'shield');
      if (!sh || sh.value < 12) {
        skill('stoneSkin');
        if (sh) { sh.value = Math.min(12, sh.value + 3); sh.turns = Math.max(sh.turns, 3); ev.push({ type: 'status', uid: s.uid, status: 'shield', on: true }); }
        else this.addStatus(s, 'shield', 3, 3, ev);
      }
    }
    if (this.has(s, 'hellGate') && on(0)) {
      const n = Math.round(s.def.cost * 0.12 / UNITS.demon_t1_imp.cost) + Math.floor(r / 2);
      const at = ev.length;
      if (this.summonFor(s.side, 'demon_t1_imp', n, [s], ev)) ev.splice(at, 0, { type: 'skill', side: s.side, uid: s.uid, name: 'passiveName.hellGate' });
    }
  }

  // ---------- tactics: placing the player's stacks before the battle (v0.18) ----------

  /** Is a hex inside the player's set-up zone (the first `cols` columns, no obstacles)? */
  inDeployZone(h: Hex, cols: number): boolean {
    return h.col >= 0 && h.col < cols && h.row >= 0 && h.row < ROWS && !this.obstacles.has(key(h));
  }

  /** All player stacks stand inside the zone and do not overlap. */
  private layoutOk(cols: number): boolean {
    const seen = new Set<string>();
    for (const s of this.stacks.filter((x) => x.side === 'player' && x.count > 0)) {
      for (const c of this.cells(s)) {
        if (!this.inDeployZone(c, cols) || seen.has(key(c))) return false;
        seen.add(key(c));
      }
    }
    return true;
  }

  /** Head hex for a stack clicked onto `h` (wide units cover the hex behind them, so col 0 becomes col 1). */
  private deployHead(s: Stack, h: Hex): Hex { return s.def.wide && h.col === 0 ? { col: 1, row: h.row } : h; }

  /** Move a player stack to `h` before the battle; another own stack standing there swaps places. */
  deploy(uid: number, h: Hex, cols: number): boolean {
    const s = this.stack(uid);
    if (!s || s.side !== 'player' || this.round > 0) return false;
    const target = this.deployHead(s, h);
    const other = this.stacks.find((o) => o !== s && o.side === 'player' && o.count > 0 && this.cells(o).some((c) => eq(c, h)));
    const old = s.pos, oldOther = other?.pos;
    s.pos = other ? this.deployHead(s, other.pos) : target;
    if (other) other.pos = this.deployHead(other, old);
    if (this.layoutOk(cols)) return true;
    s.pos = old; if (other && oldOther) other.pos = oldOther;
    return false;
  }

  /** Can `uid` be placed on `h` (directly or by swapping)? Used for highlighting, changes nothing. */
  canDeploy(uid: number, h: Hex, cols: number): boolean {
    const others = this.stacks.filter((o) => o.side === 'player');
    const saved = others.map((o) => o.pos);
    const ok = this.deploy(uid, h, cols);
    others.forEach((o, i) => { o.pos = saved[i]; });
    return ok;
  }

  /** Start hexes from the last battle; stacks without one (or blocked by an obstacle) take the nearest free hex. */
  private applyFormation(pos: (Hex | null | undefined)[], cols: number): void {
    const own = this.stacks.filter((s) => s.side === 'player');
    const defaults = own.map((s) => s.pos);
    const taken = new Set<string>();
    const fits = (s: Stack, p: Hex) => this.cells(s, p).every((c) => this.inDeployZone(c, cols) && !taken.has(key(c)));
    const order = own.map((s, i) => i).sort((a, b) => (pos[b] ? 1 : 0) - (pos[a] ? 1 : 0));   // remembered ones first
    for (const i of order) {
      const s = own[i];
      const want = pos[i] ? this.deployHead(s, pos[i]!) : defaults[i];
      const cands = [want, defaults[i], ...allHexes().sort((a, b) => distance(a, want) - distance(b, want))];
      const p = cands.find((c) => fits(s, c));
      if (!p) { own.forEach((o, k) => { o.pos = defaults[k]; }); return; }   // should not happen: fall back to the normal set-up
      s.pos = p;
      for (const c of this.cells(s)) taken.add(key(c));
    }
  }

  /** Share of a side's own army (leadership value, summons not counted) missing now: 0 = no unit lost. */
  lossShare(side: Side): number {
    const own = this.stacks.filter((s) => s.side === side && s.summonRounds === undefined);
    const start = own.reduce((a, s) => a + s.startCount * s.def.cost, 0);
    return start > 0 ? Math.max(0, 1 - own.reduce((a, s) => a + Math.min(s.count, s.startCount) * s.def.cost, 0) / start) : 0;
  }

  /** Did the player kill a treasure goblin before it ran away? */
  treasureKilled(): boolean {
    return this.stacks.some((s) => s.side === 'enemy' && this.has(s, 'treasure') && s.count <= 0 && !this.fled.has(s.uid));
  }

  /** Start-of-turn effects for a stack: statuses tick, regeneration, auras, summons expire, fear. */
  private turnStart(s: Stack, ev: BattleEvent[]): boolean {
    s.defending = false;
    if (s.cooldown > 0) s.cooldown--;
    if (s.summonRounds !== undefined) {
      s.summonRounds--;
      if (s.summonRounds <= 0) { s.count = 0; ev.push({ type: 'vanish', uid: s.uid }); return false; }
    }
    // treasure goblins run away with their loot in round 3
    if (this.has(s, 'treasure') && this.round >= 3) {
      s.count = 0; this.fled.add(s.uid);
      ev.push({ type: 'flee', uid: s.uid });
      return false;
    }
    // statuses
    for (const st of [...s.statuses]) {
      if (st.id === 'poison' || st.id === 'burn') {
        const kills = this.damage(s, st.value);
        this.wardEvent(s, ev);
        ev.push({ type: 'dot', uid: s.uid, damage: st.value - this.lastAbsorb, kills, left: s.count, source: st.id === 'burn' ? 'burn' : undefined });
        if (s.count <= 0) { ev.push({ type: 'death', uid: s.uid }); return false; }
      }
      if (st.id === 'regrowth') {
        const amount = this.heal(s, st.value, false);
        if (amount > 0) ev.push({ type: 'heal', uid: s.uid, amount, count: s.count });
      }
      st.turns--;
      if (st.turns <= 0) {
        s.statuses = s.statuses.filter((x) => x !== st);
        ev.push({ type: 'status', uid: s.uid, status: st.id, on: false });
      }
    }
    // exhaustion: from round 20 nothing regenerates any more, so two regenerating stacks cannot fight forever
    const exhausted = this.round >= 20;
    const rg = this.sm(s).regen;
    if (rg > 0 && s.summonRounds === undefined && !exhausted) {
      const amount = this.heal(s, Math.ceil(s.def.hp * rg * s.count), false);
      if (amount > 0) ev.push({ type: 'heal', uid: s.uid, amount, count: s.count });
    }
    if (this.has(s, 'regen') && s.topHp < s.def.hp && !exhausted) {
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
    if (dragons.length && !this.immune(s, 'fear') && this.random() < 0.25) {
      ev.push({ type: 'skip', uid: s.uid, reason: 'fear' });
      return false;
    }
    // stunned stacks lose this turn
    if (this.hasStatus(s, 'stun')) {
      s.statuses = s.statuses.filter((x) => x.id !== 'stun');
      ev.push({ type: 'status', uid: s.uid, status: 'stun', on: false });
      ev.push({ type: 'skip', uid: s.uid, reason: 'fear' });
      return false;
    }
    // the Void God calls its spawn every second round
    if (this.has(s, 'voidCaller') && this.round % 2 === 0) this.voidCall(s, ev);
    // fear spell: half of the turns are lost
    if (this.hasStatus(s, 'fear') && this.random() < 0.5) {
      ev.push({ type: 'skip', uid: s.uid, reason: 'fear' });
      return false;
    }
    return true;
  }

  /** Final boss: summons void spawn (even calls) or eye tentacles (odd calls) next to itself. */
  private voidCall(s: Stack, ev: BattleEvent[]): void {
    const n = Math.floor(this.round / 2);
    const id = n % 2 === 1 ? 'summon_void_spawn' : 'summon_void_eye_tentacle';
    const def = UNITS[id];
    if (!def) return;
    const near = this.cells(s).flatMap((c) => neighbors(c)).filter((h) => this.isFree(h));
    const free = near[0] ?? allHexes().filter((h) => this.isFree(h)).sort((a, b) => distance(a, s.pos) - distance(b, s.pos))[0];
    if (!free) return;
    const count = id === 'summon_void_spawn' ? 4 + 2 * n : 2 + n;
    const st = this.addStack(def, s.side, count, free);
    st.summonRounds = 99;
    this.queue.push(st.uid);
    ev.push({ type: 'summon', uid: st.uid });
  }

  /** Advance to the next stack that may act. Returns events (round start, effects, turn). */
  nextTurn(): BattleEvent[] {
    const ev: BattleEvent[] = [];
    for (;;) {
      if (this.checkEnd(ev)) return ev;
      if (!this.queue.length && !this.waitQueue.length) {
        ev.push(...this.startRound());
        if (this.checkEnd(ev)) return ev;   // round-start/-end talents can end the battle
      }
      const uid = this.queue.length ? this.queue.shift()! : this.waitQueue.shift()!;
      const s = this.stack(uid);
      if (s.count <= 0) continue;
      this.activeUid = uid;
      // start-of-turn effects only once per round: waiting or a morale bonus turn must not
      // tick cooldowns, statuses, poison or regeneration a second time
      if (!s.started) {
        s.started = true;
        if (!this.turnStart(s, ev)) { this.activeUid = -1; continue; }
      }
      ev.push({ type: 'turn', uid });
      return ev;
    }
  }

  private checkEnd(ev: BattleEvent[]): boolean {
    if (this.winner) return true;
    // summoned stacks alone do not keep a side alive
    const real = (s: Stack) => s.summonRounds === undefined && !this.has(s, 'treasure');
    const p = this.alive.some((s) => s.side === 'player' && real(s));
    const e = this.alive.some((s) => s.side === 'enemy' && real(s));
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
      case 'dive': return enemies.filter((e) => this.landingHex(s, e, this.speedOf(s)) !== null).map((e) => e.uid);
      case 'bloodFrenzy': return enemies.filter((e) => this.landingHex(s, e) !== null).map((e) => e.uid);
      case 'deathWave': return enemies.map((e) => e.uid);
      case 'decayBreath': case 'lightLance': case 'quakeStrike': case 'smash': case 'finalStand':
        return this.adjacentEnemies(s).filter((e) => this.targetable(e) && (ab.id !== 'smash' || !this.immune(e, 'stun'))).map((e) => e.uid);
      case 'mark': case 'fireSpark': return enemies.map((e) => e.uid);
      case 'doubleShot': case 'explosiveBolt': case 'axeVolley': case 'infernoBlast': return this.canShoot(s) ? enemies.map((e) => e.uid) : [];
      case 'entangle': return enemies.filter((e) => this.sdist(s, e) <= 4 && !e.def.flying).map((e) => e.uid);
      case 'sporeCloud': return enemies.filter((e) => this.sdist(s, e) <= 4).map((e) => e.uid);
      case 'seduce': return enemies.filter((e) => this.sdist(s, e) <= 4 && !this.immune(e, 'stun')).map((e) => e.uid);
      case 'burrow': case 'hunt': case 'hellPortal': return enemies.filter((e) => this.landingHex(s, e) !== null).map((e) => e.uid);
      case 'rootStrike': case 'rampage': case 'overpressure': return this.adjacentEnemies(s).some((e) => this.targetable(e)) ? [s.uid] : [];
      case 'howl': return enemies.some((e) => this.sdist(s, e) <= 2) ? [s.uid] : [];
      case 'ironStance': case 'warcry': case 'worldfire': return [s.uid];
      case 'bloodSacrifice': return s.count > 1 ? this.alliesOf(s).filter((a) => a.summonRounds === undefined && this.hpTotal(a) < a.startCount * a.def.hp).map((a) => a.uid) : [];
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
    s.cooldown = ab.cooldown >= 99 ? ab.cooldown : Math.max(1, ab.cooldown - this.sm(s).cooldown);
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
        const land = this.landingHex(s, t, this.speedOf(s))!;
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
      case 'mark': this.addStatus(t, 'marked', 3, 1, ev, true); break;
      case 'doubleShot':
        s.shots--;
        ev.push(...this.strike(s, t, true, { mult: 0.8 }));
        if (t.count > 0 && s.count > 0) ev.push(...this.strike(s, t, true, { mult: 0.8, noCrit: true }));
        break;
      case 'entangle': this.addStatus(t, 'root', 2, 1, ev, true); break;
      case 'sporeCloud': {
        for (const v of [t, ...this.enemiesOf(s).filter((e) => e !== t && this.sdist(e, t) === 1)]) {
          this.addStatus(v, 'poison', 3, Math.max(3, Math.round(s.count * (s.def.dmg[0] + s.def.dmg[1]) / 2 * 0.35)), ev, true);
        }
        break;
      }
      case 'lightLance': {
        ev.push(...this.strike(s, t, false, { kind: 'area', mult: 1.1 }));
        const bh = behind(s.pos, t.pos);
        const b = inBounds(bh) ? this.stackAt(bh) : undefined;
        if (b && b.side !== s.side && this.targetable(b)) ev.push(...this.strike(s, b, false, { kind: 'area' }));
        break;
      }
      case 'rootStrike':
        for (const e of this.adjacentEnemies(s).filter((x) => this.targetable(x))) {
          ev.push(...this.strike(s, e, false, { kind: 'area', mult: 0.5 }));
          if (e.count > 0) this.addStatus(e, 'stun', 2, 1, ev, true);
        }
        break;
      case 'burrow': case 'hunt': case 'hellPortal': {
        const land = this.landingHex(s, t)!;
        if (!eq(land, s.pos)) { ev.push({ type: 'teleport', uid: s.uid, to: land }); s.pos = land; }
        ev.push(...this.meleeExchange(s, t, ab.id === 'hunt' ? { mult: 1.2 } : {}));
        break;
      }
      case 'quakeStrike': {
        ev.push(...this.meleeExchange(s, t));
        if (t.count > 0 && !t.def.wide && !t.def.sizeScale) {
          const to = behind(s.pos, t.pos);
          if (inBounds(to) && this.isFree(to)) { t.pos = to; ev.push({ type: 'teleport', uid: t.uid, to }); }
        }
        break;
      }
      case 'explosiveBolt': case 'axeVolley': case 'infernoBlast': {
        s.shots--;
        const victims = [t, ...this.enemiesOf(s).filter((e) => e !== t && this.targetable(e) && this.sdist(e, t) === 1)];
        for (const v of victims) {
          ev.push(...this.strike(s, v, true, { kind: 'area', mult: v === t ? 0.9 : 0.6, noCrit: true }));
          if (ab.id === 'infernoBlast' && v.count > 0) this.addStatus(v, 'burn', 2, Math.max(3, Math.round(s.count * s.def.dmg[0] * 0.2)), ev);
        }
        break;
      }
      case 'ironStance':
        this.addStatus(s, 'shield', 2, 8, ev);
        this.addStatus(s, 'root', 2, 1, ev);
        break;
      case 'overpressure': {
        const cost = Math.max(1, Math.floor(this.hpTotal(s) * 0.15));
        const kills = this.damage(s, cost);
        ev.push({ type: 'dot', uid: s.uid, damage: cost, kills, left: s.count });
        for (const e of this.adjacentEnemies(s).filter((x) => this.targetable(x))) ev.push(...this.strike(s, e, false, { kind: 'area', mult: 1.1 }));
        break;
      }
      case 'finalStand':
        ev.push(...this.meleeExchange(s, t, { mult: 0.8 }));
        if (t.count > 0 && s.count > 0) ev.push(...this.strike(s, t, false, { mult: 0.8, kind: 'area' }));
        break;
      case 'warcry':
        this.addStatus(s, 'bless', 3, 20, ev);
        this.addStatus(s, 'haste', 3, 1, ev);
        break;
      case 'bloodSacrifice': {
        const lost = Math.max(1, Math.floor(s.count / 4));
        const kills = this.damage(s, lost * s.def.hp);
        ev.push({ type: 'dot', uid: s.uid, damage: lost * s.def.hp, kills, left: s.count });
        const amount = this.heal(t, s.count * 25 + lost * 30, true);
        if (amount > 0) ev.push({ type: 'heal', uid: t.uid, amount, count: t.count });
        this.addStatus(t, 'bless', 3, 15, ev);
        break;
      }
      case 'smash':
        ev.push(...this.meleeExchange(s, t));
        if (t.count > 0) this.addStatus(t, 'stun', 2, 1, ev, true);
        break;
      case 'rampage':
        for (const e of this.adjacentEnemies(s).filter((x) => this.targetable(x))) ev.push(...this.strike(s, e, false, { kind: 'area', mult: 0.85 }));
        break;
      case 'fireSpark': ev.push(...this.strike(s, t, true, { kind: 'area', mult: 0.6 })); break;
      case 'howl':
        for (const e of this.enemiesOf(s).filter((x) => this.sdist(s, x) <= 2)) {
          this.addStatus(e, 'atkDown', 2, 2, ev);
          this.addStatus(e, 'slow', 3, 1, ev);
        }
        break;
      case 'seduce': this.addStatus(t, 'stun', 2, 1, ev, true); break;
      case 'worldfire': {
        const cost = Math.max(1, Math.floor(this.hpTotal(s) * 0.15));
        const kills = this.damage(s, cost);
        ev.push({ type: 'dot', uid: s.uid, damage: cost, kills, left: s.count });
        if (s.count > 0) for (const e of this.enemiesOf(s).filter((x) => this.targetable(x))) ev.push(...this.strike(s, e, true, { kind: 'area', mult: 0.45, noCrit: true }));
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


  // ---------- hero magic ----------

  spellbook(side: Side): SpellSlot[] { return this.heroes[side].spells ?? []; }
  spellPower(side: Side): number { return this.heroes[side].power ?? 0; }
  spellLevel(side: Side, id: string): number { return this.spellbook(side).find((x) => x.id === id)?.level ?? 0; }
  /** Effect numbers of a spell for this side (power and level applied). */
  spellValues(side: Side, id: string): Record<string, number> { return spellNumbers(id, this.spellPower(side), this.spellLevel(side, id)); }

  /** Can this side's hero cast a spell right now? (once per round, during one of its own stacks' turns) */
  canCast(side: Side): boolean {
    const a = this.active;
    return !this.winner && !!a && a.side === side && this.castsDone[side] < 1 + this.mods[side].extraCast && this.spellbook(side).length > 0;
  }

  /** Stacks the spell may target now; for mass spells the stacks it would hit. [] = cannot be cast. */
  spellTargets(side: Side, id: string, scroll = false): number[] {
    const sp = SPELLS[id];
    if (!sp || (!scroll && (!this.spellLevel(side, id) || this.mana[side] < this.spellCost(side, id)))) return [];
    const enemies = this.alive.filter((o) => o.side !== side && this.targetable(o));
    const allies = this.alive.filter((o) => o.side === side);
    const missing = (a: Stack, revive: boolean) => (revive ? a.startCount : a.count) * a.def.hp - this.hpTotal(a) > 0;
    const can = (e: Stack, st: StatusId) => !this.immune(e, st);
    let list: Stack[];
    switch (id) {
      case 'holyHeal': list = allies.filter((a) => missing(a, false) || a.statuses.some((x) => NEGATIVE.has(x.id))); break;
      case 'resurrection': list = allies.filter((a) => a.summonRounds === undefined && !a.def.undead && !this.has(a, 'construct') && missing(a, true)); break;
      case 'raiseDead': list = allies.filter((a) => a.summonRounds === undefined && a.def.undead && missing(a, true)); break;
      case 'regrowth': list = allies.filter((a) => missing(a, false)); break;
      case 'slow': list = enemies.filter((e) => can(e, 'slow')); break;
      case 'curseOfWeakness': list = enemies.filter((e) => can(e, 'atkDown')); break;
      case 'quicksand': list = enemies.filter((e) => can(e, 'defDown')); break;
      case 'fear': list = enemies.filter((e) => can(e, 'fear')); break;
      case 'inferno': list = enemies.filter((e) => can(e, 'burn')); break;
      case 'earthquake': list = enemies.filter((e) => !e.def.flying); break;
      case 'healingRain': list = allies.filter((a) => missing(a, false)); break;
      case 'callOfTheWild': {
        // one wolf pack at a time
        const pack = allies.some((a) => a.summonRounds !== undefined && a.def.id === 'neutral_dire_wolf');
        list = pack ? [] : allies.filter((a) => a.summonRounds === undefined);
        break;
      }
      default: list = sp.target === 'ally' ? allies : enemies;
    }
    return list.map((x) => x.uid);
  }

  /** Mana cost after talents: school cost reduction (max 80 %), the first spell of a "free" school costs nothing. */
  spellCost(side: Side, id: string): number {
    const sp = SPELLS[id];
    if (!sp) return 0;
    const m = this.mods[side];
    if (m[`${sp.school}Free`] > 0 && !this.freeUsed[side].has(sp.school)) return 0;
    return Math.max(1, Math.round(sp.cost * (1 - Math.min(0.8, m[`${sp.school}Cost`]))));
  }
  /** Talent mass upgrade of the spell's school: 'ally' spells on all allies, enemy spells on all enemies. */
  massFor(side: Side, id: string): boolean {
    const sp = SPELLS[id];
    if (!sp) return false;
    const m = this.mods[side];
    if (sp.target === 'ally') return m[`${sp.school}MassAlly`] > 0;
    if (sp.target === 'enemy' || sp.target === 'area') return m[`${sp.school}MassEnemy`] > 0;
    return false;
  }
  castsWithoutTarget(side: Side, id: string): boolean { return noTarget(SPELLS[id]?.target ?? '') || this.massFor(side, id); }

  /** Stacks an area spell hits when aimed at `t`: the target and every enemy next to it. */
  areaOf(side: Side, t: Stack): Stack[] {
    return [t, ...this.alive.filter((o) => o.side !== side && o !== t && this.targetable(o) && this.sdist(o, t) === 1)];
  }

  isLegalCast(side: Side, id: string, target?: number): boolean {
    if (!this.canCast(side)) return false;
    const targets = this.spellTargets(side, id);
    if (!targets.length) return false;
    return this.castsWithoutTarget(side, id) || (target !== undefined && targets.includes(target));
  }

  /** Spell damage: ignores ATK/DEF and the ghosts' ethereal passive, but not elements and "damage taken" talents. */
  private spellHit(side: Side, t: Stack, spell: string, base: number, ev: BattleEvent[]): number {
    const el = SPELLS[spell].element;
    let m = 1 + this.mods[side].spellDmg + this.mods[side][`${SPELLS[spell].school}Dmg`];
    if (el === 'holy' && (t.def.undead || t.def.faction === 'demon')) m *= 1.5;
    if (el === 'death' && t.def.undead) m *= 0.5;
    if (el === 'fire' && t.def.faction === 'demon') m *= 0.5;
    if (this.has(t, 'magicResist')) m *= 0.5;
    m *= 1 - this.sm(t).taken;
    const raw = Math.max(1, Math.round(base * m));
    const kills = this.damage(t, raw);
    const dealt = raw - this.lastAbsorb;
    this.wardEvent(t, ev);
    ev.push({ type: 'spellHit', uid: t.uid, spell, damage: dealt, kills, left: t.count });
    if (t.count === 0) ev.push({ type: 'death', uid: t.uid });
    return dealt;
  }

  private spellHeal(side: Side, a: Stack, amount: number, revive: boolean, ev: BattleEvent[]): number {
    const healed = this.heal(a, Math.round(amount * (1 + this.mods[side].spellDmg + this.mods[side].spellHeal)), revive);
    if (healed > 0) ev.push({ type: 'heal', uid: a.uid, amount: healed, count: a.count });
    return healed;
  }

  /** Cast a hero spell. Does not end the active stack's turn. */
  cast(side: Side, id: string, target?: number): BattleEvent[] {
    if (!this.isLegalCast(side, id, target)) throw new Error(`illegal spell ${id} -> ${target}`);
    const mass = this.massFor(side, id);
    const all = mass ? this.spellTargets(side, id) : [];
    const cost = this.spellCost(side, id);
    if (cost === 0 && this.mods[side][`${SPELLS[id].school}Free`] > 0) this.freeUsed[side].add(SPELLS[id].school);
    this.mana[side] -= cost;
    this.castsDone[side]++;
    this.castThisRound[side] = this.castsDone[side] >= 1 + this.mods[side].extraCast;
    const ev: BattleEvent[] = [{ type: 'cast', side, spell: id, target: mass ? undefined : target, mana: this.mana[side] }];
    if (mass) {
      // talent "mass" upgrade: the spell works on every valid target (area spells hit each target once)
      for (const uid of all) if (this.stack(uid).count > 0) ev.push(...this.spellEffect(side, id, uid, this.spellLevel(side, id), true));
    } else ev.push(...this.spellEffect(side, id, target, this.spellLevel(side, id)));
    this.checkEnd(ev);
    return ev;
  }

  /** The effect of a spell at a given level (used by casting and by scrolls). */
  private spellEffect(side: Side, id: string, target: number | undefined, lvl: number, single = false): BattleEvent[] {
    const n = spellNumbers(id, this.spellPower(side), lvl);
    const ev: BattleEvent[] = [];
    const t = target !== undefined ? this.stack(target) : undefined;
    // statuses that matter during the target's own turns get one extra tick (they count down at turn start)
    const buff = (s: Stack, st: StatusId, turns: number, value: number) => this.addStatus(s, st, turns + 1, value, ev, true);
    switch (id) {
      case 'holyHeal':
        if (lvl >= 2) this.cleanse(t!, ev);
        this.spellHeal(side, t!, n.n, false, ev);
        break;
      case 'resurrection': case 'raiseDead': this.spellHeal(side, t!, n.n, true, ev); break;
      case 'smite': case 'rockSpike': case 'lightningBolt': this.spellHit(side, t!, id, n.n, ev); break;
      case 'lifeDrain': {
        const dealt = this.spellHit(side, t!, id, n.n, ev);
        const own = this.alive.filter((a) => a.side === side && a.summonRounds === undefined)
          .sort((a, b) => (b.startCount * b.def.hp - this.hpTotal(b)) - (a.startCount * a.def.hp - this.hpTotal(a)))[0];
        if (own && dealt > 0) this.spellHeal(side, own, dealt * 0.5, true, ev);
        break;
      }
      case 'chainLightning': {
        let cur: Stack | undefined = t!;
        const hit = new Set<number>();
        let mult = 1;
        for (let i = 0; i < (single ? 1 : 3) && cur; i++) {
          hit.add(cur.uid);
          this.spellHit(side, cur, id, n.n * mult, ev);
          mult *= 0.5;
          const from: Stack = cur;
          cur = this.alive.filter((o) => o.side !== side && this.targetable(o) && !hit.has(o.uid))
            .sort((a, b) => this.sdist(a, from) - this.sdist(b, from))[0];
        }
        break;
      }
      case 'deathCloud': case 'fireball': case 'radiantBurst': case 'boulderThrow':
        for (const v of single ? [t!] : this.areaOf(side, t!)) if (v.count > 0) this.spellHit(side, v, id, n.n, ev);
        break;
      case 'meteor':
        for (const v of single ? [t!] : this.areaOf(side, t!)) {
          if (v.count > 0) this.spellHit(side, v, id, n.n, ev);
          if (v.count > 0 && !this.immune(v, 'burn')) this.addStatus(v, 'burn', n.t, n.b, ev, true);
        }
        break;
      case 'earthquake':
        for (const v of this.alive.filter((o) => o.side !== side && this.targetable(o) && !o.def.flying)) this.spellHit(side, v, id, n.n, ev);
        break;
      case 'thunderstorm':
        for (const v of this.alive.filter((o) => o.side !== side && this.targetable(o))) if (v.count > 0) this.spellHit(side, v, id, n.n, ev);
        break;
      case 'soulHarvest': {
        let dealt = 0;
        for (const v of this.alive.filter((o) => o.side !== side && this.targetable(o))) if (v.count > 0) dealt += this.spellHit(side, v, id, n.n, ev);
        const own = this.alive.filter((a) => a.side === side && a.summonRounds === undefined)
          .sort((a, b) => (b.startCount * b.def.hp - this.hpTotal(b)) - (a.startCount * a.def.hp - this.hpTotal(a)))[0];
        if (own && dealt > 0) this.spellHeal(side, own, dealt * n.h / 100, true, ev);
        break;
      }
      case 'healingRain':
        for (const a of this.alive.filter((o) => o.side === side)) this.spellHeal(side, a, n.n, false, ev);
        break;
      case 'callOfTheWild': {
        const own = this.alive.filter((a) => a.side === side && a.summonRounds === undefined);
        const wolf = UNITS.neutral_dire_wolf;
        this.summonFor(side, 'neutral_dire_wolf', Math.max(1, Math.floor(n.n / wolf.cost)), own, ev);
        break;
      }
      case 'poisonSpores':
        for (const v of single ? [t!] : this.areaOf(side, t!)) this.addStatus(v, 'poison', n.t, n.n, ev, true);
        break;
      case 'inferno': this.addStatus(t!, 'burn', n.t, n.n, ev, true); break;
      case 'blessing': buff(t!, 'bless', n.t, n.n); break;
      case 'bloodRage': buff(t!, 'frenzy', n.t, n.n); break;
      case 'divineShield': this.addStatus(t!, 'ward', n.t, Math.round(n.n * (1 + this.mods[side].spellDmg)), ev, true); break;
      case 'haste': buff(t!, 'haste', n.t, lvl); break;
      case 'slow': buff(t!, 'slow', n.t, lvl); break;
      case 'battleFocus': buff(t!, 'focus', n.t, n.n); break;
      case 'confusion': buff(t!, 'confused', n.t, 1); break;
      case 'curseOfWeakness': buff(t!, 'atkDown', n.t, n.n); break;
      case 'quicksand': buff(t!, 'defDown', n.t, n.n); break;
      case 'fear': buff(t!, 'fear', n.t, 1); break;
      case 'entanglingRoots':
        buff(t!, 'root', n.t, 1);
        if (n.d) buff(t!, 'defDown', n.t, n.d);
        break;
      case 'regrowth': this.addStatus(t!, 'regrowth', n.t, Math.round(n.n * (1 + this.mods[side].spellDmg)), ev, true); break;
      case 'thornArmor': buff(t!, 'thornskin', n.t, n.n); break;
      case 'stoneSkin': buff(t!, 'shield', n.t, n.n); break;
    }
    return ev;
  }

  /** Remove harmful statuses (holy heal from level 2). */
  private cleanse(s: Stack, ev: BattleEvent[]): void {
    for (const st of s.statuses.filter((x) => NEGATIVE.has(x.id))) {
      s.statuses = s.statuses.filter((x) => x !== st);
      ev.push({ type: 'status', uid: s.uid, status: st.id, on: false });
    }
  }

  /** AI: the most useful spell (and target) for this side right now, or null. Scores are in leadership points. */
  spellChoice(side: Side): { id: string; target?: number; score: number } | null {
    if (!this.canCast(side)) return null;
    let best: { id: string; target?: number; score: number } | null = null;
    const power = (s: Stack) => s.count * s.def.cost;
    const killValue = (e: Stack, dmg: number) => Math.min(e.count, dmg / e.def.hp) * e.def.cost;
    const contact = (s: Stack) => this.enemiesOf(s).some((e) => this.sdist(s, e) <= this.speedOf(e) + 1 || e.def.ranged);
    for (const slot of this.spellbook(side)) {
      const sp = SPELLS[slot.id];
      const n = this.spellValues(side, slot.id);
      const targets = this.spellTargets(side, slot.id);
      if (!targets.length) continue;
      const elMul = (e: Stack) => {
        const el = sp.element;
        return (el === 'holy' && (e.def.undead || e.def.faction === 'demon') ? 1.5 : 1)
          * (el === 'death' && e.def.undead ? 0.5 : 1) * (el === 'fire' && e.def.faction === 'demon' ? 0.5 : 1)
          * (1 + this.mods[side].spellDmg);
      };
      const score = (uid: number): number => {
        const x = this.stack(uid);
        const has = (st: StatusId) => this.hasStatus(x, st);
        switch (slot.id) {
          case 'smite': case 'rockSpike': case 'lightningBolt': return killValue(x, n.n * elMul(x));
          case 'lifeDrain': return killValue(x, n.n * elMul(x)) * 1.4;
          case 'chainLightning': {
            // the chain jumps to up to two more enemies with 50 % and 25 % damage
            const more = this.alive.filter((o) => o.side !== side && o !== x && this.targetable(o)).length;
            return killValue(x, n.n) + (more >= 1 ? 0.5 : 0) * n.n / x.def.hp * x.def.cost * 0.8 + (more >= 2 ? 0.25 : 0) * n.n / x.def.hp * x.def.cost * 0.8;
          }
          case 'deathCloud': case 'fireball': case 'radiantBurst': case 'boulderThrow':
            return this.areaOf(side, x).reduce((a, v) => a + killValue(v, n.n * elMul(v)), 0);
          case 'meteor': return this.areaOf(side, x).reduce((a, v) => a + killValue(v, n.n * elMul(v) + (this.immune(v, 'burn') ? 0 : n.b * n.t * 0.7)), 0);
          case 'earthquake': case 'thunderstorm': return targets.reduce((a, u) => { const v = this.stack(u); return a + killValue(v, n.n * elMul(v)); }, 0);
          case 'soulHarvest': return targets.reduce((a, u) => { const v = this.stack(u); return a + killValue(v, n.n * elMul(v)) * 1.25; }, 0);
          case 'healingRain': return this.alive.filter((a) => a.side === side)
            .reduce((a, v) => a + Math.min(v.count * v.def.hp - this.hpTotal(v), n.n) / v.def.hp * v.def.cost, 0);
          case 'callOfTheWild': return n.n * 0.8;
          case 'poisonSpores': return this.areaOf(side, x).filter((v) => !this.immune(v, 'poison') && !this.hasStatus(v, 'poison'))
            .reduce((a, v) => a + killValue(v, n.n * n.t) * 0.7, 0);
          case 'inferno': return has('burn') ? 0 : killValue(x, n.n * n.t) * 0.7;
          case 'holyHeal': case 'regrowth': {
            const miss = x.count * x.def.hp - this.hpTotal(x);
            const amount = slot.id === 'regrowth' ? n.n * n.t * 0.6 : n.n;
            return Math.min(miss, amount) / x.def.hp * x.def.cost + (x.statuses.some((s) => NEGATIVE.has(s.id)) && slot.level >= 2 ? 6 : 0);
          }
          case 'resurrection': case 'raiseDead': return Math.min(x.startCount * x.def.hp - this.hpTotal(x), n.n) / x.def.hp * x.def.cost;
          case 'blessing': return has('bless') ? 0 : power(x) * n.n / 100 * (x.def.ranged || contact(x) ? 0.9 : 0.4);
          case 'bloodRage': return has('frenzy') ? 0 : power(x) * (n.n / 100 - 0.12) * (contact(x) ? 0.9 : 0.4);
          case 'battleFocus': return has('focus') ? 0 : power(x) * 0.045 * n.n * (x.def.ranged || contact(x) ? 1 : 0.5);
          case 'stoneSkin': return has('shield') ? 0 : power(x) * 0.035 * n.n * (contact(x) ? 1 : 0.3);
          case 'divineShield': return has('ward') ? 0 : Math.min(n.n, this.hpTotal(x)) / x.def.hp * x.def.cost * (contact(x) ? 0.8 : 0.3);
          case 'thornArmor': return has('thornskin') || x.def.ranged ? 0 : power(x) * n.n / 100 * (contact(x) ? 0.6 : 0.2);
          case 'haste': return has('haste') ? 0 : power(x) * (x.def.ranged ? 0.05 : 0.12);
          case 'slow': return has('slow') ? 0 : power(x) * (x.def.ranged || x.def.flying ? 0.06 : 0.14);
          case 'curseOfWeakness': return has('atkDown') ? 0 : power(x) * 0.04 * n.n;
          case 'quicksand': return has('defDown') ? 0 : power(x) * 0.035 * n.n;
          case 'fear': return has('fear') ? 0 : power(x) * 0.3;
          case 'confusion': return has('confused') || x.def.ranged ? 0 : power(x) * 0.12;
          case 'entanglingRoots': return has('root') || x.def.ranged ? 0
            : power(x) * (this.adjacentEnemies(x).length ? 0.05 : 0.25) + (n.d ? power(x) * 0.03 * n.d : 0);
        }
        return 0;
      };
      if (this.massFor(side, slot.id)) {
        const sc = targets.reduce((a, u) => a + score(u), 0);
        if (!best || sc > best.score) best = { id: slot.id, target: undefined, score: sc };
        continue;
      }
      const cands = noTarget(sp.target) ? [targets[0]] : targets;
      for (const uid of cands) {
        const sc = score(uid);
        if (!best || sc > best.score) best = { id: slot.id, target: noTarget(sp.target) ? undefined : uid, score: sc };
      }
    }
    if (!best) return null;
    // worth it? roughly one leadership point per mana point
    return best.score >= this.spellCost(side, best.id) ? best : null;
  }

  // ---------- consumables (potions and scrolls from the hero's belt) ----------

  /** Belt of a side: consumable ids, '' = empty or used. One consumable per round, besides the spell. */
  belt(side: Side): string[] { return this.belts[side]; }
  canUseItem(side: Side): boolean {
    const a = this.active;
    return !this.winner && !!a && a.side === side && !this.itemThisRound[side] && this.belts[side].some((x) => !!x);
  }

  /** Targets of the consumable in belt place `i`; [-1] = usable without a target; [] = not usable now. */
  itemTargets(side: Side, i: number): number[] {
    const id = this.belts[side][i];
    const c = id ? CONSUMABLES[id] : undefined;
    if (!c) return [];
    const allies = this.alive.filter((o) => o.side === side);
    switch (c.id) {
      case 'potionHeal': return allies.filter((a) => a.summonRounds === undefined && this.hpTotal(a) < a.startCount * a.def.hp).map((a) => a.uid);
      case 'potionMana': return this.spellbook(side).length ? [-1] : [];
      case 'potionStrength': case 'potionStone': case 'potionHaste': return allies.map((a) => a.uid);
    }
    if (c.spell) {
      const t = this.spellTargets(side, c.spell, true);
      return noTarget(c.target) ? (t.length ? [-1] : []) : t;
    }
    return [];
  }

  isLegalItem(side: Side, i: number, target?: number): boolean {
    if (!this.canUseItem(side)) return false;
    const t = this.itemTargets(side, i);
    return t.length > 0 && (t[0] === -1 || (target !== undefined && t.includes(target)));
  }

  useItem(side: Side, i: number, target?: number): BattleEvent[] {
    if (!this.isLegalItem(side, i, target)) throw new Error(`illegal item ${i} -> ${target}`);
    const id = this.belts[side][i];
    const c = CONSUMABLES[id];
    this.belts[side][i] = '';
    this.usedItems[side].push(i);
    this.itemThisRound[side] = true;
    const tgt = target !== undefined && target >= 0 ? target : undefined;
    const ev: BattleEvent[] = [{ type: 'useItem', side, item: id, index: i, target: tgt }];
    const t = tgt !== undefined ? this.stack(tgt) : undefined;
    switch (id) {
      case 'potionHeal': {
        const healed = this.heal(t!, Math.ceil(t!.startCount * t!.def.hp * 0.4), true);
        if (healed > 0) ev.push({ type: 'heal', uid: t!.uid, amount: healed, count: t!.count });
        break;
      }
      case 'potionMana':
        this.mana[side] += 12;
        this.maxMana[side] = Math.max(this.maxMana[side], this.mana[side]);
        break;
      case 'potionStrength': this.addStatus(t!, 'bless', 4, 30, ev, true); break;
      case 'potionStone': this.addStatus(t!, 'shield', 4, 6, ev, true); break;
      case 'potionHaste': this.addStatus(t!, 'haste', 4, 2, ev, true); break;
      default:
        if (c.spell) {
          ev.push({ type: 'cast', side, spell: c.spell, target: tgt, mana: this.mana[side] });
          ev.push(...this.spellEffect(side, c.spell, tgt, SCROLL_LEVEL));
        }
    }
    this.checkEnd(ev);
    return ev;
  }

  /** Simple AI for consumables (simulations): heal badly hurt stacks, buff early, throw scrolls at the biggest enemy. */
  aiItem(side: Side): BattleEvent[] {
    if (!this.canUseItem(side)) return [];
    const power = (s: Stack) => s.count * s.def.cost;
    for (let i = 0; i < this.belts[side].length; i++) {
      const id = this.belts[side][i];
      if (!id) continue;
      const targets = this.itemTargets(side, i);
      if (!targets.length) continue;
      const pick = (list: number[]) => list.map((u) => this.stack(u)).sort((a, b) => power(b) - power(a))[0]?.uid;
      if (id === 'potionHeal') {
        const hurt = targets.map((u) => this.stack(u)).filter((a) => this.hpTotal(a) < a.startCount * a.def.hp * 0.6);
        if (hurt.length) return this.useItem(side, i, pick(hurt.map((a) => a.uid)));
      } else if (id === 'potionMana') {
        if (this.mana[side] < 6) return this.useItem(side, i);
      } else if (id.startsWith('potion')) {
        if (this.round <= 2) return this.useItem(side, i, pick(targets));
      } else if (targets[0] === -1) return this.useItem(side, i);
      else return this.useItem(side, i, pick(targets));
    }
    return [];
  }

  /** Expected damage and losses of a damage spell on one stack (for the targeting preview). */
  previewSpell(side: Side, id: string, uid: number): { damage: number; kills: number } | null {
    const sp = SPELLS[id];
    if (!sp.element) return null;
    const t = this.stack(uid);
    const n = this.spellValues(side, id);
    let m = 1 + this.mods[side].spellDmg;
    if (sp.element === 'holy' && (t.def.undead || t.def.faction === 'demon')) m *= 1.5;
    if (sp.element === 'death' && t.def.undead) m *= 0.5;
    if (sp.element === 'fire' && t.def.faction === 'demon') m *= 0.5;
    m *= 1 - this.sm(t).taken;
    const damage = Math.max(1, Math.round(n.n * m)) - Math.min(this.status(t, 'ward'), Math.round(n.n * m));
    return { damage, kills: damage > 0 ? this.killsFor(t, damage) : 0 };
  }

  /** Let the AI cast its best spell (if any). Returns the events, or [] if nothing was cast. */
  aiCast(side: Side): BattleEvent[] {
    const c = this.spellChoice(side);
    return c ? this.cast(side, c.id, c.target) : [];
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
        this.walk(s, this.reachable(s).get(key(a.to))!, ev);
        break;
      }
      case 'shoot': {
        s.shots--;
        const t = this.stack(a.target);
        ev.push(...this.strike(s, t, true));
        const split = this.sm(s).splitShot;
        if (split > 0) {
          const near = this.enemiesOf(s).filter((e) => e !== t && this.targetable(e) && this.sdist(e, t) === 1);
          if (near.length) ev.push(...this.strike(s, near[Math.floor(this.random() * near.length)], true, { mult: split, kind: 'area', noCrit: true }));
        }
        break;
      }
      case 'melee': {
        const t = this.stack(a.target);
        if (!eq(a.from, s.pos)) {
          // caught in a trap on the way: the attack does not happen
          if (this.walk(s, this.reachable(s).get(key(a.from))!, ev)) break;
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
    if (!this.checkEnd(ev) && a.type !== 'defend') this.rollMorale(s, ev);
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
      case 'mark': return null;   // the AI keeps it simple
      case 'entangle': case 'seduce': {
        let best: number | undefined; let bs = 0;
        for (const uid of targets) { const e = this.stack(uid); const sc = e.count * e.def.cost * (ab.id === 'seduce' ? 0.35 : 0.2); if (sc > bs) { bs = sc; best = uid; } }
        return best !== undefined && bs > 20 ? { score: bs, target: best } : null;
      }
      case 'sporeCloud': case 'infernoBlast': case 'axeVolley': case 'explosiveBolt': {
        let best: number | undefined; let bs = 0;
        for (const uid of targets) { const e = this.stack(uid); const n = 1 + this.enemiesOf(s).filter((o) => o !== e && this.sdist(o, e) === 1).length; const sc = n * 30 + e.def.cost; if (sc > bs) { bs = sc; best = uid; } }
        return best !== undefined ? { score: 1000 + bs, target: best } : null;
      }
      case 'rootStrike': case 'rampage': case 'overpressure': {
        const n = this.adjacentEnemies(s).length;
        return n >= (ab.id === 'overpressure' ? 2 : 1) ? { score: 1000 + 40 * n } : null;
      }
      case 'howl': return this.enemiesOf(s).filter((e) => this.sdist(s, e) <= 2).length >= 2 ? { score: 30 } : null;
      case 'warcry': return threatened || this.adjacentEnemies(s).length ? { score: 18 } : null;
      case 'ironStance': return this.adjacentEnemies(s).length >= 2 ? { score: 25 } : null;
      case 'worldfire': return this.enemiesOf(s).length >= 2 && this.hpTotal(s) > s.startCount * s.def.hp * 0.5 ? { score: 1000 + 50 * this.enemiesOf(s).length } : null;
      case 'bloodSacrifice': {
        let best: number | undefined; let bs = 0;
        for (const uid of targets) { const a = this.stack(uid); const sc = (a.startCount * a.def.hp - this.hpTotal(a)) / a.def.hp * a.def.cost; if (sc > bs) { bs = sc; best = uid; } }
        return best !== undefined && bs > 40 ? { score: bs * 0.6, target: best } : null;
      }
      case 'doubleShot': case 'lightLance': case 'quakeStrike': case 'smash': case 'finalStand': case 'fireSpark':
      case 'burrow': case 'hunt': case 'hellPortal': {
        let best: number | undefined; let bs = -1;
        for (const uid of targets) {
          const e = this.stack(uid);
          const sc = exp(this.preview(s, e, ab.id === 'doubleShot' || ab.id === 'fireSpark', s.pos)) * this.value(e);
          if (sc > bs) { bs = sc; best = uid; }
        }
        return best !== undefined ? { score: 1000 + bs, target: best } : null;
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
    if (this.has(s, 'treasure')) return this.fleeAction(s);
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
        if (!eq(from, s.pos) && !this.blindToTraps(s) && this.cells(s, from).some((c) => this.hostileTrap(s, c))) continue;
        const p = this.preview(s, e, false, from);
        let sc = expected(p) * this.value(e) + 1;
        if (!e.retaliated && !this.has(s, 'noRetaliation') && !this.has(s, 'bladeDance') && expected(p) < e.count) {
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
      if (!this.blindToTraps(s) && this.cells(s, h).some((c) => this.hostileTrap(s, c))) continue;
      const d = this.sdist(s, target, h);
      if (d < bestD) { bestD = d; bestHex = h; }
    }
    if (bestHex) return { type: 'move', to: bestHex };
    return { type: 'defend' };
  }

  /** Treasure goblins never fight: they run as far away from the enemy as they can. */
  private fleeAction(s: Stack): Action {
    const foes = this.enemiesOf(s);
    const safety = (h: Hex) => Math.min(99, ...foes.map((e) => this.sdist(s, e, h)));
    let best: Hex | null = null; let bs = safety(s.pos);
    for (const [, path] of this.reachable(s)) {
      const h = path[path.length - 1];
      const sc = safety(h) + (h.col === s.pos.col ? 0 : 0.01);
      if (sc > bs) { bs = sc; best = h; }
    }
    return best ? { type: 'move', to: best } : { type: 'defend' };
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
