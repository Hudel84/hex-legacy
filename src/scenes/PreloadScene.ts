import Phaser from 'phaser';
import { FONT_TITLE, COLOR } from '../core/theme';
import { audioUrls } from '../core/assets';

const A = 'assets/';

/** Loads everything the title screen needs and shows a progress bar. */
export class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }

  preload(): void {
    const { width: w, height: h } = this.scale;
    this.add.text(w / 2, h / 2 - 60, 'HEX LEGACY', {
      fontFamily: FONT_TITLE, fontSize: '64px', fontStyle: '900', color: COLOR.gold,
    }).setOrigin(0.5);
    const barBg = this.add.rectangle(w / 2, h / 2 + 30, 600, 14, 0x2a1d12).setStrokeStyle(2, 0x8a6a2b);
    const bar = this.add.rectangle(barBg.x - 298, barBg.y, 0, 10, 0xf3d48a).setOrigin(0, 0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => { bar.width = 596 * p; });

    // title
    this.load.image('title_keyart', `${A}ui/screens/ui_title_keyart.webp`);
    this.load.video('title_loop', `${A}ui/animated/ui_title_keyart_loop.mp4`, true);
    this.load.image('logo', `${A}logo/logo_hex_legacy.webp`);

    // ui kit
    for (const style of ['wood', 'red']) {
      for (const state of ['normal', 'hover', 'pressed', 'disabled']) {
        const k = `ui_button_wide_${style}_${state}`;
        this.load.image(k, `${A}ui/${k}.webp`);
      }
    }
    for (const k of ['ui_window_panel', 'ui_panel_parchment', 'ui_panel_dark_wood', 'ui_button_close',
      'ui_button_minus', 'ui_button_plus', 'ui_divider_gold', 'ui_radio_empty', 'ui_radio_selected',
      'ui_checkbox_empty', 'ui_checkbox_checked', 'ui_bar_mana_frame', 'ui_button_settings']) {
      this.load.image(k, `${A}ui/${k}.webp`);
    }

    // audio
    this.load.audio('mus_main_menu', audioUrls('audio/music/mus_main_menu.ogg'));
    for (const k of ['ui_click', 'ui_hover', 'ui_open', 'ui_close']) {
      this.load.audio(k, audioUrls(`audio/sfx/${k}.ogg`));
    }
  }

  create(): void {
    this.scene.start('Title');
  }
}
