import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playMusic, playSfx } from '../core/audio';
import { img } from '../core/assets';
import { run, setRun } from '../run/state';
import { titleStyle, textStyle, resRow } from '../ui/widgets';
import { addRes, bonus, getMeta, saveMeta } from '../meta/meta';
import { loadRunUi } from '../core/assets';
import { Button } from '../ui/Button';

/** End of a run: act cleared (demo end) or army defeated. The save is cleared. */
export class RunEndScene extends Phaser.Scene {
  private won = false;
  constructor() { super('RunEnd'); }
  init(data: { won: boolean }): void { this.won = data.won; }

  preload(): void {
    img(this, 'ui_victory_screen', 'ui/screens/ui_victory_screen.webp');
    img(this, 'ui_defeat_screen', 'ui/screens/ui_defeat_screen.webp');
    loadRunUi(this);
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    this.add.image(w / 2, h / 2, this.won ? 'ui_victory_screen' : 'ui_defeat_screen').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.35).setOrigin(0);
    this.add.text(w / 2, 150, t(this.won ? 'runEnd.won' : 'runEnd.lost'), titleStyle(80, this.won ? '#f3d48a' : '#e8c8c0')).setOrigin(0.5);
    // floors over all acts (13 per act, the final battle counts as one more)
    const local = r.currentNode !== null ? (r.map.find((n) => n.id === r.currentNode)?.floor ?? 0) + 1 : 0;
    const floor = (r.act - 1) * 13 + local + (this.won ? 1 : 0);
    const lines = [
      t(this.won ? 'runEnd.wonText' : 'runEnd.lostText', { floor }),
      '',
      t('runEnd.stats', { battles: r.battlesWon, level: r.level, gold: r.gold }),
    ];
    this.add.text(w / 2, 290, lines.join('\n'), { ...textStyle(32), align: 'center', wordWrap: { width: 1300 }, lineSpacing: 6 }).setOrigin(0.5, 0);

    // transfer the loot to the city: all of it after a win, a part after a defeat
    const factor = this.won ? 1 : bonus.keepOnDefeat();
    const fame = floor * 2 + r.battlesWon + (this.won ? 15 : 0);
    const gained = addRes({ ...(r.loot ?? {}), fame }, factor);
    const m = getMeta();
    m.runs++; if (this.won) m.wins++; m.bestFloor = Math.max(m.bestFloor, floor);
    saveMeta();
    this.add.text(w / 2, 520, t(this.won ? 'runEnd.lootWon' : 'runEnd.lootLost', { pct: Math.round(factor * 100) }), textStyle(28, '#e8dcc0')).setOrigin(0.5);
    this.add.existing(resRow(this, w / 2, 590, gained, 36, '+'));

    new Button(this, w / 2 - 230, h - 110, t('runEnd.toCity'), { style: 'red', width: 400, fontSize: 28, onClick: () => this.scene.start('City') });
    new Button(this, w / 2 + 230, h - 110, t('heroSelect.again'), { width: 400, fontSize: 28, onClick: () => this.scene.start('HeroSelect') });
    playSfx(this, this.won ? 'ev_victory_crowd' : 'cb_death_human');
    playMusic(this, 'mus_main_menu');
    setRun(null);
  }
}
