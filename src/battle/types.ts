import type { Hex } from './hex';

export type Faction = 'human' | 'elf' | 'dwarf' | 'undead' | 'orc' | 'demon' | 'neutral';
export type Side = 'player' | 'enemy';

/** Static data of a unit type (from data/units.json). */
export interface UnitDef {
  id: string;
  faction: Faction;
  tier: number;
  hp: number;
  atk: number;
  def: number;
  dmg: [number, number];
  ini: number;
  speed: number;
  cost: number;
  ranged?: number;          // number of shots, absent = melee
  sizeScale?: number;       // sprite size override (elites, bosses)
  active?: string;          // active ability id (see abilities in engine)
  mounted?: boolean;        // riders and beasts of burden (spearmen resist them)
  wide?: boolean;           // occupies two hexes (bosses)
  level?: number;           // upgrade level of the player's unit type (0-2)
  flying?: boolean;
  undead?: boolean;
  /** passive keys handled by the engine */
  passives?: string[];
  sheet: string;            // idle sprite sheet path (relative to assets/)
  still?: string;           // use this still image instead (idle video cut the figure off)
  portrait: string;
}

export interface HeroStats {
  atk: number;
  def: number;
  power?: number;          // spell power (Zauberkraft)
  knowledge?: number;      // 10 mana per point (Wissen)
  spells?: { id: string; level: number }[];
  consumables?: string[];  // belt: consumable ids ('' = empty place)
}

/** One stack on the battlefield. */
export interface Stack {
  uid: number;
  def: UnitDef;
  side: Side;
  count: number;
  startCount: number;
  topHp: number;            // remaining hp of the top creature
  pos: Hex;
  shots: number;
  retaliated: boolean;      // already countered this round
  defending: boolean;
  waited: boolean;
  acted: boolean;
  cooldown: number;         // rounds until the active ability is ready again (0 = ready)
  attacks: number;          // own attacks this battle (first-strike talents)
  counters: number;         // counter-attacks used this round
  statuses: Status[];
  summonRounds?: number;    // summoned stacks vanish when this reaches 0
}

export type StatusId = 'poison' | 'atkDown' | 'defDown' | 'shield' | 'spearwall' | 'disembodied'
  // from hero spells and people passives
  | 'bless' | 'ward' | 'haste' | 'slow' | 'focus' | 'confused' | 'fear' | 'root' | 'regrowth' | 'thornskin'
  | 'burn' | 'frenzy' | 'fury';
export interface Status { id: StatusId; turns: number; value: number; }

export type BattleEvent =
  | { type: 'move'; uid: number; path: Hex[] }
  | { type: 'attack'; uid: number; target: number; ranged: boolean; counter: boolean;
      damage: number; kills: number; left: number; crit?: boolean }
  | { type: 'heal'; uid: number; amount: number; count: number }
  | { type: 'ability'; uid: number; ability: string; target?: number }
  | { type: 'status'; uid: number; status: StatusId; on: boolean }
  | { type: 'dot'; uid: number; damage: number; kills: number; left: number; source?: 'thorns' | 'burn' }
  | { type: 'cast'; side: Side; spell: string; target?: number; mana: number }
  | { type: 'spellHit'; uid: number; spell: string; damage: number; kills: number; left: number; absorbed?: number }
  | { type: 'resist'; uid: number; status: StatusId }
  | { type: 'useItem'; side: Side; item: string; index: number; target?: number }
  | { type: 'summon'; uid: number }
  | { type: 'vanish'; uid: number }
  | { type: 'teleport'; uid: number; to: Hex }
  | { type: 'skip'; uid: number; reason: 'fear' }
  | { type: 'ward'; uid: number; absorbed: number }
  | { type: 'death'; uid: number }
  | { type: 'wait'; uid: number }
  | { type: 'defend'; uid: number }
  | { type: 'round'; round: number }
  | { type: 'turn'; uid: number }
  | { type: 'end'; winner: Side };
