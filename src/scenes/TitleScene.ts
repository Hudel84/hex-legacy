import Phaser from 'phaser';
import { t } from '../core/i18n';
import { FONT_BODY, COLOR, VERSION } from '../core/theme';
import { playMusic } from '../core/audio';
import { Button } from '../ui/Button';
import { shade } from '../ui/widgets';
import { hasSave, loadSave } from '../run/state';

let quickDone = false;

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
    // some browsers stop at the end despite loop=true: restart manually
    vid.on(Phaser.GameObjects.Events.VIDEO_COMPLETE, () => { vid.seekTo(0); vid.play(true); });
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

    // dark band at the bottom for the menu, so the six heroes stay visible
    shade(this, 0, h - 300, w, 300, 0, 0.85);

    // logo with a slow float
    const logo = this.add.image(w / 2, 160, 'logo');
    logo.setScale(330 / logo.width);
    this.tweens.add({ targets: logo, y: 170, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    const items: { key: string; style?: 'wood' | 'red'; action: () => void }[] = [];
    if (hasSave()) items.push({ key: 'title.continue', style: 'red', action: () => { if (loadSave()) this.scene.start('Map'); } });
    items.push(
      { key: 'title.newRun', style: hasSave() ? 'wood' : 'red', action: () => this.scene.start('HeroSelect') },
      { key: 'title.city', action: () => this.scene.start('City') },
      { key: 'title.settings', action: () => this.openModal('settings') },
      { key: 'title.credits', action: () => this.openModal('credits') },
    );
    items.forEach((it, i) => {
      const bx = w / 2 + (i - (items.length - 1) / 2) * (items.length > 4 ? 318 : 350);
      const btn = new Button(this, bx, h - 85, t(it.key), { style: it.style, width: items.length > 4 ? 300 : 320, fontSize: items.length > 4 ? 25 : 28, onClick: it.action });
      btn.setAlpha(0);
      this.tweens.add({ targets: btn, alpha: 1, y: { from: h - 55, to: h - 85 }, delay: 200 + i * 100, duration: 400 });
      this.buttons.push({ btn, key: it.key });
    });

    this.versionText = this.add.text(24, h - 20, '', {
      fontFamily: FONT_BODY, fontSize: '22px', color: COLOR.light,
    }).setOrigin(0, 1).setAlpha(0.7);
    this.refreshTexts();

    playMusic(this, 'mus_main_menu');
    // quick test battle is still reachable with ?quick
    if (!quickDone && new URLSearchParams(location.search).has('quick')) { quickDone = true; this.time.delayedCall(300, () => this.scene.start('Battle')); }

    // modal scenes tell us when the language changed
    this.game.events.on('lang-changed', this.refreshTexts, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off('lang-changed', this.refreshTexts, this));
  }

  private refreshTexts(): void {
    for (const { btn, key } of this.buttons) btn.setLabel(t(key));
    this.versionText.setText(t('title.version', { version: VERSION }) + (this.game.renderer.type === Phaser.CANVAS ? '  ·  Canvas' : '  ·  WebGL'));
  }

  private openModal(kind: 'settings' | 'credits'): void {
    if (this.scene.isActive('Modal')) return;
    this.scene.launch('Modal', { kind });
  }
}
