import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { run, count, freeLeadership, shiftAlloc, save, xpForLevel, unitDef } from '../run/state';
import { heroById } from '../run/heroes';
import { loadHeroPortrait, loadPortrait } from '../core/assets';
import { panel, textStyle, titleStyle, stat, iconButton } from './widgets';
import { playSfx } from '../core/audio';

/** Left-side panel: hero, resources and army with leadership distribution. Fixed to the screen. */
export class ArmyPanel extends Phaser.GameObjects.Container {
  private content!: Phaser.GameObjects.Container;
  constructor(scene: Phaser.Scene, x: number, y: number, private editable = true) {
    super(scene, x, y);
    scene.add.existing(this);
    this.setScrollFactor(0);
    this.add(panel(scene, 0, 0, 400, 1040).setOrigin(0));
    this.content = scene.add.container(0, 0);
    this.add(this.content);
    this.refresh();
  }

  /** Make sure portraits are queued (call in preload). */
  static preload(scene: Phaser.Scene): void {
    const r = run();
    loadHeroPortrait(scene, r.heroId);
    for (const s of r.army) loadPortrait(scene, s.unitId);
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
    }
    c.add(sc.add.text(200, 250, t(`hero.${hero.id}`), { ...titleStyle(26), align: 'center' }).setOrigin(0.5, 0));
    c.add(sc.add.text(200, 286, t('run.level', { n: r.level }), textStyle(22, '#e8dcc0')).setOrigin(0.5, 0));
    // xp bar
    const need = xpForLevel(r.level);
    const bar = sc.add.graphics();
    bar.fillStyle(0x000000, 0.6).fillRoundedRect(70, 322, 260, 14, 6);
    bar.fillStyle(0x7ec8ff, 1).fillRoundedRect(72, 324, Math.max(4, 256 * Math.min(1, r.xp / need)), 10, 5);
    c.add(bar);
    c.add(sc.add.text(200, 342, `${r.xp} / ${need} XP`, textStyle(17, '#bcd8f0')).setOrigin(0.5, 0));

    c.add(stat(sc, 60, 400, 'icon_gold', String(r.gold)));
    c.add(stat(sc, 215, 400, 'icon_lead', String(r.leadership)));
    c.add(stat(sc, 60, 450, 'icon_atk', String(r.atk)));
    c.add(stat(sc, 215, 450, 'icon_def', String(r.def)));

    c.add(sc.add.text(200, 500, t('run.army'), titleStyle(24)).setOrigin(0.5, 0));
    r.army.forEach((s, i) => {
      const y = 580 + i * 125;
      const d = unitDef(s.unitId);
      const g = sc.add.graphics();
      g.fillStyle(0x000000, 0.35).fillRoundedRect(28, y - 52, 344, 108, 12);
      c.add(g);
      const pk2 = `portrait_${s.unitId}`;
      if (sc.textures.exists(pk2)) { const p = sc.add.image(80, y, pk2); p.setDisplaySize(88, 88); c.add(p); }
      c.add(sc.add.text(134, y - 40, t(`unit.${s.unitId}`), textStyle(21, COLOR.gold, true)));
      c.add(sc.add.text(134, y - 12, `×${count(s)}   ${'★'.repeat(s.level)}${'☆'.repeat(2 - s.level)}`, textStyle(24, '#ffffff', true)));
      c.add(sc.add.text(134, y + 18, t('run.costEach', { n: d.cost }), textStyle(16, '#c9b896')));
      if (this.editable && r.army.length > 1) {
        c.add(iconButton(sc, 300, y + 22, 'ui_button_minus', 40, () => { if (shiftAlloc(i, -1)) this.changed(); else playSfx(sc, 'ui_error'); }));
        c.add(iconButton(sc, 346, y + 22, 'ui_button_plus', 40, () => { if (shiftAlloc(i, 1)) this.changed(); else playSfx(sc, 'ui_error'); }));
      }
    });
    const free = freeLeadership();
    if (free > 0) c.add(sc.add.text(200, 580 + r.army.length * 125 - 40, t('run.freeLead', { n: free }), textStyle(19, '#9fe39f')).setOrigin(0.5, 0));
    if (this.editable && r.army.length > 1) {
      c.add(sc.add.text(200, 980, t('run.armyHint'), { ...textStyle(16, '#c9b896'), align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5, 0.5));
    }
  }

  private changed(): void {
    save();
    this.refresh();
  }
}
