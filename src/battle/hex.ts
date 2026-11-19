// Hex grid helpers. Pointy-top hexes, "odd-r" offset coordinates:
// odd rows are shifted half a hex to the right.

export interface Hex { col: number; row: number; }

export const COLS = 9;
export const ROWS = 7;

export const key = (h: Hex): string => `${h.col},${h.row}`;
export const eq = (a: Hex, b: Hex): boolean => a.col === b.col && a.row === b.row;
export const inBounds = (h: Hex): boolean => h.col >= 0 && h.col < COLS && h.row >= 0 && h.row < ROWS;

const EVEN = [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]];
const ODD = [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]];

export function neighbors(h: Hex): Hex[] {
  const d = h.row % 2 === 0 ? EVEN : ODD;
  return d.map(([dc, dr]) => ({ col: h.col + dc, row: h.row + dr })).filter(inBounds);
}

function toCube(h: Hex): [number, number, number] {
  const x = h.col - (h.row - (h.row & 1)) / 2;
  const z = h.row;
  return [x, -x - z, z];
}

export function distance(a: Hex, b: Hex): number {
  const [ax, ay, az] = toCube(a);
  const [bx, by, bz] = toCube(b);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
}

export function allHexes(): Hex[] {
  const out: Hex[] = [];
  for (let row = 0; row < ROWS; row++) for (let col = 0; col < COLS; col++) out.push({ col, row });
  return out;
}
