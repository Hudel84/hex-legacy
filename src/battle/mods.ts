// Battle modifiers of one side, produced by talents, artifacts (and later equipment).
// All percentages are fractions: 0.1 = +10 %.
export interface BaseMods {
  dmg: number;          // all damage dealt
  melee: number;        // melee damage dealt
  ranged: number;       // ranged damage dealt
  taken: number;        // less damage taken
  hp: number;           // unit hit points
  ini: number;          // initiative (flat)
  speed: number;        // movement (flat)
  shots: number;        // extra shots for shooters
  counterDmg: number;   // counter-attack damage
  counters: number;     // extra counter-attacks per round
  splitShot: number;    // ranged hits also strike one enemy next to the target with this share of damage
  firstStrike: number;  // extra damage on each stack's first attack in a battle
  regen: number;        // heal this share of one creature's HP x stack size at turn start (no revive)
  lifesteal: number;    // heal this share of damage dealt (can revive)
  startShield: number;  // DEF bonus for every stack during its first two turns
  poison: number;       // melee hits poison for this share of the damage per turn (0 = off)
  cooldown: number;     // ability cooldown reduction (rounds)
  round1Ini: number;    // initiative bonus in round 1
  vsBig: number;        // damage against elites and bosses
  executioner: number;  // damage against stacks below half of their starting size
  thorns: number;       // melee attackers take this share of the damage they dealt
  crit: number;         // extra critical chance (every unit has BASE_CRIT on top)
  critDmg: number;      // extra critical damage multiplier (0.5 = x2.5 instead of x2)
  morale: number;       // extra morale: chance for a second action in the round (every unit has BASE_MORALE)
  undeadDmg: number;    // damage against undead
  spellDmg: number;     // hero spell damage and healing
  mana: number;         // extra mana per battle (flat)
  burn: number;         // hits set targets on fire for this share of the damage per turn (0 = off)
  frost: number;        // 1 = hits slow the target
  markShots: number;    // 1 = ranged hits mark the target (+25 % ranged damage taken)
  furyMax: number;      // higher cap for the orcs' fury
  pierceDef: number;    // ignore this share of the target's DEF
  // boss relics: effects at the start of every round
  traps: number;        // lay this many traps next to enemy stacks every round
  entangle: number;     // 1 = every second round the strongest enemy stack is rooted
  breath: number;       // every third round all enemies are poisoned for this share of their hit points
  regrow: number;       // every round own stacks heal this share of their full strength (revives)
  raise: number;        // 1 = every third round skeletons rise for this side
  chill: number;        // 1 = in round 1 and every third round all enemies are slowed
  eruption: number;     // every round one enemy stack burns for this share of its hit points
  imps: number;         // 1 = every third round imps come through a portal
  bossRage: number;     // 1 = boss skills that work every second round work every round (ascension 5)
  // ---- hero talent themes (v0.16, GDD 17.5) ----
  moraleDmg: number;    // extra damage during a morale bonus turn
  decay: number;        // Death and Decay: damage to every enemy at round start (x (1.6 + 0.6 ATK + power))
  decayWeak: number;    // ... also -ATK (value) for 2 turns
  decayArmor: number;   // ... also -DEF (value) for 2 turns
  decaySlow: number;    // ... also slows (1 = yes)
  decayPoison: number;  // ... poison worth this share of the hit per turn
  decayFear: number;    // ... chance to frighten
  hellfire: number;     // Burning: damage to the strongest enemy at round end (x (4 + 1.3 ATK + 2 power))
  hellBurn: number;     // ... burn worth this share of the hit
  hellCrit: number;     // ... chance for double damage
  hellSplash: number;   // ... share of the damage to enemies next to the target
  hellTargets: number;  // ... extra targets
  summon: number;       // Summoning: creatures worth this share of leadership join at battle start
  summonTier: number;   // ... higher tier creature
  summonTwice: number;  // ... a second summoning in round 4
  autoHeal: number;     // heals the most wounded stack every round (x (10 + 5 power))
  spellHeal: number;    // healing of spells
  extraCast: number;    // extra spells per round
  trapDmg: number;      // trap damage
  trapPoison: number;   // traps also poison
  trapSlow: number;     // traps also slow
  trapStun: number;     // traps also stun
}

/** Per magic school: damage, cost reduction, first spell of the battle free, ally spells on all allies, enemy spells on all enemies. */
export const SCHOOL_IDS = ['light', 'nature', 'earth', 'storm', 'dark', 'fire'] as const;
export type SchoolModKey = `${typeof SCHOOL_IDS[number]}${'Dmg' | 'Cost' | 'Free' | 'MassAlly' | 'MassEnemy'}`;
export type SideMods = BaseMods & Record<SchoolModKey, number>;

const BASE_ZERO: BaseMods = {
  dmg: 0, melee: 0, ranged: 0, taken: 0, hp: 0, ini: 0, speed: 0, shots: 0, counterDmg: 0, counters: 0,
  splitShot: 0, firstStrike: 0, regen: 0, lifesteal: 0, startShield: 0, poison: 0, cooldown: 0, round1Ini: 0,
  vsBig: 0, executioner: 0, thorns: 0, crit: 0, critDmg: 0, morale: 0, undeadDmg: 0, spellDmg: 0, mana: 0,
  burn: 0, frost: 0, markShots: 0, furyMax: 0, pierceDef: 0,
  traps: 0, entangle: 0, breath: 0, regrow: 0, raise: 0, chill: 0, eruption: 0, imps: 0, bossRage: 0,
  moraleDmg: 0, decay: 0, decayWeak: 0, decayArmor: 0, decaySlow: 0, decayPoison: 0, decayFear: 0,
  hellfire: 0, hellBurn: 0, hellCrit: 0, hellSplash: 0, hellTargets: 0, summon: 0, summonTier: 0, summonTwice: 0,
  autoHeal: 0, spellHeal: 0, extraCast: 0, trapDmg: 0, trapPoison: 0, trapSlow: 0, trapStun: 0,
};
const SCHOOL_ZERO = Object.fromEntries(SCHOOL_IDS.flatMap((sc) => ['Dmg', 'Cost', 'Free', 'MassAlly', 'MassEnemy'].map((x) => [`${sc}${x}`, 0]))) as Record<SchoolModKey, number>;
export const NO_MODS: SideMods = { ...BASE_ZERO, ...SCHOOL_ZERO };

/** Every unit: 5 % critical chance (x2 damage) and 5 % morale (GDD 17.1/17.2). */
export const BASE_CRIT = 0.05;
export const BASE_CRIT_DMG = 2;
export const BASE_MORALE = 0.05;

export type ModPatch = Partial<SideMods>;

/** Add several patches together (numbers are summed). */
export function combine(...patches: ModPatch[]): SideMods {
  const out: SideMods = { ...NO_MODS };
  for (const p of patches) for (const [k, v] of Object.entries(p) as [keyof SideMods, number][]) out[k] += v;
  out.taken = Math.min(out.taken, 0.6);
  out.crit = Math.min(out.crit, 0.6);
  return out;
}
