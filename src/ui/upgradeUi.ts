// Choice of a unit upgrade (one of three from the unit's pool) and texts for upgrades and synergies.
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playSfx } from '../core/audio';
import { unitDef, MAX_UNIT_LEVEL, armySynergies, upgradeOptions, type ArmySlot } from '../run/state';
import { upgradeById, roleOf, synergyPartners, type UpgradeDef, type SynergyDef, type Role } from '../run/upgrades';
import type { PerkDef } from '../run/perks';
import { perkLines } from './perkUi';
import { card, titleStyle, textStyle } from './widgets';
import { Button } from './Button';

export const ROLE_COLOR: Record<Role, string> = {
  tank: '#9fc4ff', fighter: '#ff9f7a', ranged: '#a8e07a', mage: '#d4a8ff', support: '#ffe08a',
};

export const upgradeName = (id: string): string => t(`upg.${id}`);
export const roleName = (r: Role): string => t(`role.${r}`);

/** Effect lines of an upgrade (stats, granted passive, modifiers). */
export function upgradeLines(u: UpgradeDef, withPassiveDesc = true): string[] {
  const out: string[] = [];
  const pct = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(Math.round(x * 100))}`;
  const flat = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x)}`;
  if (u.hp) out.push(t('upg.eff.hp', { v: pct(u.hp) }));
  if (u.dmg) out.push(t('upg.eff.dmg', { v: pct(u.dmg) }));
  if (u.atk) out.push(t('eff.atk', { v: flat(u.atk) }));
  if (u.def) out.push(t('eff.def', { v: flat(u.def) }));
  if (u.ini) out.push(t('eff.ini', { v: flat(u.ini) }));
  if (u.speed) out.push(t('eff.speed', { v: flat(u.speed) }));
  if (u.shots) out.push(t('upg.eff.shots', { v: flat(u.shots) }));
  if (u.mods) out.push(...perkLines({ mods: u.mods } as PerkDef));
  if (u.passive) {
    out.push(t('upg.eff.passive', { name: t(`passiveName.${u.passive}`) }));
    if (withPassiveDesc) out.push(t(`passive.${u.passive}`));
  }
  return out;
}

export function synergyName(s: SynergyDef): string { return t(`syn.${s.id}`); }
export function synergyLines(s: SynergyDef): string[] {
  const out: string[] = [];
  for (const [who, m] of Object.entries(s.mods)) {
    if (!m) continue;
    const lines = perkLines({ mods: m } as PerkDef).join(', ');
    out.push(`${who === 'all' ? t('syn.all') : roleName(who as Role)}: ${lines}`);
  }
  return out;
}

/** Upgrade level of a slot, e.g. "★ 2/5". */
export function levelLabel(slot: ArmySlot): string {
  return `★ ${slot.level}/${MAX_UNIT_LEVEL}`;
}

/**
 * Full-screen choice of one of three upgrades for a unit. `onPick` gets the upgrade id (null if no
 * upgrade is left in the pool, then the level still rises with base growth). `onCancel` adds a back button.
 */
export function openUpgradeChoice(scene: Phaser.Scene, slot: ArmySlot, onPick: (id: string | null) => void, onCancel?: () => void): Phaser.GameObjects.Container {
  const { width: w, height: h } = scene.scale;
  const d = unitDef(slot.unitId);
  const role = roleOf(d);
  const root = scene.add.container(0, 0).setDepth(8500);
  root.add(scene.add.rectangle(0, 0, w, h, 0x000000, 0.82).setOrigin(0).setInteractive());
  const next = slot.level + 1;
  root.add(scene.add.text(w / 2, 80, t('upg.title', { unit: t(`unit.${slot.unitId}`), n: next, max: MAX_UNIT_LEVEL }), titleStyle(46)).setOrigin(0.5));
  root.add(scene.add.text(w / 2, 140, t(next >= MAX_UNIT_LEVEL ? 'upg.subtitleCap' : 'upg.subtitle', { role: roleName(role) }),
    textStyle(26, ROLE_COLOR[role], true)).setOrigin(0.5));
  const had = (slot.ups ?? []).map((id) => upgradeById(id)).filter((u): u is UpgradeDef => !!u);
  if (had.length) {
    root.add(scene.add.text(w / 2, 182, t('upg.taken', { list: had.map((u) => upgradeName(u.id)).join(', ') }),
      { ...textStyle(21, '#d9c7a0'), align: 'center', wordWrap: { width: w - 300 } }).setOrigin(0.5, 0));
  }
  const close = () => root.destroy();
  const opts = upgradeOptions(slot);
  if (!opts.length) {
    root.add(scene.add.text(w / 2, h / 2, t('upg.none'), textStyle(28)).setOrigin(0.5));
    root.add(new Button(scene, w / 2, h / 2 + 120, t('common.continue'), { style: 'red', width: 360, fontSize: 26, onClick: () => { close(); onPick(null); } }));
    return root;
  }
  opts.forEach((u, i) => {
    const x = w / 2 + (i - (opts.length - 1) / 2) * 380;
    const lines = upgradeLines(u);
    root.add(card(scene, x, 560, {
      w: 330, h: 560, portrait: scene.textures.exists(`portrait_${slot.unitId}`) ? `portrait_${slot.unitId}` : undefined,
      title: upgradeName(u.id), subtitle: u.cap ? t('upg.master') : roleName(role), subtitleColor: u.cap ? '#ffb347' : ROLE_COLOR[role],
      lines, lineSize: lines.join(' ').length > 90 ? 18 : 21, highlight: !!u.cap,
      onClick: () => { playSfx(scene, 'ui_talent_pick'); close(); onPick(u.id); },
    }));
  });
  // synergy hint: from level 3 a unit works together with units of other pools
  const active = armySynergies().map(synergyName);
  const hint = next === 3
    ? t('upg.synergyHint', { list: synergyPartners(role).filter((s) => s.id !== 'brothers').map((s) => `${synergyName(s)} (${s.roles.filter((x) => x !== role).map(roleName).join('')})`).join(', ') })
    : active.length ? t('upg.synergyActive', { list: active.join(', ') }) : '';
  if (hint) root.add(scene.add.text(w / 2, h - 175, hint, { ...textStyle(21, '#9fd0ff'), align: 'center', wordWrap: { width: w - 360 } }).setOrigin(0.5));
  if (onCancel) root.add(new Button(scene, w / 2, h - 80, t('common.back'), { width: 320, fontSize: 26, onClick: () => { close(); onCancel(); } }));
  return root;
}
