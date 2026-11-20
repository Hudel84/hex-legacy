import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { HEROES, FACTIONS, heroesOf, heroById } from '../run/heroes';
import { heroUnlocked, heroUnlockText } from '../meta/meta';
import { newRun, setRun } from '../run/state';
import { loadRunUi, loadHeroPortrait, loadPortrait, img } from '../core/assets';
import { card, titleStyle, textStyle } from '../ui/widgets';
import { Button } from '../ui/Button';
import { playMusic } from '../core/audio';

export class HeroSelectScene extends Phaser.Scene {
  private selected = HEROES[0].id;
  private cards: Phaser.GameObjects.Container[] = [];
  private faction: string = 'human';
  private tabs: Button[] = [];
  constructor() { super('HeroSelect'); }

  init(data: { faction?: string; selected?: string }): void {
    if (data?.selected) this.selected = data.selected;
  }

  preload(): void {
    loadRunUi(this);
    img(this, 'ui_hero_select_bg', 'ui/screens/ui_hero_select_bg.webp');
    for (const h of HEROES) { loadHeroPortrait(this, h.id); for (const u of h.startArmy) loadPortrait(this, u); }
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.add.image(w / 2, h / 2, 'ui_hero_select_bg').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.35).setOrigin(0);
    this.add.text(w / 2, 62, t('heroSelect.title'), titleStyle(56)).setOrigin(0.5);
    this.faction = heroById(this.selected).faction;
    this.tabs = FACTIONS.map((f, i) => new Button(this, w / 2 + (i - (FACTIONS.length - 1) / 2) * 360, 190, t(`faction.${f}`), {
      width: 330, fontSize: 30, style: f === this.faction ? 'red' : 'wood',
      onClick: () => { this.faction = f; this.selected = heroesOf(f)[0].id; this.scene.restart({ faction: f, selected: this.selected }); },
    }));
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
    heroesOf(this.faction).forEach((hero, i) => {
      const x = w / 2 + (i - 1) * 420;
      const army0 = 0; void army0;
      const army = hero.startArmy.map((u) => t(`unit.${u}`)).join(', ');
      const unlocked = heroUnlocked(hero.id);
      const lockInfo = heroUnlockText(hero.id);
      const c = card(this, x, 560, {
        w: 360, h: 600,
        portrait: `heroportrait_${hero.id}`,
        title: t(`hero.${hero.id}`),
        subtitle: t(hero.bonus),
        lines: [
          `${t('stat.atk')} ${hero.atk}   ${t('stat.def')} ${hero.def}   ${t('stat.lead')} ${hero.leadership}`,
          army,
        ],
        highlight: this.selected === hero.id,
        disabled: !unlocked,
        onClick: () => { this.selected = hero.id; this.drawCards(); },
      });
      if (!unlocked && lockInfo) {
        const [b, lv] = lockInfo.split(':');
        const lock = this.add.image(0, -60, 'ui_icon_lock'); lock.setScale(90 / lock.width);
        const lt = this.add.text(0, 30, t('heroSelect.locked', { building: t(`building.${b}.name`), n: lv }),
          { ...textStyle(22, '#ffffff', true), align: 'center', wordWrap: { width: 300 } }).setOrigin(0.5);
        c.add([lock, lt]);
      }
      this.cards.push(c);
    });
    void COLOR;
  }

  private start(): void {
    if (!heroUnlocked(this.selected)) this.selected = heroesOf(this.faction)[0].id;
    setRun(newRun(this.selected));
    this.scene.start('Map');
  }
}
