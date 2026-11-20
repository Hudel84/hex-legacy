import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR, FONT_BODY } from '../core/theme';
import { ABILITIES } from '../battle/engine';
import type { UnitDef, Status } from '../battle/types';
import { panel, titleStyle, textStyle } from './widgets';
import { playSfx } from '../core/audio';

export const ABILITY_ICON: Record<string, string> = {
  spearWall: 'icon_spell_thorn_armor', aimedShot: 'icon_spell_battle_focus', shieldFormation: 'icon_spell_holy_armor',
  revival: 'icon_spell_resurrection', dive: 'icon_spell_haste', holyStrike: 'icon_spell_smite', boneSwarm: 'icon_spell_raise_dead',
  rotStench: 'icon_spell_plague', disembody: 'icon_spell_mind_shield', bloodFrenzy: 'icon_spell_vampiric_touch',
  deathWave: 'icon_spell_death_cloud', decayBreath: 'icon_spell_wither',
  mark: 'icon_spell_clairvoyance', doubleShot: 'icon_talent_triple_shot', entangle: 'icon_spell_entangling_roots',
  sporeCloud: 'icon_spell_poison_spores', lightLance: 'icon_spell_sun_beam', rootStrike: 'icon_spell_wild_growth',
  burrow: 'icon_spell_tremor', quakeStrike: 'icon_spell_earthquake', explosiveBolt: 'icon_talent_explosive_bolts',
  ironStance: 'icon_spell_stone_wall', overpressure: 'icon_talent_eruption', finalStand: 'icon_talent_berserker_axe',
  warcry: 'icon_talent_lion_roar', axeVolley: 'icon_talent_returning_axe', hunt: 'icon_talent_wolf_pack',
  bloodSacrifice: 'icon_spell_blood_sacrifice', smash: 'icon_talent_iron_fist', rampage: 'icon_talent_whirlwind',
  fireSpark: 'icon_spell_static_spark', howl: 'icon_spell_fear', seduce: 'icon_spell_confusion', hellPortal: 'icon_spell_teleport',
  infernoBlast: 'icon_spell_inferno', worldfire: 'icon_spell_meteor',
};
const abilityPath = (k: string): string => (k.startsWith('icon_talent_') ? `icons/talents/${k}` : `icons/spells/${k}`);
export const STATUS_ICON: Record<string, string> = {
  poison: 'vfx_status_poisoned', atkDown: 'vfx_status_cursed', defDown: 'icon_spell_wither', shield: 'vfx_status_defense_buff',
  spearwall: 'vfx_status_rune_buff', disembodied: 'vfx_status_incorporeal',
  bless: 'vfx_status_blessed', ward: 'icon_spell_divine_shield', haste: 'vfx_status_haste', slow: 'vfx_status_frozen',
  focus: 'icon_spell_battle_focus', confused: 'vfx_status_charmed', fear: 'vfx_status_feared', root: 'vfx_status_rooted',
  regrowth: 'vfx_status_regenerating', thornskin: 'icon_spell_thorn_armor', burn: 'vfx_status_burning', frenzy: 'vfx_status_enraged',
  fury: 'icon_stat_rage', marked: 'icon_spell_clairvoyance', stun: 'vfx_status_stunned',
};
/** Where a status icon lives: status effects in vfx/status, the rest are spell or stat icons. */
const statusPath = (k: string): string =>
  k.startsWith('vfx_status_') ? `vfx/status/${k}` : k.startsWith('icon_stat_') ? `icons/stats/${k}` : `icons/spells/${k}`;

/** Queue the icons the info panel and battle HUD need. */
export function loadAbilityIcons(scene: Phaser.Scene): void {
  for (const k of Object.values(ABILITY_ICON)) if (!scene.textures.exists(k)) scene.load.image(k, `assets/${abilityPath(k)}.webp`);
  for (const k of Object.values(STATUS_ICON)) if (!scene.textures.exists(k)) scene.load.image(k, `assets/${statusPath(k)}.webp`);
}

/** The people passive of a unit (every people has one, neutrals none). */
export const PEOPLES = ['human', 'elf', 'dwarf', 'undead', 'orc', 'demon'];
export const racePassive = (d: UnitDef): string | null => (PEOPLES.includes(d.faction) ? d.faction : null);

export interface UnitInfoData {
  def: UnitDef;
  count?: number;
  topHp?: number;
  atkBonus?: number;    // hero bonus etc. (shown as +n)
  defBonus?: number;
  shots?: number;
  cooldown?: number;
  statuses?: Status[];
  level?: number;
  enemy?: boolean;
  portraitKey?: string;
}

/** Modal info card about a unit type / stack. Closes on any click or ESC. */
export function showUnitInfo(scene: Phaser.Scene, o: UnitInfoData): Phaser.GameObjects.Container {
  const { width: w, height: h } = scene.scale;
  const d = o.def;
  const root = scene.add.container(0, 0).setDepth(9000).setScrollFactor(0);
  const dim = scene.add.rectangle(0, 0, w, h, 0x000000, 0.55).setOrigin(0).setInteractive();
  root.add(dim);
  const PW = 900, PH = 760;
  const px = w / 2 - PW / 2, py = h / 2 - PH / 2;
  root.add(panel(scene, w / 2, h / 2, PW, PH, 'ui_panel_dark_wood', 70));

  // portrait
  const pk = o.portraitKey ?? `portrait_${d.id}`;
  if (scene.textures.exists(pk)) {
    const p = scene.add.image(px + 165, py + 175, pk); p.setDisplaySize(220, 220);
    if (o.enemy) p.setFlipX(true);
    const fr = scene.add.graphics();
    fr.lineStyle(5, o.enemy ? 0xd84a3a : 0xf3d48a, 1).strokeRoundedRect(px + 55, py + 65, 220, 220, 14);
    root.add([p, fr]);
  }
  const name = t(`unit.${d.id}`) + (o.count !== undefined ? `  ×${o.count}` : '');
  root.add(scene.add.text(px + 310, py + 70, name, titleStyle(38)));
  const stars = o.level ? '  ' + '★'.repeat(o.level) : '';
  root.add(scene.add.text(px + 312, py + 122, t('reward.tierCost', { tier: d.tier, cost: d.cost }) + stars, textStyle(22, '#d9c7a0')));

  // stats with icons
  const stats: [string, string][] = [
    ['icon_hp', o.topHp !== undefined ? `${o.topHp} / ${d.hp}` : `${d.hp}`],
    ['icon_atk', `${d.atk}${o.atkBonus ? (o.atkBonus > 0 ? ` +${o.atkBonus}` : ` ${o.atkBonus}`) : ''}`],
    ['icon_def', `${d.def}${o.defBonus ? (o.defBonus > 0 ? ` +${o.defBonus}` : ` ${o.defBonus}`) : ''}`],
    ['icon_dmg', `${d.dmg[0]}–${d.dmg[1]}`],
    ['icon_ini', `${d.ini}`],
    ['icon_spd', `${d.speed}${d.flying ? ' ✈' : ''}`],
  ];
  const labels = ['stat.hp', 'stat.atk', 'stat.def', 'stat.dmg', 'stat.ini', 'stat.spd'];
  stats.forEach(([icon, val], i) => {
    const x = px + 312 + (i % 3) * 190, y = py + 185 + Math.floor(i / 3) * 62;
    if (scene.textures.exists(icon)) { const ic = scene.add.image(x + 18, y, icon); ic.setScale(40 / Math.max(ic.width, ic.height)); root.add(ic); }
    root.add(scene.add.text(x + 46, y - 14, t(labels[i]), textStyle(15, '#c9b896')));
    root.add(scene.add.text(x + 46, y + 2, val, textStyle(22, COLOR.light, true)));
  });

  // passives
  let y = py + 330;
  const passives: string[] = [];
  const race = racePassive(d);
  if (race) passives.push(`race:${race}`);
  if (d.ranged) passives.push('ranged');
  if (d.flying) passives.push('flying');
  if (d.mounted) passives.push('mounted');
  passives.push(...(d.passives ?? []));
  const section = (title: string) => {
    root.add(scene.add.text(px + 60, y, title, titleStyle(24)));
    y += 40;
  };
  if (passives.length) {
    section(t('info.passives'));
    for (const p of passives) {
      const isRace = p.startsWith('race:');
      const rk = p.slice(5);
      const desc = isRace ? t(`race.${rk}.desc`) : p === 'ranged' ? `${o.shots ?? d.ranged ?? 0} ${t('info.shots')}` : t(`passive.${p}`);
      const label = isRace ? t(`race.${rk}.name`) : p === 'ranged' ? t('passiveName.ranged') : p === 'flying' ? t('passiveName.flying') : t(`passiveName.${p}`);
      const tx = scene.add.text(px + 75, y, `• ${label}: `, { fontFamily: FONT_BODY, fontSize: '22px', fontStyle: '700', color: isRace ? '#9fe0ff' : COLOR.gold });
      const dx = scene.add.text(tx.x + tx.width, y, p === 'flying' ? '' : desc, { fontFamily: FONT_BODY, fontSize: '22px', color: '#efe3c8', wordWrap: { width: PW - 160 - tx.width } });
      root.add([tx, dx]);
      y += Math.max(30, dx.height + 4);
    }
    y += 10;
  }
  // active
  if (d.active && ABILITIES[d.active]) {
    section(t('info.active'));
    const ab = ABILITIES[d.active];
    const ik = ABILITY_ICON[ab.id];
    if (ik && scene.textures.exists(ik)) { const ic = scene.add.image(px + 105, y + 34, ik); ic.setScale(64 / ic.width); root.add(ic); }
    root.add(scene.add.text(px + 150, y, t(`ability.${ab.id}.name`), { fontFamily: FONT_BODY, fontSize: '24px', fontStyle: '700', color: '#c9a8ff' }));
    const ready = o.cooldown === undefined ? t('info.cooldown', { n: ab.cooldown >= 99 ? '∞' : ab.cooldown })
      : o.cooldown > 0 ? t('info.readyIn', { n: o.cooldown }) : t('info.ready');
    root.add(scene.add.text(px + PW - 70, y + 2, ready, textStyle(19, o.cooldown ? '#f0a090' : '#9fe39f')).setOrigin(1, 0));
    const ad = scene.add.text(px + 150, y + 32, t(`ability.${ab.id}.desc`), { fontFamily: FONT_BODY, fontSize: '21px', color: '#efe3c8', wordWrap: { width: PW - 220 } });
    root.add(ad);
    y += Math.max(80, ad.height + 44);
  }
  // statuses
  if (o.statuses?.length) {
    section(t('info.statuses'));
    for (const st of o.statuses) {
      const ik = STATUS_ICON[st.id];
      if (ik && scene.textures.exists(ik)) { const ic = scene.add.image(px + 92, y + 13, ik); ic.setScale(30 / ic.width); root.add(ic); }
      root.add(scene.add.text(px + 115, y, `${t(`status.${st.id}`, { n: st.value })}${st.turns < 50 ? ` (${st.turns})` : ''}`, textStyle(21)));
      y += 32;
    }
  }
  root.add(scene.add.text(w / 2, py + PH - 40, t('info.close'), textStyle(18, '#c9b896')).setOrigin(0.5));
  void ABILITIES;

  root.setScrollFactor(0, 0, true);
  root.setAlpha(0);
  scene.tweens.add({ targets: root, alpha: 1, duration: 120 });
  playSfx(scene, 'ui_open', 0.6);
  const close = () => { if (!root.active) return; scene.input.keyboard?.off('keydown-ESC', close); root.destroy(); };
  dim.on('pointerup', close);
  scene.input.keyboard?.once('keydown-ESC', close);
  return root;
}
