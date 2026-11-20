// Meta progression ("the city"): resources carried over between runs and permanent buildings.
// Saved separately from the run in localStorage.

export type Res = 'wood' | 'stone' | 'ore' | 'crystals' | 'fame' | 'seal' | 'dust';
export const RES: Res[] = ['wood', 'stone', 'ore', 'crystals', 'fame', 'seal', 'dust'];
/** Each people collects its own resource during its runs. */
export const FACTION_RES: Record<string, Res> = { human: 'seal', undead: 'dust' };
export const RES_ICON: Record<Res, string> = {
  wood: 'icons/resources/icon_res_wood.webp', stone: 'icons/resources/icon_res_stone.webp',
  ore: 'icons/resources/icon_res_ore.webp', crystals: 'icons/resources/icon_res_crystals.webp',
  fame: 'icons/resources/icon_res_fame.webp', seal: 'icons/resources/icon_res_human_sun_seal.webp',
  dust: 'icons/resources/icon_res_undead_bone_dust.webp',
};
export type Cost = Partial<Record<Res, number>>;

export interface BuildingDef {
  id: string;
  icon: string;          // icons/buildings/<icon>.webp
  district: 'center' | 'human' | 'undead';
  x: number; y: number;  // position on the city overview (1920x1080)
  costs: Cost[];         // one entry per level
}

export const BUILDINGS: BuildingDef[] = [
  { id: 'townHall', icon: 'icon_building_town_hall', district: 'center', x: 980, y: 455,
    costs: [{ wood: 10, stone: 8 }, { wood: 25, stone: 20, ore: 5 }, { wood: 40, stone: 35, ore: 10, crystals: 3 }] },
  { id: 'barracks', icon: 'icon_building_barracks', district: 'center', x: 1385, y: 500,
    costs: [{ wood: 8, stone: 5 }, { wood: 18, stone: 12 }, { wood: 28, stone: 20, ore: 4 }, { wood: 40, stone: 30, ore: 8 }, { wood: 55, stone: 45, ore: 12, crystals: 2 }] },
  { id: 'trainingYard', icon: 'icon_building_training_yard', district: 'center', x: 1200, y: 640,
    costs: [{ stone: 10, ore: 2 }, { stone: 18, ore: 5 }, { stone: 28, ore: 9, crystals: 1 }, { stone: 40, ore: 14, crystals: 3 }] },
  { id: 'smithy', icon: 'icon_building_smithy', district: 'center', x: 1110, y: 390,
    costs: [{ wood: 15, ore: 5 }, { stone: 20, ore: 12, crystals: 2 }] },
  { id: 'marketplace', icon: 'icon_building_marketplace', district: 'center', x: 820, y: 650,
    costs: [{ wood: 10, stone: 6 }, { wood: 25, stone: 15, ore: 3 }, { wood: 40, stone: 25, ore: 6, crystals: 2 }] },
  { id: 'tavern', icon: 'icon_building_tavern', district: 'center', x: 660, y: 560,
    costs: [{ wood: 15, fame: 8 }, { wood: 25, stone: 10, fame: 20 }] },
  { id: 'academy', icon: 'icon_building_academy', district: 'center', x: 1240, y: 330,
    costs: [{ stone: 20, crystals: 3, fame: 15 }] },
  { id: 'warehouse', icon: 'icon_building_warehouse', district: 'center', x: 880, y: 300,
    costs: [{ wood: 20, stone: 15 }] },
  { id: 'library', icon: 'icon_building_library', district: 'center', x: 1010, y: 690,
    costs: [{ wood: 12, crystals: 2 }, { stone: 20, crystals: 5 }, { stone: 30, ore: 8, crystals: 10, fame: 10 }] },
  { id: 'fieldCamp', icon: 'icon_building_field_camp', district: 'center', x: 700, y: 800,
    costs: [{ wood: 8, stone: 4 }, { wood: 25, stone: 15, ore: 4 }] },
  { id: 'cathedral', icon: 'icon_building_human_cathedral', district: 'human', x: 420, y: 250,
    costs: [{ seal: 8, stone: 15 }] },
  { id: 'griffinAerie', icon: 'icon_building_human_griffin_aerie', district: 'human', x: 660, y: 330,
    costs: [{ seal: 15, wood: 20, ore: 5 }] },
  { id: 'knightsHall', icon: 'icon_building_human_knights_hall', district: 'human', x: 250, y: 420,
    costs: [{ seal: 25, stone: 25, ore: 10, crystals: 3 }] },
  { id: 'crypt', icon: 'icon_building_undead_crypt', district: 'undead', x: 250, y: 640,
    costs: [{ dust: 8, stone: 15 }] },
  { id: 'necroTower', icon: 'icon_building_undead_necro_tower', district: 'undead', x: 450, y: 700,
    costs: [{ dust: 15, stone: 20, ore: 5 }] },
  { id: 'dragonGraveyard', icon: 'icon_building_undead_dragon_graveyard', district: 'undead', x: 290, y: 830,
    costs: [{ dust: 25, stone: 25, ore: 10, crystals: 3 }] },
];
export const buildingById = (id: string): BuildingDef => BUILDINGS.find((b) => b.id === id)!;

/** Districts of the other peoples, shown as locked. */
export const LOCKED_DISTRICTS = [
  { id: 'elves', x: 1040, y: 235 }, { id: 'dwarves', x: 1600, y: 260 },
  { id: 'orcs', x: 1000, y: 930 }, { id: 'demons', x: 1620, y: 800 },
];

export interface MetaState {
  version: 1;
  res: Record<Res, number>;
  buildings: Record<string, number>;
  runs: number;
  wins: number;
  bestFloor: number;
}

const KEY = 'hexlegacy.meta.v1';
let meta: MetaState | null = null;

function fresh(): MetaState {
  return { version: 1, res: { wood: 0, stone: 0, ore: 0, crystals: 0, fame: 0, seal: 0, dust: 0 }, buildings: {}, runs: 0, wins: 0, bestFloor: 0 };
}

export function getMeta(): MetaState {
  if (meta) return meta;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const m = JSON.parse(raw) as MetaState;
      if (m.version === 1) { meta = { ...fresh(), ...m, res: { ...fresh().res, ...m.res } }; return meta; }
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
  const out = { wood: 0, stone: 0, ore: 0, crystals: 0, fame: 0, seal: 0, dust: 0 } as Record<Res, number>;
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
  startGold: () => 25 * level('townHall'),
  leadership: () => 10 * level('barracks'),
  atk: () => Math.ceil(level('trainingYard') / 2),
  def: () => Math.floor(level('trainingYard') / 2),
  /** number of start units with one upgrade level */
  smithy: () => level('smithy'),
  shopDiscount: () => 0.1 * level('marketplace'),
  levelUpChoices: () => 3 + level('academy'),
  keepOnDefeat: () => (level('warehouse') ? 0.85 : 0.6),
  campLeadership: () => (level('fieldCamp') >= 1 ? 6 : 0),
  campDrill: () => (level('fieldCamp') >= 2 ? 20 : 12),
  knowledge: () => (level('library') >= 1 ? 1 : 0),
  power: () => (level('library') >= 2 ? 1 : 0),
  /** one extra start spell from the hero's schools */
  extraSpell: () => level('library') >= 3,
};

/** Heroes: the first hero of every people is free, the tavern unlocks the second and third. */
const HERO_TIER: Record<string, number> = {
  human_hero_guard_captain: 1, human_hero_priestess_of_light: 2,
  undead_hero_necromancer: 1, undead_hero_grave_robber: 2,
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
  return true;
}
