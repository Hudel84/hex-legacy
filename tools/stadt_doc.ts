// Writes the city overview for Ben (German): all buildings, levels, effects and costs.
// Usage: npx tsx tools/stadt_doc.ts > STADT.md
import { BUILDINGS, COST_MULT, type Res } from '../src/meta/meta';
import de from '../src/i18n/de.json';
import pkg from '../package.json';

const T = de as Record<string, string>;
const RES_DE: Record<Res, string> = { wood: 'Holz', stone: 'Stein', ore: 'Erz', crystals: 'Kristalle', fame: 'Ruhm', seal: 'Sonnensiegel',
  dust: 'Grabstaub', dew: 'Mondtau', rune: 'Runenstein', fang: 'Blutzahn', ash: 'Höllenasche' };
const fill = (s: string, v: Record<string, number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? `{${k}}`));
function levelText(id: string, i: number): string {
  const own = T[`building.${id}.l${i}`];
  if (own) return own;
  const n: Record<string, Record<string, number>> = {
    townHall: { gold: 15 * i, max: i + 1 }, barracks: { n: 4 * i }, trainingYard: { atk: [0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3][i], def: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3][i] },
    marketplace: { n: 6 * i },
  };
  return fill(T[`building.${id}.lv`] ?? '?', n[id] ?? { n: i });
}
const levels = BUILDINGS.reduce((a, b) => a + b.costs.length, 0);
const out = [`# Stadt v${pkg.version} (zum Durchsehen)`, '', `${BUILDINGS.length} Gebäude, ${levels} Stufen. Gebäude können höchstens eine Stufe über dem Rathaus stehen. Kostenfaktor ${String(COST_MULT).replace('.', ',')}.`, ''];
for (const b of BUILDINGS) {
  out.push(`## ${T[`building.${b.id}.name`]} (${b.costs.length} ${b.costs.length === 1 ? 'Stufe' : 'Stufen'})`, '', T[`building.${b.id}.desc`] ?? '', '', '| Stufe | Wirkung | Kosten |', '|---|---|---|');
  b.costs.forEach((c, i) => out.push(`| ${i + 1} | ${levelText(b.id, i + 1)} | ${Object.entries(c).map(([r, v]) => `${v} ${RES_DE[r as Res]}`).join(', ')} |`));
  out.push('');
}
console.log(out.join('\n'));
