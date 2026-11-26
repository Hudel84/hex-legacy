// Cards for the hero talent themes (v0.16): level-up choice (new rank / new theme / boon) and the rank upgrades.
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { perkById, perkIconKey } from '../run/perks';
import { basePerkId, themeById } from '../run/talents';
import { perkLines, RARITY_COLOR } from './perkUi';
import { card } from './widgets';
import type { LevelOption } from '../run/state';

export const themeName = (id: string): string => t(`talent.${id}`);
const ROMAN = ['', 'I', 'II', 'III'];
export const rankLabel = (rank: number): string => t('talent.rank', { n: ROMAN[rank] ?? String(rank) });

/** Effect lines of a theme rank: magic unlock + base effects. */
export function rankLines(theme: string, rank: number): string[] {
  const th = themeById(theme);
  const out: string[] = [];
  if (th?.magic) out.push(t('talent.magicUnlock', { school: t(`school.${th.magic}`), tier: rank }));
  const extra = t(`talent.${theme}.r${rank}`);
  if (!extra.startsWith('[')) out.push(extra);
  out.push(...perkLines(perkById(basePerkId(theme, rank))).filter(() => !['deathDecay', 'burning', 'summoning'].includes(theme)));
  return out;
}

/** Card of one level-up option. */
export function levelOptionCard(scene: Phaser.Scene, x: number, y: number, o: LevelOption, curRank: number, onClick: () => void): Phaser.GameObjects.Container {
  if (o.kind === 'boon') {
    return card(scene, x, y, { w: 300, h: 520, portrait: 'icon_atk', title: t(`boon.${o.boon}`), subtitle: t('talent.boon'), subtitleColor: '#d9c7a0', lines: [], onClick });
  }
  const rank = o.kind === 'rank' ? curRank + 1 : 1;
  const lines = o.kind === 'new' ? [t(`talent.${o.theme}.desc`), ...rankLines(o.theme, 1)] : rankLines(o.theme, rank);
  lines.push(t(rank === 3 ? 'talent.thenLegendary' : 'talent.thenUpgrade'));
  return card(scene, x, y, {
    w: 300, h: 560, portrait: perkIconKey(perkById(basePerkId(o.theme, 1))), title: themeName(o.theme),
    subtitle: o.kind === 'new' ? `${t('talent.new')} · ${rankLabel(1)}` : rankLabel(rank),
    subtitleColor: RARITY_COLOR[rank === 3 ? 'legendary' : rank === 2 ? 'rare' : 'common'],
    lines, lineSize: lines.join(' ').length > 150 ? 16 : lines.join(' ').length > 95 ? 18 : 20, onClick,
  });
}
