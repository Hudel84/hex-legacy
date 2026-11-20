// Unit upgrades (changed 20.11.): five levels per unit type. Every unit belongs to one pool
// (tank, fighter, ranged, mage, support) and picks one of three upgrades from it at every level;
// level 5 offers the pool's master upgrades. Units of different pools on level 3+ form synergies.
import type { ModPatch } from '../battle/mods';
import type { UnitDef } from '../battle/types';
import type { Rng } from './rng';

export type Role = 'tank' | 'fighter' | 'ranged' | 'mage' | 'support';
export const ROLES: Role[] = ['tank', 'fighter', 'ranged', 'mage', 'support'];

export interface UpgradeDef {
  id: string;
  role: Role;
  cap?: boolean;          // master upgrade (level 5)
  hp?: number;            // share, 0.2 = +20 % hit points
  dmg?: number;           // share of damage
  atk?: number; def?: number; ini?: number; speed?: number; shots?: number;
  passive?: string;       // unit passive the upgrade grants
  mods?: ModPatch;        // battle modifiers of this unit only
}

const U = (id: string, role: Role, p: Partial<UpgradeDef>): UpgradeDef => ({ id, role, ...p });

export const UPGRADES: UpgradeDef[] = [
  // ---- tank: hit points, armour, counters ----
  U('t_bulwark', 'tank', { hp: 0.15 }),
  U('t_plate', 'tank', { def: 2 }),
  U('t_steadfast', 'tank', { mods: { taken: 0.08 } }),
  U('t_thorns', 'tank', { mods: { thorns: 0.15 } }),
  U('t_riposte', 'tank', { mods: { counters: 1 } }),
  U('t_guard', 'tank', { passive: 'guardAura' }),
  U('t_regen', 'tank', { mods: { regen: 0.04 } }),
  U('t_unshaken', 'tank', { passive: 'stunImmune', mods: { taken: 0.04 } }),
  U('t_shieldwall', 'tank', { mods: { startShield: 4 } }),
  U('tc_juggernaut', 'tank', { cap: true, hp: 0.15, passive: 'unlimitedRetaliation' }),
  U('tc_bastion', 'tank', { cap: true, passive: 'rangedResist', mods: { taken: 0.1 } }),
  // ---- fighter: damage, crits, tempo ----
  U('f_edge', 'fighter', { dmg: 0.12 }),
  U('f_atk', 'fighter', { atk: 2 }),
  U('f_crit', 'fighter', { mods: { crit: 0.1 } }),
  U('f_first', 'fighter', { mods: { firstStrike: 0.25 } }),
  U('f_lifesteal', 'fighter', { mods: { lifesteal: 0.12 } }),
  U('f_execute', 'fighter', { mods: { executioner: 0.25 } }),
  U('f_pierce', 'fighter', { mods: { pierceDef: 0.2 } }),
  U('f_swift', 'fighter', { ini: 2, speed: 1 }),
  U('f_glass', 'fighter', { dmg: 0.25, hp: -0.15 }),
  U('fc_bladedancer', 'fighter', { cap: true, dmg: 0.05, passive: 'bladeDance' }),
  U('fc_slayer', 'fighter', { cap: true, mods: { vsBig: 0.35, executioner: 0.15 } }),
  // ---- ranged: shots, marks, piercing ----
  U('r_quiver', 'ranged', { shots: 3 }),
  U('r_aim', 'ranged', { mods: { ranged: 0.14 } }),
  U('r_mark', 'ranged', { mods: { markShots: 1 } }),
  U('r_split', 'ranged', { mods: { splitShot: 0.35 } }),
  U('r_pierce', 'ranged', { mods: { pierceDef: 0.2 } }),
  U('r_melee', 'ranged', { passive: 'meleeArcher', def: 2 }),
  U('r_fire', 'ranged', { mods: { burn: 0.12 } }),
  U('r_frost', 'ranged', { mods: { frost: 1 } }),
  U('r_crit', 'ranged', { mods: { crit: 0.1 } }),
  U('rc_sniper', 'ranged', { cap: true, mods: { ranged: 0.2, crit: 0.1 } }),
  U('rc_volley', 'ranged', { cap: true, shots: 2, mods: { splitShot: 0.5 } }),
  // ---- mage: elements and curses ----
  U('m_power', 'mage', { dmg: 0.14 }),
  U('m_fire', 'mage', { mods: { burn: 0.15 } }),
  U('m_frost', 'mage', { passive: 'frostHit' }),
  U('m_curse', 'mage', { passive: 'curseHit' }),
  U('m_drain', 'mage', { mods: { lifesteal: 0.12 } }),
  U('m_ward', 'mage', { passive: 'magicResist', hp: 0.08 }),
  U('m_focus', 'mage', { mods: { cooldown: 1 } }),
  U('m_venom', 'mage', { passive: 'poisonHit' }),
  U('m_swift', 'mage', { ini: 2, speed: 1 }),
  U('mc_archmage', 'mage', { cap: true, dmg: 0.2, mods: { cooldown: 1 } }),
  U('mc_doom', 'mage', { cap: true, passive: 'corrode', mods: { executioner: 0.25 } }),
  // ---- support: auras, healing, protection ----
  U('s_heal', 'support', { passive: 'healAura' }),
  U('s_guard', 'support', { passive: 'guardAura' }),
  U('s_totem', 'support', { passive: 'warTotem' }),
  U('s_regen', 'support', { mods: { regen: 0.05 } }),
  U('s_focus', 'support', { mods: { cooldown: 1 } }),
  U('s_hp', 'support', { hp: 0.15 }),
  U('s_shield', 'support', { mods: { startShield: 4 } }),
  U('s_swift', 'support', { ini: 2, speed: 1 }),
  U('s_taken', 'support', { mods: { taken: 0.08 } }),
  U('sc_saint', 'support', { cap: true, passive: 'regen', mods: { lifesteal: 0.08 } }),
  U('sc_marshal', 'support', { cap: true, passive: 'formation', mods: { counters: 1 } }),
];

export const upgradeById = (id: string): UpgradeDef | undefined => UPGRADES.find((u) => u.id === id);

/** Pool of a unit: from the data, otherwise guessed from its stats (neutrals). */
export function roleOf(d: UnitDef): Role {
  if (d.role && (ROLES as string[]).includes(d.role)) return d.role as Role;
  if (d.passives?.includes('healAura') || d.passives?.includes('warTotem') || d.passives?.includes('guardAura')) return 'support';
  if (d.ranged) return 'ranged';
  if (d.def >= d.atk + 2) return 'tank';
  return 'fighter';
}

/** Base growth (HP and damage) on top of the chosen upgrades, by level: bigger steps early, smaller late. */
export const LEVEL_GROWTH = [0, 0.08, 0.16, 0.2, 0.24, 0.28];

/** Upgrade passives that a unit's own passive already covers. */
const SAME_AS: Record<string, string> = { bladeDance: 'noRetaliation' };

/** Three upgrades to choose from for the next level (level 5: the two master upgrades and one normal one). */
export function upgradeOffer(d: UnitDef, taken: string[], nextLevel: number, g: Rng): UpgradeDef[] {
  const role = roleOf(d);
  const normal = g.shuffle(UPGRADES.filter((u) => u.role === role && !u.cap && !taken.includes(u.id)
    && !(u.passive && (d.passives?.includes(u.passive) || d.passives?.includes(SAME_AS[u.passive] ?? '')))));
  if (nextLevel >= 5) {
    const caps = UPGRADES.filter((u) => u.role === role && u.cap && !taken.includes(u.id));
    return [...caps, ...normal].slice(0, 3);
  }
  return normal.slice(0, 3);
}

/** Apply the chosen upgrades (and base growth) to a unit definition. */
export function applyUpgrades(d: UnitDef, level: number, ups: string[], extraMods: ModPatch[] = []): UnitDef {
  const base = LEVEL_GROWTH[Math.min(level, LEVEL_GROWTH.length - 1)];
  let hp = 1 + base, dmg = 1 + base;
  let atk = 0, def = 0, ini = 0, speed = 0, shots = 0;
  const passives = [...(d.passives ?? [])];
  const mods: ModPatch[] = [...extraMods];
  for (const id of ups) {
    const u = upgradeById(id);
    if (!u) continue;
    hp += u.hp ?? 0; dmg += u.dmg ?? 0;
    atk += u.atk ?? 0; def += u.def ?? 0; ini += u.ini ?? 0; speed += u.speed ?? 0; shots += u.shots ?? 0;
    if (u.passive && !passives.includes(u.passive)) passives.push(u.passive);
    if (u.mods) mods.push(u.mods);
  }
  const merged: ModPatch = {};
  for (const m of mods) for (const [k, v] of Object.entries(m) as [keyof ModPatch, number][]) merged[k] = (merged[k] ?? 0) + v;
  return {
    ...d, level, ups: [...ups],
    hp: Math.max(1, Math.round(d.hp * hp)),
    dmg: [Math.max(1, Math.round(d.dmg[0] * dmg)), Math.max(1, Math.round(d.dmg[1] * dmg))],
    atk: d.atk + atk, def: d.def + def, ini: d.ini + ini, speed: d.speed + speed,
    ranged: d.ranged ? d.ranged + shots : undefined,
    passives,
    mods: Object.keys(merged).length ? merged : undefined,
  };
}

// ---------- synergies ----------

export interface SynergyDef { id: string; roles: [Role, Role]; mods: Partial<Record<Role | 'all', ModPatch>>; }

/** Two units of these pools on level 3 or higher work together. */
export const SYNERGIES: SynergyDef[] = [
  { id: 'shieldAndBow', roles: ['tank', 'ranged'], mods: { ranged: { ranged: 0.1 }, tank: { taken: 0.05 } } },
  { id: 'hammerAnvil', roles: ['tank', 'fighter'], mods: { fighter: { melee: 0.08 }, tank: { counterDmg: 0.2 } } },
  { id: 'fieldHospital', roles: ['tank', 'support'], mods: { tank: { regen: 0.04 }, support: { taken: 0.06 } } },
  { id: 'arcaneBastion', roles: ['tank', 'mage'], mods: { mage: { taken: 0.1 }, tank: { thorns: 0.08 } } },
  { id: 'pincer', roles: ['fighter', 'ranged'], mods: { fighter: { firstStrike: 0.15 }, ranged: { executioner: 0.15 } } },
  { id: 'warDrums', roles: ['fighter', 'support'], mods: { fighter: { dmg: 0.08 }, support: { regen: 0.03 } } },
  { id: 'battleMagic', roles: ['fighter', 'mage'], mods: { fighter: { burn: 0.08 }, mage: { dmg: 0.08 } } },
  { id: 'coveringFire', roles: ['ranged', 'support'], mods: { ranged: { shots: 2 }, support: { startShield: 3 } } },
  { id: 'artillery', roles: ['ranged', 'mage'], mods: { all: { dmg: 0.06 } } },
  { id: 'arcaneCircle', roles: ['mage', 'support'], mods: { mage: { cooldown: 1 }, support: { regen: 0.03 } } },
  { id: 'brothers', roles: ['tank', 'tank'], mods: { all: { taken: 0.05, dmg: 0.05 } } },
];
/** All three units on level 5 (master upgrades): a legendary army. */
export const LEGEND: SynergyDef = { id: 'legend', roles: ['tank', 'tank'], mods: { all: { dmg: 0.08, taken: 0.06 } } };

export interface ArmyUnit { def: UnitDef; level: number; }

/** Synergies that are active for an army (pairs of different units on level 3+). */
export function activeSynergies(army: ArmyUnit[]): SynergyDef[] {
  const trained = army.filter((a) => a.level >= 3).map((a) => roleOf(a.def));
  const out: SynergyDef[] = [];
  for (const s of SYNERGIES) {
    const [a, b] = s.roles;
    if (s.id === 'brothers') {
      // two trained units of the same pool
      if (ROLES.some((r) => trained.filter((x) => x === r).length >= 2)) out.push(s);
      continue;
    }
    if (trained.includes(a) && trained.includes(b)) out.push(s);
  }
  if (army.length >= 3 && army.every((a) => a.level >= 5)) out.push(LEGEND);
  return out;
}

/** Synergy modifiers for one unit of the army. */
export function synergyMods(role: Role, syns: SynergyDef[]): ModPatch[] {
  const out: ModPatch[] = [];
  for (const s of syns) {
    if (s.mods.all) out.push(s.mods.all);
    const m = s.mods[role];
    if (m) out.push(m);
  }
  return out;
}

/** Synergies that would become active (or are close): for hints in the upgrade screen. */
export function synergyPartners(role: Role): SynergyDef[] {
  return SYNERGIES.filter((s) => s.roles.includes(role));
}
