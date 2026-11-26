import Phaser from 'phaser';
import { levelLabel, roleName, ROLE_COLOR, synergyName, synergyLines } from './upgradeUi';
import { roleOf } from '../run/upgrades';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { run, count, xpForLevel, unitDef, heroTotals } from '../run/state';
import { heroById } from '../run/heroes';
import { loadHeroPortrait, loadPortrait } from '../core/assets';
import { panel, textStyle, titleStyle, stat, fitWidth } from './widgets';
import { showUnitInfo, loadAbilityIcons } from './UnitInfo';
import { upgradedDef, armySynergies, playerMods } from '../run/state';
import { BASE_CRIT, BASE_CRIT_DMG, BASE_MORALE } from '../battle/mods';
import { unitMods } from '../battle/passives';
import { loadSpellIcons } from './spellUi';
import { tooltip } from './perkUi';
import { maxMana } from '../battle/spells';
import { openHero } from '../scenes/HeroScene';
import { iconButton } from './widgets';

/** Left-side panel: hero, resources and army with leadership distribution. Fixed to the screen. */
export class ArmyPanel extends Phaser.GameObjects.Container {
  private content!: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, x: number, y: number, private editable = true) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.add(panel(scene, 200, 520, 400, 1040));
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    this.refresh();
    // hero screen (equipment): button, portrait click or key I
    const onClosed = () => { if (this.active) this.refresh(); };
    const onKey = () => openHero(scene);
    scene.events.on('hero-closed', onClosed);
    scene.input.keyboard?.on('keydown-I', onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off('hero-closed', onClosed);
      scene.input.keyboard?.off('keydown-I', onKey);
    });
  }

  /** Make sure portraits are queued (call in preload). */
  static preload(scene: Phaser.Scene): void {
    const r = run();
    loadHeroPortrait(scene, r.heroId);
    for (const s of r.army) loadPortrait(scene, s.unitId);
    loadAbilityIcons(scene);
    loadSpellIcons(scene, (r.spells ?? []).map((x) => x.id));
    if (!scene.textures.exists('ui_button_round_wood_normal')) scene.load.image('ui_button_round_wood_normal', 'assets/ui/ui_button_round_wood_normal.webp');
    if (!scene.textures.exists('item_chest_steel_breastplate')) scene.load.image('item_chest_steel_breastplate', 'assets/icons/equipment/icon_equip_chest_steel_breastplate.webp');
  }

  refresh(): void {
    const sc = this.scene;
    const r = run();
    this.content.removeAll(true);
    const c = this.content;
    const hero = heroById(r.heroId);
    const pk = `heroportrait_${hero.id}`;
    if (sc.textures.exists(pk)) {
      const p = sc.add.image(200, 140, pk); p.setScale(170 / p.width);
      const fr = sc.add.image(200, 140, 'ui_frame_portrait_round'); fr.setScale(200 / fr.width);
      c.add([p, fr]);
      p.setInteractive({ useHandCursor: true }).on('pointerup', () => openHero(sc));
    }
    if (sc.textures.exists('ui_button_round_wood_normal')) {
      const b = iconButton(sc, 330, 72, 'ui_button_round_wood_normal', 84, () => openHero(sc));
      const ik = 'item_chest_steel_breastplate';
      const ic = sc.textures.exists(ik) ? sc.add.image(330, 70, ik) : null;
      ic?.setScale(50 / Math.max(ic.width, ic.height));
      tooltip(sc, b, t('hero.open'), [t('hero.openHint')]);
      c.add(b); if (ic) c.add(ic);
    }
    c.add(fitWidth(sc.add.text(200, 250, t(`hero.${hero.id}`), { ...titleStyle(26), align: 'center' }).setOrigin(0.5, 0), 330));
    c.add(sc.add.text(200, 286, t('run.level', { n: r.level }), textStyle(22, '#e8dcc0')).setOrigin(0.5, 0));
    // xp bar
    const need = xpForLevel(r.level);
    const bar = sc.add.graphics();
    bar.fillStyle(0x000000, 0.6).fillRoundedRect(70, 322, 260, 14, 6);
    bar.fillStyle(0x7ec8ff, 1).fillRoundedRect(72, 324, Math.max(4, 256 * Math.min(1, r.xp / need)), 10, 5);
    c.add(bar);
    c.add(sc.add.text(200, 342, `${r.xp} / ${need} XP`, textStyle(19, '#d6ecff')).setOrigin(0.5, 0));

    c.add(stat(sc, 60, 400, 'icon_gold', String(r.gold)));
    const tot = heroTotals(r);
    c.add(stat(sc, 215, 400, 'icon_lead', String(tot.lead)));
    c.add(stat(sc, 60, 450, 'icon_atk', String(tot.atk)));
    c.add(stat(sc, 215, 450, 'icon_def', String(tot.def)));
    if (sc.textures.exists('icon_power')) {
      const pw = stat(sc, 60, 500, 'icon_power', String(tot.power));
      const kn = stat(sc, 215, 500, 'icon_knowledge', String(tot.knowledge));
      for (const [o, k, line] of [[pw, 'stat.power', t('run.powerHint')], [kn, 'stat.knowledge', t('run.knowledgeHint', { n: maxMana(tot.knowledge) })]] as const) {
        const z = sc.add.zone(o.x + 60, o.y, 140, 44).setInteractive();
        tooltip(sc, z, t(k), [line]);
        c.add([o, z]);
      }
    }

    c.add(sc.add.text(200, 545, t('run.army'), titleStyle(24)).setOrigin(0.5, 0));
    r.army.forEach((s, i) => {
      const y = 625 + i * 125;
      const d = unitDef(s.unitId);
      const g = sc.add.graphics();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(28, y - 52, 344, 108, 12);
      c.add(g);
      // click the unit (not the +/- buttons) for details
      const hit = sc.add.zone(28 + 135, y, 270, 108).setOrigin(0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        const ud = upgradedDef(s);
        const m = unitMods(ud, playerMods());
        showUnitInfo(sc, {
          def: ud, count: count(s), level: s.level, atkBonus: tot.atk, defBonus: tot.def,
          crit: Math.min(0.65, BASE_CRIT + m.crit), critMult: BASE_CRIT_DMG + m.critDmg, morale: BASE_MORALE + m.morale,
        });
      });
      c.add(hit);
      const pk2 = `portrait_${s.unitId}`;
      if (sc.textures.exists(pk2)) { const p = sc.add.image(80, y, pk2); p.setDisplaySize(88, 88); c.add(p); }
      c.add(fitWidth(sc.add.text(134, y - 40, t(`unit.${s.unitId}`), textStyle(21, COLOR.gold, true)), 232));
      c.add(sc.add.text(134, y - 12, `×${count(s)}  ${levelLabel(s)}`, textStyle(22, '#ffffff', true)));
      const role = roleOf(d);
      c.add(sc.add.text(134, y + 20, `${roleName(role)} · ${t('run.costEach', { n: d.cost })}`, textStyle(17, ROLE_COLOR[role])));
    });
    const hy = 625 + r.army.length * 125 - 30;
    const syn = armySynergies(r);
    const hint = sc.add.text(200, hy, syn.length ? t('run.synergies', { list: syn.map(synergyName).join(', ') }) : t('run.armyHint'),
      { ...textStyle(19, syn.length ? '#9fd0ff' : '#f0e2c0', !!syn.length), align: 'center', wordWrap: { width: 330 } }).setOrigin(0.5, 0);
    const hb = sc.add.graphics();
    hb.fillStyle(0x000000, 0.45).fillRoundedRect(200 - 175, hy - 8, 350, hint.height + 16, 10);
    c.add([hb, hint]);
    if (syn.length) {
      const z = sc.add.zone(200, hy + hint.height / 2, 350, hint.height + 16).setInteractive();
      tooltip(sc, z, t('run.synergyTitle'), syn.flatMap((x) => [`${synergyName(x)}:`, ...synergyLines(x).map((l) => `  ${l}`)]));
      c.add(z);
    }
    this.setScrollFactor(0, 0, true);
    c.setScrollFactor(0, 0, true);
  }

}
