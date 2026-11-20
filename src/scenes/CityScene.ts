import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR, FONT_BODY } from '../core/theme';
import { playMusic, playSfx } from '../core/audio';
import { img, sfx, loadRunUi } from '../core/assets';
import {
  BUILDINGS, LOCKED_DISTRICTS, RES, getMeta, level, maxLevel, nextCost, canAfford, build, blockedByTownHall,
  type BuildingDef, type Res,
} from '../meta/meta';
import { panel, titleStyle, textStyle, resRow, shade } from '../ui/widgets';
import { Button, toast } from '../ui/Button';

/** The city: spend meta resources on permanent buildings between runs. */
export class CityScene extends Phaser.Scene {
  private layer!: Phaser.GameObjects.Container;
  private resBar!: Phaser.GameObjects.Container;
  private detail: Phaser.GameObjects.Container | null = null;

  constructor() { super('City'); }

  preload(): void {
    loadRunUi(this);
    img(this, 'city_overview', 'city/city_overview.webp');
    for (const b of BUILDINGS) img(this, b.icon, `icons/buildings/${b.icon}.webp`);
    sfx(this, 'mus_city', 'audio/music/mus_city.ogg');
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.detail = null;
    this.add.image(w / 2, h / 2, 'city_overview').setDisplaySize(w, h);
    shade(this, 0, 0, w, 180, 0.75, 0);
    this.add.text(w / 2, 50, t('city.title'), titleStyle(54)).setOrigin(0.5);
    this.resBar = this.add.container(0, 0);
    this.layer = this.add.container(0, 0);
    this.drawRes();
    this.drawBuildings();
    const m = getMeta();
    const st = this.add.text(40, h - 40, t('city.stats', { runs: m.runs, wins: m.wins, floor: m.bestFloor }), textStyle(24, '#f3e6c8', true)).setOrigin(0, 1);
    const sb = this.add.graphics();
    sb.fillStyle(0x000000, 0.6).fillRoundedRect(st.x - 16, st.y - st.height - 10, st.width + 32, st.height + 20, 12);
    st.setDepth(1);
    new Button(this, w - 190, h - 70, t('battle.toTitle'), { width: 320, fontSize: 26, onClick: () => this.scene.start('Title') });
    new Button(this, w - 190, h - 200, t('title.newRun'), { style: 'red', width: 320, fontSize: 26, onClick: () => this.scene.start('HeroSelect') });
    playMusic(this, 'mus_city');
    if (!m.runs) toast(this, t('city.firstVisit'));
  }

  private drawRes(): void {
    const { width: w } = this.scale;
    this.resBar.removeAll(true);
    const m = getMeta();
    const bg = this.add.graphics();
    const row = resRow(this, w / 2, 121, m.res, 26, '', true);
    const bw = Math.max(1040, row.getBounds().width + 60);
    bg.fillStyle(0x000000, 0.55).fillRoundedRect(w / 2 - bw / 2, 92, bw, 58, 14);
    this.resBar.add([bg, row]);
  }

  private drawBuildings(): void {
    this.layer.removeAll(true);
    for (const b of BUILDINGS) this.layer.add(this.hotspot(b));
    for (const d of LOCKED_DISTRICTS) {
      const c = this.add.container(d.x, d.y);
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.6).fillCircle(0, 0, 40);
      const lock = this.add.image(0, -2, 'ui_icon_lock'); lock.setScale(46 / lock.width);
      const label = this.add.text(0, 52, t(`city.district.${d.id}`), { ...textStyle(20, '#d8ccb0', true), align: 'center' }).setOrigin(0.5, 0);
      c.add([g, lock, label]);
      c.setSize(90, 90).setInteractive({ useHandCursor: true });
      c.on('pointerup', () => toast(this, t('city.districtLocked')));
      this.layer.add(c);
    }
  }

  private hotspot(b: BuildingDef): Phaser.GameObjects.Container {
    const lv = level(b.id), max = maxLevel(b.id);
    const cost = nextCost(b.id);
    const ready = !!cost && canAfford(cost) && !blockedByTownHall(b.id);
    const c = this.add.container(b.x, b.y);
    const ring = this.add.graphics();
    ring.fillStyle(lv ? 0x1b120b : 0x000000, lv ? 0.85 : 0.6).fillCircle(0, 0, 46);
    ring.lineStyle(4, ready ? 0x9fe39f : lv ? 0xf3d48a : 0x8a7a60, 1).strokeCircle(0, 0, 46);
    const ic = this.add.image(0, 0, b.icon); ic.setScale(76 / ic.width);
    if (!lv) ic.setAlpha(0.6);
    const pips = this.add.graphics();
    for (let i = 0; i < max; i++) {
      pips.fillStyle(i < lv ? 0xf3d48a : 0x3b2f22, 1).fillCircle((i - (max - 1) / 2) * 14, 56, 5);
      pips.lineStyle(1, 0x000000, 1).strokeCircle((i - (max - 1) / 2) * 14, 56, 5);
    }
    const label = this.add.text(0, 68, t(`building.${b.id}.name`), { ...textStyle(20, '#ffffff', true), align: 'center' }).setOrigin(0.5, 0);
    c.add([ring, ic, pips, label]);
    if (ready) {
      const up = this.add.text(32, -40, '▲', { fontFamily: FONT_BODY, fontSize: '26px', color: '#9fe39f', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5);
      c.add(up);
      this.tweens.add({ targets: up, y: -46, duration: 600, yoyo: true, repeat: -1 });
    }
    c.setSize(110, 110).setInteractive({ useHandCursor: true });
    c.on('pointerover', () => { c.setScale(1.08); playSfx(this, 'ui_hover'); });
    c.on('pointerout', () => c.setScale(1));
    c.on('pointerup', () => { playSfx(this, 'ui_click'); this.openDetail(b); });
    return c;
  }

  private openDetail(b: BuildingDef): void {
    this.detail?.destroy();
    const { width: w, height: h } = this.scale;
    const root = this.add.container(0, 0).setDepth(100);
    this.detail = root;
    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.5).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closeDetail());
    root.add(dim);
    const PW = 820, PH = 640;
    const blocker = this.add.zone(w / 2, h / 2, PW, PH).setInteractive();
    root.add(blocker);
    root.add(panel(this, w / 2, h / 2, PW, PH, 'ui_panel_parchment', 60));
    const x0 = w / 2 - PW / 2 + 70, y0 = h / 2 - PH / 2;
    const lv = level(b.id), max = maxLevel(b.id);
    const ic = this.add.image(x0 + 70, y0 + 120, b.icon); ic.setScale(130 / ic.width);
    root.add(ic);
    root.add(this.add.text(x0 + 160, y0 + 70, t(`building.${b.id}.name`), { ...titleStyle(40, '#4a2c10'), stroke: '#00000000', strokeThickness: 0 }));
    root.add(this.add.text(x0 + 162, y0 + 125, t('city.level', { n: lv, max }), { fontFamily: FONT_BODY, fontSize: '26px', fontStyle: '700', color: '#6b4a24' }));
    const ink = { fontFamily: FONT_BODY, fontSize: '25px', color: '#2b1a0c', wordWrap: { width: PW - 140 } };
    let y = y0 + 210;
    const desc = this.add.text(x0, y, t(`building.${b.id}.desc`), ink);
    root.add(desc);
    y += desc.height + 22;
    // per-level effects
    for (let i = 1; i <= max; i++) {
      const done = i <= lv;
      const line = this.add.text(x0 + 10, y, `${done ? '✔' : i === lv + 1 ? '➜' : '•'} ${t('city.levelShort', { n: i })}: ${t(`building.${b.id}.l${i}`)}`, {
        fontFamily: FONT_BODY, fontSize: '23px', fontStyle: i === lv + 1 ? '700' : '400',
        color: done ? '#3d6b2a' : i === lv + 1 ? '#2b1a0c' : '#7a6a55', wordWrap: { width: PW - 160 },
      });
      root.add(line);
      y += line.height + 6;
    }
    const cost = nextCost(b.id);
    const yb = y0 + PH - 95;
    if (!cost) {
      root.add(this.add.text(w / 2, yb, t('city.maxed'), { fontFamily: FONT_BODY, fontSize: '28px', fontStyle: '700', color: '#3d6b2a' }).setOrigin(0.5));
    } else {
      const m = getMeta();
      // cost line: red where we lack resources
      const cx = this.add.container(w / 2 - 170, yb - 65);
      let xx = 0;
      for (const r of RES) {
        const need = cost[r as Res];
        if (!need) continue;
        const have = m.res[r];
        const i2 = this.add.image(xx, 0, `res_${r}`); i2.setScale(38 / Math.max(i2.width, i2.height));
        const tx = this.add.text(xx + 26, 0, String(need), { fontFamily: FONT_BODY, fontSize: '27px', fontStyle: '700', color: have >= need ? '#2b1a0c' : '#b0281a' }).setOrigin(0, 0.5);
        cx.add([i2, tx]);
        xx += 26 + tx.width + 30;
      }
      cx.x = w / 2 - (xx - 30) / 2 + 10;
      root.add(cx);
      const blocked = blockedByTownHall(b.id);
      const ok = canAfford(cost) && !blocked;
      const btn = new Button(this, w / 2, yb + 15, t(lv ? 'city.upgrade' : 'city.build'), {
        style: 'red', width: 320, fontSize: 28,
        onClick: () => {
          if (build(b.id)) {
            playSfx(this, 'ui_levelup');
            this.closeDetail(); this.drawRes(); this.drawBuildings();
            toast(this, t('city.built', { name: t(`building.${b.id}.name`), n: level(b.id) }));
          } else playSfx(this, 'ui_error');
        },
      });
      btn.setEnabled(ok);
      root.add(btn);
      if (blocked) root.add(this.add.text(w / 2, yb - 25, t('city.needTownHall'), { fontFamily: FONT_BODY, fontSize: '21px', color: '#b0281a' }).setOrigin(0.5));
    }
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 140 });
    playSfx(this, 'ui_open', 0.6);
    void COLOR;
  }

  private closeDetail(): void {
    this.detail?.destroy();
    this.detail = null;
  }
}
