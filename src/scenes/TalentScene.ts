// Upgrade choice of a talent rank outside the reward screen: the start talent of a new run (and old saves
// that got their start talent in v0.16). Leads back to the map.
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playSfx, playMusic, mapMusic } from '../core/audio';
import { img, loadRunUi } from '../core/assets';
import { run, save, rankUpgrades, chooseTalentUpgrade } from '../run/state';
import { perkCard, loadPerkIcons } from '../ui/perkUi';
import { themeName, rankLabel, rankLines } from '../ui/talentUi';
import { titleStyle, textStyle } from '../ui/widgets';

export class TalentScene extends Phaser.Scene {
  constructor() { super('Talent'); }

  preload(): void {
    loadRunUi(this);
    loadPerkIcons(this);
    img(this, 'ui_victory_screen', 'ui/screens/ui_victory_screen.webp');
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    const pt = r.pendingTalent;
    if (!pt) { this.scene.start('Map'); return; }
    playMusic(this, mapMusic(r.act));
    this.add.image(w / 2, h / 2, 'ui_victory_screen').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.6).setOrigin(0);
    this.add.text(w / 2, 100, `${themeName(pt.theme)} · ${rankLabel(pt.rank)}`, titleStyle(56)).setOrigin(0.5);
    this.add.text(w / 2, 168, rankLines(pt.theme, pt.rank).join('  ·  '), { ...textStyle(22, '#9fd0ff', true), align: 'center', wordWrap: { width: 1500 } }).setOrigin(0.5);
    this.add.text(w / 2, 232, t(pt.rank === 1 && r.level === 1 ? 'talent.startChoose' : pt.rank === 3 ? 'talent.chooseLegendary' : 'talent.chooseUpgrade'), textStyle(30)).setOrigin(0.5);
    const opts = rankUpgrades(pt.theme, pt.rank);
    opts.forEach((p, i) => {
      this.add.existing(perkCard(this, w / 2 + (i - (opts.length - 1) / 2) * 360, 610, p, () => {
        chooseTalentUpgrade(p.id);
        save();
        playSfx(this, 'ui_equip');
        this.scene.start('Map');
      }));
    });
  }
}
