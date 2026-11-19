import { Rng } from './rng';

export type NodeType = 'battle' | 'elite' | 'event' | 'shop' | 'rest' | 'treasure' | 'shrine' | 'boss';

export interface MapNode {
  id: number;
  floor: number;
  col: number;
  type: NodeType;
  next: number[];
  x: number;   // map image coordinates (0..1 of width / height)
  y: number;
}

export const FLOORS = 12;     // floors 0..11, boss above
export const COLS = 7;

/**
 * Slay-the-Spire style map: several paths walk upwards from random start columns,
 * each step moving to the column left, straight or right without crossing other paths.
 */
export function generateMap(seed: number): MapNode[] {
  const rng = new Rng(seed);
  const grid = new Map<string, MapNode>();
  const edges = new Set<string>();
  let id = 0;
  const nodeAt = (f: number, c: number): MapNode => {
    const k = `${f},${c}`;
    let n = grid.get(k);
    if (!n) {
      n = { id: id++, floor: f, col: c, type: 'battle', next: [], x: 0, y: 0 };
      grid.set(k, n);
    }
    return n;
  };
  const distinct = rng.shuffle([...Array(COLS).keys()]);
  for (let p = 0; p < 6; p++) {
    let c = p < 3 ? distinct[p] : rng.int(0, COLS - 1);
    for (let f = 0; f < FLOORS - 1; f++) {
      const options = [c - 1, c, c + 1].filter((x) => x >= 0 && x < COLS);
      let nc = rng.pick(options);
      // no crossing: moving diagonally is not allowed if the opposite diagonal exists
      if (nc !== c && edges.has(`${f},${nc}>${c}`)) nc = c;
      edges.add(`${f},${c}>${nc}`);
      const a = nodeAt(f, c);
      const b = nodeAt(f + 1, nc);
      if (!a.next.includes(b.id)) a.next.push(b.id);
      c = nc;
    }
  }
  const nodes = [...grid.values()];
  const boss: MapNode = { id: id++, floor: FLOORS, col: 3, type: 'boss', next: [], x: 0.5, y: 0 };
  for (const n of nodes) if (n.floor === FLOORS - 1) n.next = [boss.id];

  // node types
  for (const n of nodes) {
    if (n.floor === 0) n.type = 'battle';
    else if (n.floor === 6) n.type = 'treasure';
    else if (n.floor === FLOORS - 1) n.type = 'rest';
    else {
      const w: Record<NodeType, number> = {
        battle: 45, event: 22, elite: n.floor >= 4 ? 11 : 0, shop: n.floor >= 2 ? 9 : 0,
        rest: n.floor >= 4 && n.floor <= 9 ? 7 : 0, shrine: 6, treasure: 0, boss: 0,
      };
      n.type = rng.weighted(w);
      // avoid the same special type twice in a row on a path
      const prev = nodes.filter((p) => p.next.includes(n.id));
      if (n.type !== 'battle' && n.type !== 'event' && prev.some((p) => p.type === n.type)) n.type = 'battle';
    }
  }
  // positions (fractions of the map image), with a little jitter
  for (const n of nodes) {
    n.x = 0.12 + (n.col / (COLS - 1)) * 0.76 + (rng.next() - 0.5) * 0.05;
    n.y = 0.915 - (n.floor / (FLOORS - 1)) * 0.78 + (rng.next() - 0.5) * 0.015;
  }
  boss.y = 0.07;
  nodes.sort((a, b) => a.id - b.id);
  return [...nodes, boss];
}
