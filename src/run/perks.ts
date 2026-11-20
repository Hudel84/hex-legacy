// Talents (chosen at level-up) and artifacts (found or bought). Both are "perks":
// battle modifiers (SideMods), one-time stat changes and run-wide factors.
import { combine, type ModPatch, type SideMods } from '../battle/mods';
import type { Rng } from './rng';

export type Rarity = 'common' | 'rare' | 'legendary';

export interface PerkDef {
  id: string;
  kind: 'talent' | 'artifact';
  icon: string;               // file name without extension (icons/talents or icons/artifacts)
  rarity: Rarity;
  cursed?: boolean;
  heroes?: string[];          // hero-specific talents
  faction?: string;           // faction-specific artifacts
  stack?: boolean;            // can be taken several times
  mods?: ModPatch;
  once?: { atk?: number; def?: number; lead?: number; gold?: number };
  run?: { gold?: number; xp?: number; draft?: number };
}

const T = (id: string, icon: string, rarity: Rarity, p: Partial<PerkDef>): PerkDef => ({ id, kind: 'talent', icon, rarity, ...p });
const A = (id: string, icon: string, rarity: Rarity, p: Partial<PerkDef>): PerkDef => ({ id, kind: 'artifact', icon, rarity, ...p });

export const PERKS: PerkDef[] = [
  // ---- talents: common ----
  T('weaponMaster', 'sharpened_blades', 'common', { stack: true, once: { atk: 2 } }),
  T('shieldDrill', 'shield_wall', 'common', { stack: true, once: { def: 2 } }),
  T('recruitment', 'recruitment', 'common', { stack: true, once: { lead: 15 } }),
  T('veteran', 'veteran', 'common', { stack: true, once: { atk: 1, def: 1 } }),
  T('plunder', 'plunder', 'common', { run: { gold: 0.3 } }),
  T('tactician', 'tactician', 'common', { run: { xp: 0.25 } }),
  T('sharpEyes', 'eagle_eye', 'common', { mods: { ranged: 0.15 } }),
  T('ironGrip', 'iron_grip', 'common', { mods: { melee: 0.15 } }),
  T('steadfast', 'steadfast', 'common', { mods: { taken: 0.1 } }),
  T('runeArmor', 'rune_armor', 'common', { mods: { hp: 0.1 } }),
  T('marchingDrum', 'marching_drum', 'common', { mods: { ini: 1 } }),
  T('pathfinder', 'pathfinder', 'common', { mods: { speed: 1 } }),
  // ---- talents: rare (rule changers) ----
  T('splitArrow', 'split_arrow', 'rare', { mods: { splitShot: 0.5 } }),
  T('counterStrike', 'counter_strike', 'rare', { mods: { counters: 1, counterDmg: 0.1 } }),
  T('cavalryCharge', 'cavalry_charge', 'rare', { mods: { firstStrike: 0.4 } }),
  T('fieldMedic', 'field_medic', 'rare', { mods: { regen: 0.05 } }),
  T('endlessQuiver', 'endless_quiver', 'rare', { mods: { shots: 4, ranged: 0.05 } }),
  T('poisonedBlades', 'thorn_club', 'rare', { mods: { poison: 0.2 } }),
  T('reaper', 'reaper', 'rare', { mods: { executioner: 0.3 } }),
  T('shieldBreaker', 'shield_breaker', 'rare', { mods: { vsBig: 0.4 } }),
  T('quickCast', 'quick_cast', 'rare', { mods: { cooldown: 1 } }),
  T('turtleShell', 'turtle_shell', 'rare', { mods: { thorns: 0.25 } }),
  T('scoutAhead', 'scout_ahead', 'rare', { mods: { round1Ini: 5 } }),
  T('hawkEye', 'hawk_eye_aim', 'rare', { mods: { crit: 0.12 } }),
  T('bloodChalice', 'blood_chalice', 'rare', { mods: { lifesteal: 0.12 } }),
  T('fortress', 'fortress', 'rare', { mods: { startShield: 4 } }),
  // ---- talents: legendary ----
  T('tripleShot', 'triple_shot', 'legendary', { mods: { ranged: 0.25, splitShot: 0.75 } }),
  T('unchained', 'unchained', 'legendary', { mods: { dmg: 0.3, taken: -0.1 } }),
  T('generalsBaton', 'generals_baton', 'legendary', { mods: { counters: 1, dmg: 0.1, taken: 0.1 } }),
  T('glory', 'glory', 'legendary', { once: { atk: 2, def: 2, lead: 20 } }),
  T('phoenixFeather', 'phoenix_feather', 'legendary', { mods: { lifesteal: 0.25 } }),
  // ---- talents: hero-specific ----
  T('knightBanner', 'crossed_swords_banner', 'rare', { heroes: ['human_hero_knight_commander'], once: { lead: 10 }, mods: { melee: 0.1 } }),
  T('commandTent', 'command_tent', 'common', { heroes: ['human_hero_knight_commander'], stack: true, once: { lead: 12 } }),
  T('spearWall', 'spear_wall', 'rare', { heroes: ['human_hero_guard_captain'], mods: { taken: 0.15 } }),
  T('warDrum', 'war_drum', 'common', { heroes: ['human_hero_guard_captain'], stack: true, once: { atk: 2, def: 1 } }),
  T('holyBell', 'holy_bell', 'rare', { heroes: ['human_hero_priestess_of_light'], mods: { regen: 0.06, undeadDmg: 0.25 } }),
  T('newDawn', 'new_dawn', 'rare', { heroes: ['human_hero_priestess_of_light'], mods: { lifesteal: 0.1, startShield: 3 } }),
  T('restlessDead', 'restless_dead', 'rare', { heroes: ['undead_hero_death_lord'], mods: { regen: 0.06, hp: 0.05 } }),
  T('boneCrown', 'bone_crown', 'common', { heroes: ['undead_hero_death_lord'], stack: true, once: { lead: 15, def: 1 } }),
  T('soulJar', 'soul_jar', 'rare', { heroes: ['undead_hero_necromancer'], mods: { lifesteal: 0.18 } }),
  T('deathHourglass', 'death_hourglass', 'rare', { heroes: ['undead_hero_necromancer'], mods: { cooldown: 1, ranged: 0.15 } }),
  T('treasureHunter', 'treasure_hunter', 'common', { heroes: ['undead_hero_grave_robber'], run: { gold: 0.5 } }),
  T('soulGrasp', 'soul_grasp', 'rare', { heroes: ['undead_hero_grave_robber'], mods: { executioner: 0.25, firstStrike: 0.2 } }),

  // ---- artifacts ----
  A('eagleStandard', 'eagle_standard', 'rare', { mods: { dmg: 0.15 } }),
  A('ancientCrown', 'ancient_crown', 'rare', { once: { lead: 25 } }),
  A('angelFeather', 'angel_feather', 'rare', { mods: { regen: 0.05 } }),
  A('kingsHorn', 'kings_horn', 'common', { mods: { ini: 1, round1Ini: 3 } }),
  A('goldenSpur', 'golden_spur', 'common', { mods: { speed: 1 } }),
  A('fallenShield', 'fallen_hero_shield', 'rare', { mods: { taken: 0.15 } }),
  A('conquerorGauntlet', 'conqueror_gauntlet', 'common', { mods: { firstStrike: 0.3 } }),
  A('elvenBowstring', 'elf_bowstring', 'rare', { mods: { ranged: 0.2, shots: 2 } }),
  A('anvilCharm', 'anvil_charm', 'common', { once: { def: 3 } }),
  A('medalOfValor', 'medal_of_valor', 'common', { once: { atk: 3 } }),
  A('holyGrail', 'holy_grail', 'legendary', { mods: { lifesteal: 0.15, regen: 0.03 } }),
  A('wingedHourglass', 'winged_hourglass', 'rare', { mods: { cooldown: 1 } }),
  A('rabbitFoot', 'rabbit_foot', 'common', { mods: { crit: 0.1 } }),
  A('empireCoin', 'empire_coin', 'common', { run: { gold: 0.4 } }),
  A('treasureCompass', 'treasure_compass', 'rare', { run: { draft: 1 } }),
  A('titanTooth', 'titan_tooth', 'rare', { mods: { vsBig: 0.35 } }),
  A('hydraScale', 'hydra_scale', 'rare', { mods: { thorns: 0.2 } }),
  A('livingStone', 'living_stone', 'rare', { mods: { hp: 0.15 } }),
  A('holyReliquary', 'human_holy_reliquary', 'rare', { faction: 'human', mods: { undeadDmg: 0.3, regen: 0.03 } }),
  A('sunTabard', 'human_sun_tabard', 'common', { faction: 'human', mods: { startShield: 5 } }),
  A('phylactery', 'undead_phylactery', 'legendary', { faction: 'undead', mods: { lifesteal: 0.2, hp: 0.1 } }),
  A('skullCandle', 'undead_skull_candle', 'common', { faction: 'undead', mods: { poison: 0.15, melee: 0.05 } }),
  A('victoryChalice', 'victory_chalice', 'legendary', { once: { atk: 2, def: 2 }, mods: { dmg: 0.1 } }),
  // cursed: strong with a price
  A('obsidianDagger', 'cursed_obsidian_dagger', 'rare', { cursed: true, mods: { dmg: 0.35, hp: -0.2 } }),
  A('vampireGoblet', 'cursed_vampire_goblet', 'rare', { cursed: true, mods: { lifesteal: 0.25 }, once: { def: -2 } }),
  A('ironCrown', 'cursed_iron_crown', 'rare', { cursed: true, once: { lead: 40 }, mods: { dmg: -0.15 } }),
  A('loadedDice', 'cursed_loaded_dice', 'rare', { cursed: true, mods: { crit: 0.3, dmg: -0.1 } }),
  A('shadowMirror', 'cursed_shadow_mirror', 'rare', { cursed: true, mods: { counters: 2, speed: -1 } }),
  A('poisonRose', 'cursed_poison_rose', 'rare', { cursed: true, mods: { poison: 0.3, ini: -1 } }),
];

export const perkById = (id: string): PerkDef => PERKS.find((p) => p.id === id)!;
export const perkIconKey = (p: PerkDef): string => `perk_${p.icon}`;
export const perkIconPath = (p: PerkDef): string => `icons/${p.kind === 'talent' ? 'talents/icon_talent_' : 'artifacts/icon_artifact_'}${p.icon}.webp`;

const WEIGHT: Record<Rarity, number> = { common: 60, rare: 30, legendary: 7 };

interface Owner { heroId: string; faction: string; talents?: string[]; artifacts?: string[] }

function eligible(p: PerkDef, o: Owner): boolean {
  const owned = [...(o.talents ?? []), ...(o.artifacts ?? [])];
  if (!p.stack && owned.includes(p.id)) return false;
  if (p.heroes && !p.heroes.includes(o.heroId)) return false;
  if (p.faction && p.faction !== o.faction) return false;
  return true;
}

/** Pick `n` different perks of a kind, weighted by rarity; hero perks are more likely. */
export function offer(kind: 'talent' | 'artifact', n: number, o: Owner, rng: Rng, minRarity?: Rarity): PerkDef[] {
  let pool = PERKS.filter((p) => p.kind === kind && eligible(p, o));
  if (minRarity === 'rare') pool = pool.filter((p) => p.rarity !== 'common');
  const out: PerkDef[] = [];
  while (out.length < n && pool.length) {
    const w = pool.map((p) => WEIGHT[p.rarity] * (p.heroes ? 2 : 1));
    let r = rng.next() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= w[i]; if (r <= 0) break; }
    out.push(pool[i]);
    pool = pool.filter((_, j) => j !== i);
  }
  return out;
}

export function perksOf(o: Owner): PerkDef[] {
  return [...(o.talents ?? []), ...(o.artifacts ?? [])].map(perkById).filter(Boolean);
}

export function sideMods(o: Owner): SideMods {
  return combine(...perksOf(o).map((p) => p.mods ?? {}));
}

export function runFactor(o: Owner, k: 'gold' | 'xp' | 'draft'): number {
  return perksOf(o).reduce((a, p) => a + (p.run?.[k] ?? 0), 0);
}

/** Text lines describing a perk's effect (i18n keys + values), used to build descriptions. */
export function effectParts(p: PerkDef): { key: string; v: number }[] {
  const out: { key: string; v: number }[] = [];
  const pct = (x: number) => Math.round(x * 100);
  for (const [k, v] of Object.entries(p.once ?? {})) if (v) out.push({ key: `eff.${k}`, v });
  for (const [k, v] of Object.entries(p.mods ?? {}) as [string, number][]) {
    if (!v) continue;
    const flat = ['ini', 'speed', 'shots', 'counters', 'startShield', 'cooldown', 'round1Ini'].includes(k);
    out.push({ key: `eff.${k}`, v: flat ? v : pct(v) });
  }
  for (const [k, v] of Object.entries(p.run ?? {})) if (v) out.push({ key: `eff.run_${k}`, v: k === 'draft' ? v : pct(v) });
  return out;
}
