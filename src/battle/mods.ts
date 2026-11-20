// Battle modifiers of one side, produced by talents, artifacts (and later equipment).
// All percentages are fractions: 0.1 = +10 %.
export interface SideMods {
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
  crit: number;         // chance for double damage
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
}

export const NO_MODS: SideMods = {
  dmg: 0, melee: 0, ranged: 0, taken: 0, hp: 0, ini: 0, speed: 0, shots: 0, counterDmg: 0, counters: 0,
  splitShot: 0, firstStrike: 0, regen: 0, lifesteal: 0, startShield: 0, poison: 0, cooldown: 0, round1Ini: 0,
  vsBig: 0, executioner: 0, thorns: 0, crit: 0, undeadDmg: 0, spellDmg: 0, mana: 0,
  burn: 0, frost: 0, markShots: 0, furyMax: 0, pierceDef: 0,
  traps: 0, entangle: 0, breath: 0, regrow: 0, raise: 0, chill: 0, eruption: 0, imps: 0,
};

export type ModPatch = Partial<SideMods>;

/** Add several patches together (numbers are summed). */
export function combine(...patches: ModPatch[]): SideMods {
  const out: SideMods = { ...NO_MODS };
  for (const p of patches) for (const [k, v] of Object.entries(p) as [keyof SideMods, number][]) out[k] += v;
  out.taken = Math.min(out.taken, 0.6);
  out.crit = Math.min(out.crit, 0.6);
  return out;
}
