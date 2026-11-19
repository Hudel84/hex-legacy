import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { HEROES } from '../run/heroes';
import { newRun, setRun } from '../run/state';
import { loadRunUi, loadHeroPortrait, loadPortrait, img } from '../core/assets';
import { card, titleStyle, textStyle } from '../ui/widgets';
import { Button } from '../ui/Button';
import { playMusic } from '../core/audio';

export class HeroSelectScene extends Phaser.Scene {
  private selected = HEROES[0].id;
  private cards: Phaser.GameObjects.Container[] = [];
  constructor() { super('HeroSelect'); }

  preload(): void {
    loadRunUi(this);
    img(this, 'ui_hero_select_bg', 'ui/screens/ui_hero_select_bg.webp');
    for (const h of HEROES) { loadHeroPortrait(this, h.id); for (const u of h.startArmy) loadPortrait(this, u); }
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.add.image(w / 2, h / 2, 'ui_hero_select_bg').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.35).setOrigin(0);
    this.add.text(w / 2, 70, t('heroSelect.title'), titleStyle(56)).setOrigin(0.5);
    this.add.text(w / 2, 130, t('heroSelect.faction'), textStyle(28, '#e8dcc0')).setOrigin(0.5);
    this.drawCards();
    this.add.text(w / 2, h - 175, t('heroSelect.more'), textStyle(22, '#c9b896')).setOrigin(0.5);
    new Button(this, w / 2 - 220, h - 85, t('common.back'), { width: 300, fontSize: 28, onClick: () => this.scene.start('Title') });
    new Button(this, w / 2 + 220, h - 85, t('heroSelect.start'), { style: 'red', width: 340, fontSize: 30, onClick: () => this.start() });
    playMusic(this, 'mus_main_menu');
  }

  private drawCards(): void {
    for (const c of this.cards) c.destroy();
    this.cards = [];
    const { width: w } = this.scale;
    HEROES.forEach((hero, i) => {
      const x = w / 2 + (i - 1) * 420;
      const army = hero.startArmy.map((u) => t(`unit.${u}`)).join(', ');
      const c = card(this, x, 530, {
        w: 360, h: 600,
        portrait: `heroportrait_${hero.id}`,
        title: t(`hero.${hero.id}`),
        subtitle: t(hero.bonus),
        lines: [
          `${t('stat.atk')} ${hero.atk}   ${t('stat.def')} ${hero.def}   ${t('stat.lead')} ${hero.leadership}`,
          army,
        ],
        highlight: this.selected === hero.id,
        onClick: () => { this.selected = hero.id; this.drawCards(); },
      });
      this.cards.push(c);
    });
    void COLOR;
  }

  private start(): void {
    setRun(newRun(this.selected));
    this.scene.start('Map');
  }
}
