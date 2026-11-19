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
  flying?: boolean;
  undead?: boolean;
  /** passive keys handled by the engine */
  passives?: string[];
  sheet: string;            // idle sprite sheet path (relative to assets/)
  portrait: string;
}

export interface HeroStats { atk: number; def: number; }

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
}

export type BattleEvent =
  | { type: 'move'; uid: number; path: Hex[] }
  | { type: 'attack'; uid: number; target: number; ranged: boolean; counter: boolean;
      damage: number; kills: number; left: number }
  | { type: 'heal'; uid: number; amount: number; count: number }
  | { type: 'death'; uid: number }
  | { type: 'wait'; uid: number }
  | { type: 'defend'; uid: number }
  | { type: 'round'; round: number }
  | { type: 'turn'; uid: number }
  | { type: 'end'; winner: Side };
