import raw from './units.json';
import type { UnitDef } from '../battle/types';

export const UNITS: Record<string, UnitDef> = Object.fromEntries(
  Object.entries(raw as unknown as Record<string, Omit<UnitDef, 'id'>>).map(([id, d]) => [id, { id, ...d } as UnitDef]),
);
