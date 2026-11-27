// Ascension (v0.20, Ben 27.11.): 10 levels, each adds a new hardship and keeps all earlier ones.
// Winning a run on level n unlocks n+1; every level gives +10 % city resources at the end of a run.
export const MAX_ASC = 10;

/** The rule that each level adds (i18n: asc.rule.<n> / asc.desc.<n>). */
export const ASC_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const ASC = {
  /** 1 Stronger foes: +25 % enemy strength; 10 Wrath of the Void: another +25 % */
  enemyBudget: (a: number) => 1 + (a >= 1 ? 0.25 : 0) + (a >= 10 ? 0.25 : 0),
  /** 2 Hard elites: elites +25 % HP and damage, +25 % escort */
  elite: (a: number) => (a >= 2 ? 1.25 : 1),
  /** 3 Meagre spoils: -25 % gold from battles */
  gold: (a: number) => (a >= 3 ? 0.75 : 1),
  /** 4 Tough foes: all enemies +20 % HP */
  enemyHp: (a: number) => (a >= 4 ? 0.2 : 0),
  /** 5 Mighty bosses: act bosses +25 % HP and damage, boss skills every round */
  boss: (a: number) => (a >= 5 ? 1.25 : 1),
  bossRage: (a: number) => (a >= 5 ? 1 : 0),
  /** 6 Hard times: shop prices +25 % */
  shop: (a: number) => (a >= 6 ? 1.25 : 1),
  /** 7 Slow growth: -20 % experience */
  xp: (a: number) => (a >= 7 ? 0.8 : 1),
  /** 8 Battle-hardened: all enemies +10 % critical chance and +10 % morale */
  enemyCrit: (a: number) => (a >= 8 ? 0.1 : 0),
  enemyMorale: (a: number) => (a >= 8 ? 0.1 : 0),
  /** 9 Weak start: -15 % leadership at the start, no start gold from the town hall */
  startLead: (a: number) => (a >= 9 ? 0.85 : 1),
  noTownGold: (a: number) => a >= 9,
  /** 10 Wrath of the Void: (+25 % enemy strength above) and twice the void spawn in the final battle */
  voidSpawn: (a: number) => (a >= 10 ? 2 : 1),
  /** reward: +10 % city resources per level */
  reward: (a: number) => 1 + 0.1 * a,
};

export const ascOf = (r?: { asc?: number } | null): number => Math.max(0, Math.min(MAX_ASC, r?.asc ?? 0));
