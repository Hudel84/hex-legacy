import Phaser from 'phaser';
import { t } from '../core/i18n';
import { FONT_BODY, COLOR, VERSION } from '../core/theme';
import { playMusic } from '../core/audio';
import { Button, toast } from '../ui/Button';

export class TitleScene extends Phaser.Scene {
  private buttons: { btn: Button; key: string }[] = [];
  private versionText!: Phaser.GameObjects.Text;

  constructor() { super('Title'); }

  create(): void {
    const { width: w, height: h } = this.scale;

    // background: still image first, the looping video fades in on top once it plays
    this.add.image(w / 2, h / 2, 'title_keyart').setDisplaySize(w, h);
    const vid = this.add.video(w / 2, h / 2, 'title_loop').setAlpha(0);
    vid.setLoop(true);
    vid.setMute(true);
    vid.play(true);
    // fade the video in once real frames arrive (the still image stays as fallback)
    const poll = this.time.addEvent({
      delay: 100, repeat: 80, callback: () => {
        const el = vid.video;
        if (el && el.readyState >= 2 && el.currentTime > 0 && vid.frame.width > 1) {
          poll.remove();
          vid.setDisplaySize(w, h);
          this.tweens.add({ targets: vid, alpha: 1, duration: 600 });
        }
      },
    });

    // darken the left side so the menu reads well
    const shade = this.add.graphics();
    shade.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.75, 0, 0.75, 0);
    shade.fillRect(0, 0, w * 0.55, h);

    // logo with a slow float
    const logo = this.add.image(440, 255, 'logo');
    logo.setScale(450 / logo.width);
    this.tweens.add({ targets: logo, y: 267, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const items: { key: string; style?: 'wood' | 'red'; action: () => void }[] = [
      { key: 'title.quickBattle', style: 'red', action: () => this.scene.start('Battle') },
      { key: 'title.newRun', action: () => toast(this, t('common.comingSoon')) },
      { key: 'title.settings', action: () => this.openModal('settings') },
      { key: 'title.credits', action: () => this.openModal('credits') },
    ];
    items.forEach((it, i) => {
      const btn = new Button(this, 440, 575 + i * 128, t(it.key), { style: it.style, width: 330, fontSize: 30, onClick: it.action });
      btn.setAlpha(0);
      this.tweens.add({ targets: btn, alpha: 1, x: { from: 400, to: 440 }, delay: 200 + i * 120, duration: 400 });
      this.buttons.push({ btn, key: it.key });
    });

    this.versionText = this.add.text(24, h - 20, '', {
      fontFamily: FONT_BODY, fontSize: '22px', color: COLOR.light,
    }).setOrigin(0, 1).setAlpha(0.7);
    this.refreshTexts();

    playMusic(this, 'mus_main_menu');

    // modal scenes tell us when the language changed
    this.game.events.on('lang-changed', this.refreshTexts, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('lang-changed', this.refreshTexts, this));
  }

  private refreshTexts(): void {
    for (const { btn, key } of this.buttons) btn.setLabel(t(key));
    this.versionText.setText(t('title.version', { version: VERSION }));
  }

  private openModal(kind: 'settings' | 'credits'): void {
    if (this.scene.isActive('Modal')) return;
    this.scene.launch('Modal', { kind });
  }
}
