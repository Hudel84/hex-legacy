// Battle rating after a won fight (Ben, 27.11.): the share of the army that is missing at the end
// gives a rank S..D; better ranks multiply the meta resources of that fight. No penalty for D.
export type Rank = 'S' | 'A' | 'B' | 'C' | 'D';

/** maxLoss = highest share of lost leadership for this rank (S = no unit lost at all). */
export const RANKS: { rank: Rank; maxLoss: number; mult: number; color: string }[] = [
  { rank: 'S', maxLoss: 0, mult: 2, color: '#ffd84a' },
  { rank: 'A', maxLoss: 0.1, mult: 1.5, color: '#7fe07a' },
  { rank: 'B', maxLoss: 0.3, mult: 1.2, color: '#7ab8ff' },
  { rank: 'C', maxLoss: 0.6, mult: 1, color: '#d8d0c0' },
  { rank: 'D', maxLoss: 1, mult: 1, color: '#c08a70' },
];

export function rankFor(loss: number): (typeof RANKS)[number] {
  return RANKS.find((r) => loss <= r.maxLoss + 1e-9) ?? RANKS[RANKS.length - 1];
}

/** Meta resources multiplied by the rank (rounded up so small amounts still grow). */
export function rateLoot<T extends Partial<Record<string, number>>>(loot: T, mult: number): T {
  if (mult === 1) return loot;
  return Object.fromEntries(Object.entries(loot).map(([k, v]) => [k, Math.ceil((v ?? 0) * mult)])) as T;
}

/** 1.5 -> "×1.5" (en) / "×1,5" (de). */
export function fmtMult(m: number, lang = 'en'): string {
  const v = String(Math.round(m * 100) / 100);
  return '×' + (lang === 'de' ? v.replace('.', ',') : v);
}

export const rankByLetter = (r?: string) => RANKS.find((x) => x.rank === r);
