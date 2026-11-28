import { ascLines } from '../ui/ascUi';
import { tooltip } from '../ui/perkUi';
import { getMeta } from '../meta/meta';
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { HEROES, FACTIONS, heroesOf, heroById } from '../run/heroes';
import { heroUnlocked, heroUnlockText } from '../meta/meta';
import { newRun, setRun } from '../run/state';
import { loadRunUi, loadHeroPortrait, loadPortrait, img } from '../core/assets';
import { card, titleStyle, textStyle } from '../ui/widgets';
import { Button } from '../ui/Button';
import { playMusic, playSfx } from '../core/audio';
import { playVoice } from '../core/voice';
import { START_THEME, themeById } from '../run/talents';
import { themeName } from '../ui/talentUi';
import { KIND_COLOR } from '../ui/perkUi';

/** Chosen ascension level, kept while switching tabs (v0.20). */
let chosenAsc: number | null = null;

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
    // start talent icons (v0.18.1)
    for (const id of new Set(Object.values(START_THEME))) { const th = themeById(id); if (th) img(this, `talenticon_${th.icon}`, `icons/talents/icon_talent_${th.icon}.webp`); }
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.add.image(w / 2, h / 2, 'ui_hero_select_bg').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.35).setOrigin(0);
    this.add.text(w / 2, 62, t('heroSelect.title'), titleStyle(56)).setOrigin(0.5);
    this.faction = heroById(this.selected).faction;
    this.tabs = FACTIONS.map((f, i) => new Button(this, w / 2 + (i - (FACTIONS.length - 1) / 2) * 300, 175, t(`faction.${f}`), {
      width: 290, fontSize: 26, style: f === this.faction ? 'red' : 'wood',
      onClick: () => { this.faction = f; this.selected = heroesOf(f)[0].id; this.scene.restart({ faction: f, selected: this.selected }); },
    }));
    // the people passive of the chosen people
    const race = this.add.text(w / 2, 248, `${t(`race.${this.faction}.name`)}: ${t(`race.${this.faction}.desc`)}`,
      { ...textStyle(23, '#9fe0ff', true), align: 'center', wordWrap: { width: 1300 } }).setOrigin(0.5);
    const rb = this.add.graphics();
    rb.fillStyle(0x000000, 0.55).fillRoundedRect(w / 2 - race.width / 2 - 20, 248 - race.height / 2 - 8, race.width + 40, race.height + 16, 10);
    race.setDepth(1); rb.setDepth(0.5);
    this.drawCards();
    this.ascSelector();
    new Button(this, w / 2 - 220, h - 58, t('common.back'), { width: 300, fontSize: 28, onClick: () => this.scene.start('Title') });
    new Button(this, w / 2 + 220, h - 58, t('heroSelect.start'), { style: 'red', width: 340, fontSize: 30, onClick: () => this.start() });
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
      const H = 680, RES = 145;
      const c = card(this, x, 612, {
        w: 360, h: H, reserveBottom: RES + 22,
        portrait: `heroportrait_${hero.id}`,
        title: t(`hero.${hero.id}`),
        lines: [
          `${t('stat.atk')} ${hero.atk}   ${t('stat.def')} ${hero.def}   ${t('stat.lead')} ${hero.leadership}`,
          `${t('stat.power')} ${hero.power}   ${t('stat.knowledge')} ${hero.knowledge}`,
          army,
          `${t('heroSelect.spells')}: ${hero.spells.map((x) => t(`spell.${x}.name`)).join(', ')}`,
        ],
        highlight: this.selected === hero.id,
        disabled: !unlocked,
        onClick: () => { this.selected = hero.id; this.drawCards(); playVoice(this, hero.id, 'select'); },
      });
      // start talent (v0.16 themes): icon, name and what it does
      const theme = START_THEME[hero.id];
      const th = theme ? themeById(theme) : undefined;
      if (th) {
        const y0 = H / 2 - RES - 22;
        const g = this.add.graphics();
        g.fillStyle(0x16233a, 0.97).fillRoundedRect(-150, y0, 300, RES - 8, 12);
        g.lineStyle(2, 0xf3d48a, 0.8).strokeRoundedRect(-150, y0, 300, RES - 8, 12);
        const ic = this.add.image(-108, y0 + (RES - 8) / 2, `talenticon_${th.icon}`); ic.setScale(64 / Math.max(ic.width, ic.height));
        const head = this.add.text(-68, y0 + 14, themeName(theme), { ...textStyle(20, '#ffe08a', true), wordWrap: { width: 210 } });
        const desc = this.add.text(-68, 0, t(`talent.${theme}.desc`), { ...textStyle(17, '#efe3c8'), wordWrap: { width: 210 } });
        // shrink until name + description fit into the box (large text setting)
        for (let k = 1; k >= 0.3; k -= 0.05) {
          head.setScale(k); desc.setScale(k);
          head.setWordWrapWidth(210 / k); desc.setWordWrapWidth(210 / k);
          desc.setY(head.y + head.displayHeight + 3);
          if (desc.y + desc.displayHeight <= y0 + RES - 24) break;
        }
        // label on the upper edge of the box
        const lab = this.add.text(0, y0, t('heroSelect.startTalent').toUpperCase(), { ...textStyle(15, '#ffffff', true), stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        if (lab.width > 200) lab.setScale(200 / lab.width);
        const lw = lab.displayWidth + 26, lh = lab.displayHeight + 6;
        const pill = this.add.graphics();
        pill.fillStyle(KIND_COLOR.talent, 1).fillRoundedRect(-lw / 2, y0 - lh / 2, lw, lh, lh / 2);
        pill.lineStyle(2, 0xf3d48a, 1).strokeRoundedRect(-lw / 2, y0 - lh / 2, lw, lh, lh / 2);
        c.add([g, ic, head, desc, pill, lab]);
      }
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

  /** Ascension (v0.20): choose the level, bottom left; only shown after the first won run. */
  private ascSelector(): void {
    const max = getMeta().ascUnlocked ?? 0;
    if (max < 1) { chosenAsc = 0; return; }
    if (chosenAsc === null || chosenAsc > max) chosenAsc = max;
    const { height: h } = this.scale;
    const x = 255, y = h - 58;
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.6).fillRoundedRect(x - 215, y - 40, 430, 80, 14).lineStyle(2, 0x8a6a2b, 1).strokeRoundedRect(x - 215, y - 40, 430, 80, 14);
    const a = chosenAsc;
    const label = this.add.text(x, y - 12, a > 0 ? t('asc.level', { n: a }) : t('asc.none'), textStyle(28, a > 0 ? '#ff9a7a' : '#e8dcc0', true)).setOrigin(0.5);
    const sub = this.add.text(x, y + 20, a > 0 ? `${t(`asc.rule.${a}`)} · ${t('asc.bonus', { n: a * 10 })}` : t('asc.choose'), textStyle(17, '#e8dcc0')).setOrigin(0.5);
    if (sub.width > 330) sub.setScale(330 / sub.width);
    label.setInteractive({ useHandCursor: true });
    if (a > 0) tooltip(this, label, t('asc.level', { n: a }), [...ascLines(a), '', t('asc.bonus', { n: a * 10 })]);
    const arrow = (dx: number, txt: string, d: number) => {
      const ok = d < 0 ? a > 0 : a < max;
      const b = this.add.text(x + dx, y, txt, textStyle(40, ok ? '#f3d48a' : '#5a4a3a', true)).setOrigin(0.5);
      if (ok) b.setInteractive({ useHandCursor: true }).on('pointerup', () => { chosenAsc = a + d; playSfx(this, 'ui_click'); this.scene.restart({ faction: this.faction, selected: this.selected }); });
    };
    arrow(-185, '◀', -1);
    arrow(185, '▶', 1);
    void bg;
  }

  private start(): void {
    if (!heroUnlocked(this.selected)) this.selected = heroesOf(this.faction)[0].id;
    setRun(newRun(this.selected, undefined, chosenAsc ?? 0));
    this.scene.start('Map');
  }
}
