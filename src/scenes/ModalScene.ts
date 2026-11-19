import Phaser from 'phaser';
import { t, setLang } from '../core/i18n';
import { settings, saveSettings, type Lang } from '../core/settings';
import { FONT_TITLE, FONT_BODY, COLOR } from '../core/theme';
import { applyMusicVolume, playSfx } from '../core/audio';
import { Button } from '../ui/Button';

type Kind = 'settings' | 'credits';

/** Window overlay used for Settings and Credits. Runs on top of the calling scene. */
export class ModalScene extends Phaser.Scene {
  private kind: Kind = 'settings';
  private panel!: Phaser.GameObjects.Container;

  constructor() { super('Modal'); }

  init(data: { kind: Kind }): void { this.kind = data.kind; }

  create(): void {
    const { width: w, height: h } = this.scale;
    playSfx(this, 'ui_open');

    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.close());

    const win = this.add.image(0, 0, 'ui_window_panel');
    const PW = 1100;
    win.setScale(PW / win.width);
    const PH = win.displayHeight;
    win.setInteractive(); // swallow clicks on the window itself

    this.panel = this.add.container(w / 2, h / 2, [win]);

    const title = this.add.text(0, -PH / 2 + PH * 0.058, t(`${this.kind}.title`), {
      fontFamily: FONT_TITLE, fontSize: '34px', fontStyle: '700', color: '#4a2c10',
    }).setOrigin(0.5);
    this.panel.add(title);

    // the painted X in the top-right corner of the window
    const xHit = this.add.zone(PW / 2 - PW * 0.035, -PH / 2 + PH * 0.05, 70, 70).setInteractive({ useHandCursor: true });
    xHit.on('pointerup', () => this.close());
    this.panel.add(xHit);

    if (this.kind === 'credits') this.buildCredits(PH);
    else this.buildSettings();

    const closeBtn = new Button(this, 0, PH / 2 - 95, t('common.close'), { width: 300, fontSize: 28, onClick: () => this.close() });
    this.panel.add(closeBtn);

    this.panel.setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: this.panel, scale: 1, alpha: 1, duration: 180, ease: 'Back.out' });
    this.input.keyboard?.once('keydown-ESC', () => this.close());
  }

  private buildCredits(PH: number): void {
    const body = this.add.text(0, -PH / 2 + 150, t('credits.body'), {
      fontFamily: FONT_BODY, fontSize: '25px', color: COLOR.parchmentText, align: 'center', lineSpacing: 2,
    }).setOrigin(0.5, 0);
    this.panel.add(body);
  }

  private buildSettings(): void {
    const labelStyle = { fontFamily: FONT_TITLE, fontSize: '30px', fontStyle: '700', color: COLOR.parchmentText };
    const rows = [-170, -60, 50];
    const LX = -400;
    const CX = 120;

    // language
    this.panel.add(this.add.text(LX, rows[0], t('settings.language'), labelStyle).setOrigin(0, 0.5));
    const langs: { id: Lang; name: string }[] = [{ id: 'en', name: 'English' }, { id: 'de', name: 'Deutsch' }];
    const radios: Phaser.GameObjects.Image[] = [];
    langs.forEach((l, i) => {
      const x = CX - 110 + i * 240;
      const r = this.add.image(x, rows[0], settings.lang === l.id ? 'ui_radio_selected' : 'ui_radio_empty');
      r.setScale(48 / r.width);
      const tx = this.add.text(x + 34, rows[0], l.name, { ...labelStyle, fontFamily: FONT_BODY, fontStyle: '400' }).setOrigin(0, 0.5);
      const hit = this.add.zone(x + 60, rows[0], 200, 60).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        if (settings.lang === l.id) return;
        playSfx(this, 'ui_click');
        setLang(l.id);
        this.game.events.emit('lang-changed');
        this.scene.restart({ kind: this.kind });
      });
      radios.push(r);
      this.panel.add([r, tx, hit]);
    });

    // volumes
    this.volumeRow(rows[1], t('settings.music'), LX, CX, () => settings.musicVolume, (v) => {
      settings.musicVolume = v; applyMusicVolume();
    });
    this.volumeRow(rows[2], t('settings.sfx'), LX, CX, () => settings.sfxVolume, (v) => {
      settings.sfxVolume = v; playSfx(this, 'ui_click');
    });
  }

  private volumeRow(y: number, label: string, LX: number, CX: number, get: () => number, set: (v: number) => void): void {
    const labelStyle = { fontFamily: FONT_TITLE, fontSize: '30px', fontStyle: '700', color: COLOR.parchmentText };
    this.panel.add(this.add.text(LX, y, label, labelStyle).setOrigin(0, 0.5));
    const pips = this.add.graphics();
    const draw = () => {
      pips.clear();
      const n = Math.round(get() * 10);
      for (let i = 0; i < 10; i++) {
        pips.fillStyle(i < n ? 0xb8862c : 0x8c7a5e, i < n ? 1 : 0.35);
        pips.fillRoundedRect(CX - 150 + i * 32, y - 16, 24, 32, 5);
      }
    };
    draw();
    const step = (d: number) => {
      const v = Phaser.Math.Clamp(Math.round(get() * 10) + d, 0, 10) / 10;
      set(v); saveSettings(); draw();
    };
    const minus = this.add.image(CX - 200, y, 'ui_button_minus').setInteractive({ useHandCursor: true });
    minus.setScale(56 / minus.width);
    const plus = this.add.image(CX + 210, y, 'ui_button_plus').setInteractive({ useHandCursor: true });
    plus.setScale(56 / plus.width);
    minus.on('pointerup', () => step(-1));
    plus.on('pointerup', () => step(1));
    this.panel.add([pips, minus, plus]);
  }

  private close(): void {
    playSfx(this, 'ui_close');
    this.tweens.add({
      targets: this.panel, scale: 0.92, alpha: 0, duration: 120,
      onComplete: () => this.scene.stop(),
    });
  }
}
