// Meta progression ("the city"): resources carried over between runs and permanent buildings.
// Saved separately from the run in localStorage.

export type Res = 'wood' | 'stone' | 'ore' | 'crystals' | 'fame' | 'seal' | 'dust' | 'dew' | 'rune' | 'fang' | 'ash';
export const RES: Res[] = ['wood', 'stone', 'ore', 'crystals', 'fame', 'seal', 'dust', 'dew', 'rune', 'fang', 'ash'];
/** Each people collects its own resource during its runs. */
export const FACTION_RES: Record<string, Res> = { human: 'seal', undead: 'dust', elf: 'dew', dwarf: 'rune', orc: 'fang', demon: 'ash' };
const zeroRes = (): Record<Res, number> => Object.fromEntries(RES.map((r) => [r, 0])) as Record<Res, number>;
export const RES_ICON: Record<Res, string> = {
  wood: 'icons/resources/icon_res_wood.webp', stone: 'icons/resources/icon_res_stone.webp',
  ore: 'icons/resources/icon_res_ore.webp', crystals: 'icons/resources/icon_res_crystals.webp',
  fame: 'icons/resources/icon_res_fame.webp', seal: 'icons/resources/icon_res_human_sun_seal.webp',
  dust: 'icons/resources/icon_res_undead_bone_dust.webp',
  dew: 'icons/resources/icon_res_elf_moon_dew.webp', rune: 'icons/resources/icon_res_dwarf_runestone.webp',
  fang: 'icons/resources/icon_res_orc_blood_fang.webp', ash: 'icons/resources/icon_res_demon_hell_ash.webp',
};
export type Cost = Partial<Record<Res, number>>;

export interface BuildingDef {
  id: string;
  icon: string;          // icons/buildings/<icon>.webp
  district: 'center' | 'human' | 'undead' | 'elf' | 'dwarf' | 'orc' | 'demon';
  x: number; y: number;  // position on the city overview (1920x1080)
  costs: Cost[];         // one entry per level
}

/** Global cost factor (balancing: meta progression of about 20-30 hours, sim/meta_sim.ts). */
export const COST_MULT = 0.8;

type CostFn = (i: number) => Cost;
/** Cost table for n levels: f(i) for level i+1, rounded and multiplied with COST_MULT. */
const lv = (n: number, f: CostFn): Cost[] => Array.from({ length: n }, (_, i) => {
  const c = f(i);
  return Object.fromEntries(Object.entries(c).filter(([, v]) => (v ?? 0) > 0).map(([k, v]) => [k, Math.max(1, Math.round((v ?? 0) * COST_MULT))])) as Cost;
});
const g = (base: number, i: number, growth = 1.32, from = 0): number => (i < from ? 0 : base * growth ** (i - from));

/** The three unit buildings of a people: tier 4, 5 and 6 units (one level each). */
const people = (res: Res, i: number): Cost[] => [
  [{ [res]: 15, stone: 30, wood: 20 }],
  [{ [res]: 35, wood: 55, ore: 14 }],
  [{ [res]: 70, stone: 80, ore: 30, crystals: 10 }],
][i].map((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * COST_MULT)])) as Cost);

export const BUILDINGS: BuildingDef[] = [
  { id: 'townHall', icon: 'icon_building_town_hall', district: 'center', x: 980, y: 455,
    costs: lv(10, (i) => ({ wood: g(22, i), stone: g(18, i), ore: g(7, i, 1.32, 2), crystals: g(3, i, 1.35, 4), fame: g(20, i, 1.3, 6) })) },
  { id: 'barracks', icon: 'icon_building_barracks', district: 'center', x: 1385, y: 500,
    costs: lv(10, (i) => ({ wood: g(16, i), stone: g(10, i), ore: g(5, i, 1.32, 3), crystals: g(2, i, 1.35, 6) })) },
  { id: 'trainingYard', icon: 'icon_building_training_yard', district: 'center', x: 1200, y: 640,
    costs: lv(10, (i) => ({ stone: g(16, i), ore: g(4, i), crystals: g(2, i, 1.35, 4), fame: g(15, i, 1.3, 7) })) },
  { id: 'smithy', icon: 'icon_building_smithy', district: 'center', x: 1110, y: 390,
    costs: lv(3, (i) => [{ wood: 25, ore: 10 }, { stone: 45, ore: 25, crystals: 5 }, { stone: 80, ore: 50, crystals: 14 }][i]) },
  { id: 'marketplace', icon: 'icon_building_marketplace', district: 'center', x: 820, y: 650,
    costs: lv(5, (i) => ({ wood: g(18, i, 1.45), stone: g(12, i, 1.45), ore: g(5, i, 1.4, 2), crystals: g(3, i, 1.4, 3) })) },
  { id: 'tavern', icon: 'icon_building_tavern', district: 'center', x: 660, y: 560,
    costs: lv(2, (i) => [{ wood: 25, fame: 25 }, { wood: 55, stone: 30, fame: 70 }][i]) },
  { id: 'academy', icon: 'icon_building_academy', district: 'center', x: 1240, y: 330,
    costs: lv(2, (i) => [{ stone: 45, crystals: 6, fame: 45 }, { stone: 110, crystals: 20, fame: 130 }][i]) },
  { id: 'warehouse', icon: 'icon_building_warehouse', district: 'center', x: 740, y: 420,
    costs: lv(3, (i) => [{ wood: 30, stone: 20 }, { wood: 70, stone: 50, ore: 10 }, { wood: 130, stone: 100, ore: 30, crystals: 8 }][i]) },
  { id: 'library', icon: 'icon_building_library', district: 'center', x: 1010, y: 690,
    costs: lv(5, (i) => ({ wood: g(18, i, 1.5), stone: g(14, i, 1.5, 1), crystals: g(3, i, 1.5), fame: g(15, i, 1.5, 2) })) },
  { id: 'fieldCamp', icon: 'icon_building_field_camp', district: 'center', x: 700, y: 800,
    costs: lv(4, (i) => ({ wood: g(14, i, 1.6), stone: g(8, i, 1.6), ore: g(4, i, 1.6, 1) })) },
  // new in v0.17 (Ben 26.11.: more levels and more buildings)
  { id: 'treasury', icon: 'icon_building_treasury', district: 'center', x: 560, y: 215,
    costs: lv(3, (i) => [{ stone: 40, ore: 12, crystals: 4 }, { stone: 90, ore: 30, crystals: 12, fame: 40 }, { stone: 170, ore: 60, crystals: 30, fame: 110 }][i]) },
  { id: 'hallOfFame', icon: 'icon_building_hall_of_fame', district: 'center', x: 1360, y: 225,
    costs: lv(3, (i) => [{ wood: 35, stone: 25, fame: 30 }, { wood: 80, stone: 60, fame: 80 }, { wood: 160, stone: 120, crystals: 15, fame: 180 }][i]) },
  { id: 'blackMarket', icon: 'icon_building_black_market', district: 'center', x: 505, y: 545,
    costs: lv(3, (i) => [{ wood: 30, ore: 8 }, { wood: 70, ore: 22, crystals: 6 }, { wood: 140, ore: 45, crystals: 16 }][i]) },
  { id: 'oracle', icon: 'icon_building_oracle', district: 'center', x: 1580, y: 480,
    costs: lv(2, (i) => [{ stone: 50, crystals: 10, fame: 50 }, { stone: 120, crystals: 30, fame: 140 }][i]) },
  { id: 'arena', icon: 'icon_building_challenge_arena', district: 'center', x: 1310, y: 790,
    costs: lv(3, (i) => [{ wood: 40, stone: 40, ore: 10 }, { wood: 90, stone: 90, ore: 28, crystals: 6 }, { wood: 170, stone: 170, ore: 55, crystals: 18, fame: 80 }][i]) },
  { id: 'lumberMill', icon: 'icon_building_lumber_mill', district: 'center', x: 95, y: 300,
    costs: lv(3, (i) => [{ wood: 25, stone: 15 }, { wood: 60, stone: 40, ore: 8 }, { wood: 120, stone: 85, ore: 22 }][i]) },
  { id: 'oreMine', icon: 'icon_building_ore_mine', district: 'center', x: 1840, y: 130,
    costs: lv(3, (i) => [{ wood: 35, stone: 25 }, { wood: 80, stone: 60, ore: 12 }, { wood: 150, stone: 120, ore: 30, crystals: 6 }][i]) },
  // new in v0.18 (Ben 27.11.): the tactics zone before a battle grows from 2 to 3 and 4 columns
  { id: 'warCouncil', icon: 'icon_building_map_room', district: 'center', x: 880, y: 385,
    costs: lv(2, (i) => [{ wood: 45, stone: 35, ore: 10, fame: 30 }, { stone: 110, ore: 35, crystals: 12, fame: 110 }][i]) },
  // peoples
  { id: 'cathedral', icon: 'icon_building_human_cathedral', district: 'human', x: 420, y: 250, costs: people('seal', 0) },
  { id: 'griffinAerie', icon: 'icon_building_human_griffin_aerie', district: 'human', x: 660, y: 330, costs: people('seal', 1) },
  { id: 'knightsHall', icon: 'icon_building_human_knights_hall', district: 'human', x: 250, y: 420, costs: people('seal', 2) },
  { id: 'crypt', icon: 'icon_building_undead_crypt', district: 'undead', x: 250, y: 640, costs: people('dust', 0) },
  { id: 'necroTower', icon: 'icon_building_undead_necro_tower', district: 'undead', x: 450, y: 700, costs: people('dust', 1) },
  { id: 'dragonGraveyard', icon: 'icon_building_undead_dragon_graveyard', district: 'undead', x: 290, y: 830, costs: people('dust', 2) },
  { id: 'druidGrove', icon: 'icon_building_elf_druid_grove', district: 'elf', x: 870, y: 235, costs: people('dew', 0) },
  { id: 'unicornGlade', icon: 'icon_building_elf_unicorn_glade', district: 'elf', x: 1010, y: 210, costs: people('dew', 1) },
  { id: 'moonTemple', icon: 'icon_building_elf_moon_temple', district: 'elf', x: 1150, y: 235, costs: people('dew', 2) },
  { id: 'guildHall', icon: 'icon_building_dwarf_guild_hall', district: 'dwarf', x: 1500, y: 235, costs: people('rune', 0) },
  { id: 'golemWorkshop', icon: 'icon_building_dwarf_golem_workshop', district: 'dwarf', x: 1660, y: 190, costs: people('rune', 1) },
  { id: 'thaneHall', icon: 'icon_building_dwarf_thane_hall', district: 'dwarf', x: 1730, y: 340, costs: people('rune', 2) },
  { id: 'totemPit', icon: 'icon_building_orc_war_totem_pit', district: 'orc', x: 880, y: 905, costs: people('fang', 0) },
  { id: 'longhouse', icon: 'icon_building_orc_longhouse', district: 'orc', x: 1040, y: 950, costs: people('fang', 1) },
  { id: 'trollCave', icon: 'icon_building_orc_troll_cave', district: 'orc', x: 1200, y: 905, costs: people('fang', 2) },
  { id: 'pactTower', icon: 'icon_building_demon_pact_tower', district: 'demon', x: 1450, y: 655, costs: people('ash', 0) },
  { id: 'infernalAltar', icon: 'icon_building_demon_infernal_altar', district: 'demon', x: 1620, y: 615, costs: people('ash', 1) },
  { id: 'hellGate', icon: 'icon_building_demon_hell_gate', district: 'demon', x: 1470, y: 805, costs: people('ash', 2) },
];
export const buildingById = (id: string): BuildingDef => BUILDINGS.find((b) => b.id === id)!;

/** Districts of the other peoples, shown as locked. */
export const LOCKED_DISTRICTS: { id: string; x: number; y: number }[] = [];

/** Building costs before v0.17 (meta version 1), to refund them when the city is reset. */
const V1_COSTS: Record<string, Cost[]> = {
  townHall: [{ wood: 10, stone: 8 }, { wood: 25, stone: 20, ore: 5 }, { wood: 40, stone: 35, ore: 10, crystals: 3 }],
  barracks: [{ wood: 8, stone: 5 }, { wood: 18, stone: 12 }, { wood: 28, stone: 20, ore: 4 }, { wood: 40, stone: 30, ore: 8 }, { wood: 55, stone: 45, ore: 12, crystals: 2 }],
  trainingYard: [{ stone: 10, ore: 2 }, { stone: 18, ore: 5 }, { stone: 28, ore: 9, crystals: 1 }, { stone: 40, ore: 14, crystals: 3 }],
  smithy: [{ wood: 15, ore: 5 }, { stone: 20, ore: 12, crystals: 2 }],
  marketplace: [{ wood: 10, stone: 6 }, { wood: 25, stone: 15, ore: 3 }, { wood: 40, stone: 25, ore: 6, crystals: 2 }],
  tavern: [{ wood: 15, fame: 8 }, { wood: 25, stone: 10, fame: 20 }],
  academy: [{ stone: 20, crystals: 3, fame: 15 }],
  warehouse: [{ wood: 20, stone: 15 }],
  library: [{ wood: 12, crystals: 2 }, { stone: 20, crystals: 5 }, { stone: 30, ore: 8, crystals: 10, fame: 10 }],
  fieldCamp: [{ wood: 8, stone: 4 }, { wood: 25, stone: 15, ore: 4 }],
  cathedral: [{ seal: 8, stone: 15 }], griffinAerie: [{ seal: 15, wood: 20, ore: 5 }], knightsHall: [{ seal: 25, stone: 25, ore: 10, crystals: 3 }],
  crypt: [{ dust: 8, stone: 15 }], necroTower: [{ dust: 15, stone: 20, ore: 5 }], dragonGraveyard: [{ dust: 25, stone: 25, ore: 10, crystals: 3 }],
  druidGrove: [{ dew: 8, wood: 15 }], unicornGlade: [{ dew: 15, wood: 20, ore: 5 }], moonTemple: [{ dew: 25, stone: 25, ore: 10, crystals: 3 }],
  guildHall: [{ rune: 8, stone: 15 }], golemWorkshop: [{ rune: 15, stone: 20, ore: 5 }], thaneHall: [{ rune: 25, stone: 25, ore: 10, crystals: 3 }],
  totemPit: [{ fang: 8, wood: 15 }], longhouse: [{ fang: 15, wood: 20, ore: 5 }], trollCave: [{ fang: 25, stone: 25, ore: 10, crystals: 3 }],
  pactTower: [{ ash: 8, stone: 15 }], infernalAltar: [{ ash: 15, stone: 20, ore: 5 }], hellGate: [{ ash: 25, stone: 25, ore: 10, crystals: 3 }],
};

export interface MetaState {
  version: 2;
  res: Record<Res, number>;
  buildings: Record<string, number>;
  runs: number;
  wins: number;
  bestFloor: number;
  /** v0.17: the city was reset, the spent resources were refunded (shown once in the city). */
  resetNotice?: Partial<Record<Res, number>> | null;
}

const KEY = 'hexlegacy.meta.v1';
let meta: MetaState | null = null;

function fresh(): MetaState {
  return { version: 2, res: zeroRes(), buildings: {}, runs: 0, wins: 0, bestFloor: 0 };
}

export function getMeta(): MetaState {
  if (meta) return meta;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as Omit<MetaState, 'version'> & { version: number };
      if (m.version === 1) {
        // v0.17 (Ben 26.11.): reset the city, keep the resources and refund everything that was built
        const res = { ...fresh().res, ...m.res };
        const refund: Partial<Record<Res, number>> = {};
        for (const [id, l] of Object.entries(m.buildings ?? {})) {
          for (const c of (V1_COSTS[id] ?? []).slice(0, l)) for (const [r, v] of Object.entries(c) as [Res, number][]) { res[r] += v; refund[r] = (refund[r] ?? 0) + v; }
        }
        meta = { ...fresh(), runs: m.runs ?? 0, wins: m.wins ?? 0, bestFloor: m.bestFloor ?? 0, res, buildings: {}, resetNotice: refund };
        saveMeta();
        return meta;
      }
      if (m.version === 2) { meta = { ...fresh(), ...(m as MetaState), res: { ...fresh().res, ...m.res } }; return meta; }
    }
  } catch { /* ignore */ }
  meta = fresh();
  return meta;
}

export function saveMeta(): void {
  try { localStorage.setItem(KEY, JSON.stringify(getMeta())); } catch { /* ignore */ }
}

export const level = (id: string): number => getMeta().buildings[id] ?? 0;
export const maxLevel = (id: string): number => buildingById(id).costs.length;

export function nextCost(id: string): Cost | null {
  const l = level(id);
  return l < maxLevel(id) ? buildingById(id).costs[l] : null;
}

export function canAfford(c: Cost): boolean {
  const m = getMeta();
  return (Object.keys(c) as Res[]).every((r) => m.res[r] >= (c[r] ?? 0));
}

/** Buildings can be at most one level above the town hall (the town hall itself is free of this). */
export function blockedByTownHall(id: string): boolean {
  return id !== 'townHall' && level(id) >= level('townHall') + 1;
}

export function build(id: string): boolean {
  const c = nextCost(id);
  if (!c || !canAfford(c) || blockedByTownHall(id)) return false;
  const m = getMeta();
  for (const r of Object.keys(c) as Res[]) m.res[r] -= c[r] ?? 0;
  m.buildings[id] = level(id) + 1;
  saveMeta();
  return true;
}

export function addRes(gain: Partial<Record<Res, number>>, factor = 1): Record<Res, number> {
  const m = getMeta();
  const out = zeroRes();
  for (const r of RES) {
    const v = Math.floor((gain[r] ?? 0) * factor);
    m.res[r] += v;
    out[r] = v;
  }
  saveMeta();
  return out;
}

// ---------- effects used by the run ----------

export const bonus = {
  startGold: () => 15 * level('townHall'),
  leadership: () => 4 * level('barracks'),
  atk: () => [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3][level('trainingYard')] ?? 3,
  def: () => [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3][level('trainingYard')] ?? 3,
  /** number of start units with one upgrade level */
  smithy: () => level('smithy'),
  shopDiscount: () => 0.06 * level('marketplace'),
  levelUpChoices: () => 3 + level('academy'),
  keepOnDefeat: () => [0.6, 0.7, 0.8, 0.9][level('warehouse')] ?? 0.9,
  campLeadership: () => [0, 6, 6, 10, 14][level('fieldCamp')] ?? 14,
  campDrill: () => [12, 12, 20, 20, 30][level('fieldCamp')] ?? 30,
  knowledge: () => (level('library') >= 1 ? 1 : 0) + (level('library') >= 4 ? 1 : 0),
  power: () => (level('library') >= 2 ? 1 : 0) + (level('library') >= 5 ? 1 : 0),
  /** one extra start spell from the hero's schools */
  extraSpell: () => level('library') >= 3,
  /** v0.17 buildings */
  startArtifact: (): '' | 'common' | 'rare' | 'legendary' => (['', 'common', 'rare', 'legendary'] as const)[level('treasury')] ?? 'legendary',
  xp: () => 1 + 0.07 * level('hallOfFame'),
  startConsumables: () => level('blackMarket'),
  rerolls: () => level('oracle'),
  unitHp: () => 0.03 * level('arena'),
  /** columns on the own side where stacks may be placed before a battle (tactics, v0.18) */
  deployCols: () => 2 + Math.min(2, level('warCouncil')),
  /** resources the mills and mines produce per run (only after the act-1 boss, see productionEarned in state.ts; not reduced) */
  production: (): Partial<Record<Res, number>> => ({
    wood: 5 * level('lumberMill'), stone: 4 * level('lumberMill'), ore: 3 * level('oreMine'), crystals: level('oreMine'),
  }),
};

/** Heroes: the first hero of every people is free, the tavern unlocks the second and third. */
const HERO_TIER: Record<string, number> = {
  human_hero_guard_captain: 1, human_hero_priestess_of_light: 2,
  undead_hero_necromancer: 1, undead_hero_grave_robber: 2,
  elf_hero_druid: 1, elf_hero_shadow_pathfinder: 2, dwarf_hero_runesmith: 1, dwarf_hero_sapper_master: 2,
  orc_hero_shaman: 1, orc_hero_raid_master: 2, demon_hero_warlock: 1, demon_hero_pact_maker: 2,
};
export function heroUnlocked(heroId: string): boolean {
  return level('tavern') >= (HERO_TIER[heroId] ?? 0);
}
export function heroUnlockText(heroId: string): string | null {
  const n = HERO_TIER[heroId];
  return n ? `tavern:${n}` : null;
}

/** Unit types that can show up in drafts and shops. */
export function unitUnlocked(unitId: string): boolean {
  if (unitId === 'human_t4_cleric') return level('cathedral') >= 1;
  if (unitId === 'human_t5_griffin_rider') return level('griffinAerie') >= 1;
  if (unitId === 'human_t6_paladin') return level('knightsHall') >= 1;
  if (unitId === 'undead_t4_vampire') return level('crypt') >= 1;
  if (unitId === 'undead_t5_lich') return level('necroTower') >= 1;
  if (unitId === 'undead_t6_bone_dragon') return level('dragonGraveyard') >= 1;
  const gate: Record<string, string> = {
    elf_t4_dryad: 'druidGrove', elf_t5_unicorn_rider: 'unicornGlade', elf_t6_ancient_treant: 'moonTemple',
    dwarf_t4_shieldwall_guard: 'guildHall', dwarf_t5_steam_golem: 'golemWorkshop', dwarf_t6_berserker_thane: 'thaneHall',
    orc_t4_shaman_adept: 'totemPit', orc_t5_ogre: 'longhouse', orc_t6_war_troll: 'trollCave',
    demon_t4_devil: 'pactTower', demon_t5_fire_lord: 'infernalAltar', demon_t6_archdemon: 'hellGate',
  };
  if (gate[unitId]) return level(gate[unitId]) >= 1;
  return true;
}
