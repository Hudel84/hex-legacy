// Between acts: announces the next act and its biome. After act 3 it leads into the final battle.
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playMusic, playSfx, playStinger, mapMusic } from '../core/audio';
import { img, sfx, loadRunUi } from '../core/assets';
import { run, save } from '../run/state';
import { finalConfig } from '../run/encounters';
import { ADVMAP } from './MapScene';
import { titleStyle, textStyle, shade } from '../ui/widgets';
import { Button } from '../ui/Button';

export class ActScene extends Phaser.Scene {
  private final = false;
  constructor() { super('Act'); }

  init(data: { final?: boolean }): void { this.final = !!data?.final; }

  preload(): void {
    loadRunUi(this);
    const r = run();
    if (this.final) img(this, 'boss_final_void_god_still', 'bosses/boss_final_void_god.webp');
    else img(this, ADVMAP[r.biome], `map/biomes/${ADVMAP[r.biome]}.webp`);
    img(this, 'ui_victory_screen', 'ui/screens/ui_victory_screen.webp');
    const mus = this.final ? 'mus_battle_final' : mapMusic(r.act);
    sfx(this, mus, `audio/music/${mus}.ogg`);
    sfx(this, 'stinger_act_clear', 'audio/music/stinger_act_clear.ogg');
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    this.add.rectangle(0, 0, w, h, 0x07050a).setOrigin(0);
    if (this.final) {
      const b = this.add.image(w / 2, h / 2 + 60, 'boss_final_void_god_still');
      b.setScale(Math.min(1, 900 / b.height)).setAlpha(0);
      this.tweens.add({ targets: b, alpha: 0.9, duration: 1600 });
    } else {
      const m = this.add.image(w / 2, h / 2, ADVMAP[r.biome]);
      m.setScale(w / m.width).setAlpha(0);
      this.tweens.add({ targets: m, alpha: 0.55, duration: 1200 });
    }
    shade(this, 0, 0, w, 420, 0.85, 0);
    shade(this, 0, h - 320, w, 320, 0, 0.85);
    const title = this.final ? t('act.finalTitle') : t('run.act', { n: r.act });
    const sub = this.final ? t('act.finalSub') : t(`biome.${r.biome}`);
    const text = this.final ? t('act.finalText') : t(`act.text${r.act}`);
    const tt = this.add.text(w / 2, 150, title, titleStyle(96)).setOrigin(0.5).setAlpha(0);
    const st = this.add.text(w / 2, 245, sub, textStyle(40, '#e8dcc0', true)).setOrigin(0.5).setAlpha(0);
    const bt = this.add.text(w / 2, h - 250, text, { ...textStyle(28, '#f3e6c8'), align: 'center', wordWrap: { width: 1300 } }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: [tt, st], alpha: 1, duration: 900, delay: 300 });
    this.tweens.add({ targets: bt, alpha: 1, duration: 900, delay: 1000 });
    const go = new Button(this, w / 2, h - 110, t(this.final ? 'act.toFinal' : 'act.continue'), {
      style: 'red', width: 420, fontSize: 30,
      onClick: () => {
        save();
        if (this.final) this.scene.start('Battle', { config: finalConfig() });
        else this.scene.start('Map');
      },
    });
    go.setAlpha(0);
    this.tweens.add({ targets: go, alpha: 1, duration: 600, delay: 1500 });
    playSfx(this, 'ui_reward');
    playStinger(this, 'stinger_act_clear');
    this.time.delayedCall(6500, () => playMusic(this, this.final ? 'mus_battle_final' : mapMusic(r.act), 2000));
  }
}
