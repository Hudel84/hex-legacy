import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playSfx, playMusic } from '../core/audio';
import { img, loadRunUi, loadPortrait } from '../core/assets';
import {
  run, save, gainXp, rng, commitRng, draftPool, nodeById, MAX_SLOTS, MAX_UNIT_LEVEL, rebalance, unitDef,
  addLoot, lootFor, owner, grantPerk, perkFactor, spellReward, learnSpell, spellMax, magicGrowth,
} from '../run/state';
import { loadSpellIcons, spellCard } from '../ui/spellUi';
import { offer, type PerkDef } from '../run/perks';
import { perkCard, loadPerkIcons } from '../ui/perkUi';
import { bonus } from '../meta/meta';
import type { RunBattleConfig } from '../run/encounters';
import { card, titleStyle, textStyle, stat, resRow } from '../ui/widgets';
import { Button } from '../ui/Button';


export class RewardScene extends Phaser.Scene {
  private cfg!: RunBattleConfig;
  private layer!: Phaser.GameObjects.Container;
  private levelUps = 0;
  private draft: string[] = [];
  private loot: Record<string, number> = {};
  private artifactDone = false;

  constructor() { super('Reward'); }

  init(data: { config: RunBattleConfig }): void { this.cfg = data.config; this.artifactDone = false; }

  preload(): void {
    loadRunUi(this);
    img(this, 'ui_victory_screen', 'ui/screens/ui_victory_screen.webp');
    const node = nodeById(this.cfg.nodeId);
    const g = rng();
    const pool = g.shuffle(draftPool(owner().faction, node.floor));
    commitRng(g);
    this.draft = pool.slice(0, 3 + perkFactor('draft'));
    loadPerkIcons(this);
    loadSpellIcons(this);
    for (const id of [...this.draft, ...run().army.map((s) => s.unitId)]) loadPortrait(this, id);
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    this.add.image(w / 2, h / 2, 'ui_victory_screen').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.55).setOrigin(0);
    this.layer = this.add.container(0, 0);
    playMusic(this, 'mus_map_act1');

    // apply gold and xp once
    r.gold += this.cfg.reward.gold;
    r.battlesWon++;
    this.levelUps = gainXp(this.cfg.reward.xp);
    const node = nodeById(this.cfg.nodeId);
    this.loot = lootFor(node.type, node.floor) as Record<string, number>;
    addLoot(this.loot);
    save();
    playSfx(this, 'ui_coins');
    this.summary();
  }

  private clear(): void { this.layer.removeAll(true); }

  private summary(): void {
    const { width: w } = this.scale;
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, t('reward.title'), titleStyle(64)).setOrigin(0.5));
    this.layer.add(stat(this, w / 2 - 170, 260, 'icon_gold', `+${this.cfg.reward.gold}`, 40));
    this.layer.add(this.add.text(w / 2 + 60, 260, `+${this.cfg.reward.xp} XP`, textStyle(40, '#bcd8f0', true)).setOrigin(0, 0.5));
    this.layer.add(this.add.text(w / 2, 345, t('reward.loot'), textStyle(24, '#e8dcc0')).setOrigin(0.5));
    this.layer.add(resRow(this, w / 2, 395, this.loot, 30, '+'));
    this.time.delayedCall(1300, () => this.next());
  }

  private next(): void {
    if (this.levelUps > 0) { this.levelUp(); return; }
    const node = nodeById(this.cfg.nodeId);
    if (node.type === 'elite' && !this.artifactDone) { this.artifactChoice(); return; }
    if (this.cfg.reward.draft && this.draft.length) { this.showDraft(); return; }
    this.finish();
  }

  private levelUp(): void {
    const { width: w } = this.scale;
    const r = run();
    playSfx(this, 'ui_levelup');
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, t('reward.levelUp', { n: r.level - this.levelUps + 1 }), titleStyle(60)).setOrigin(0.5));
    // every level: +5 leadership, every second level also +1 spell power or knowledge (see gainXp)
    const growth = magicGrowth(r.level - this.levelUps + 1);
    this.layer.add(this.add.text(w / 2, 188, growth ? t('reward.levelStats', { stat: t(`stat.${growth}`) }) : t('reward.levelLead'),
      textStyle(26, '#9fd0ff', true)).setOrigin(0.5));
    const head = this.add.text(w / 2, 238, t('reward.chooseTalent'), textStyle(30)).setOrigin(0.5);
    this.layer.add(head);
    const g = rng();
    const opts = offer('talent', bonus.levelUpChoices(), owner(), g);
    // sometimes the last card is a spell instead of a talent (GDD 5.5: spells from level-ups)
    const sr = g.next() < 0.4 ? spellReward(g) : null;
    commitRng(g);
    const done = () => { this.levelUps--; save(); playSfx(this, 'ui_talent_pick'); this.next(); };
    const cards: ((x: number) => Phaser.GameObjects.Container)[] = opts.map((p) => (x: number) => perkCard(this, x, 610, p, () => { grantPerk(p.id); done(); }));
    if (sr && cards.length) {
      const cur = r.spells?.find((s) => s.id === sr.id)?.level ?? 0;
      const lvl = Math.min(spellMax(sr.id), cur + 1);
      cards[cards.length - 1] = (x: number) => spellCard(this, x, 610, sr.kind, sr.id, r.power ?? 0, lvl, () => { learnSpell(sr.id); done(); });
      head.setText(t('reward.chooseBoon'));
    }
    const gap = cards.length > 3 ? 330 : 360;
    cards.forEach((mk, i) => this.layer.add(mk(w / 2 + (i - (cards.length - 1) / 2) * gap)));
  }

  private perkCards(opts: PerkDef[], pick: (p: PerkDef) => void): void {
    const { width: w } = this.scale;
    const gap = opts.length > 3 ? 330 : 360;
    opts.forEach((p, i) => {
      this.layer.add(perkCard(this, w / 2 + (i - (opts.length - 1) / 2) * gap, 590, p, () => pick(p)));
    });
  }

  private artifactChoice(): void {
    const { width: w } = this.scale;
    this.artifactDone = true;
    const g = rng();
    const opts = offer('artifact', 3, owner(), g);
    commitRng(g);
    if (!opts.length) { this.next(); return; }
    playSfx(this, 'ui_reward');
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, t('reward.artifact'), titleStyle(60)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 195, t('reward.chooseArtifact'), textStyle(30)).setOrigin(0.5));
    this.perkCards(opts, (p) => { grantPerk(p.id); save(); playSfx(this, 'ui_equip'); this.next(); });
  }

  private showDraft(): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    playSfx(this, 'ui_card_draft');
    this.clear();
    this.layer.add(this.add.text(w / 2, 100, t('reward.draft'), titleStyle(56)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 165, t(r.army.length >= MAX_SLOTS ? 'reward.draftFull' : 'reward.draftHint'), textStyle(26)).setOrigin(0.5));
    this.draft.forEach((id, i) => {
      const d = unitDef(id);
      const owned = r.army.find((s) => s.unitId === id);
      const lines = [
        `${t('stat.hp')} ${d.hp}  ${t('stat.atk')} ${d.atk}  ${t('stat.def')} ${d.def}`,
        `${t('stat.dmg')} ${d.dmg[0]}–${d.dmg[1]}  ${t('stat.ini')} ${d.ini}  ${t('stat.spd')} ${d.speed}`,
        ...(d.ranged ? [t('passive.ranged', { n: d.ranged })] : []),
        ...(d.flying ? [t('passive.flying')] : []),
        ...(d.passives ?? []).map((p) => t(`passive.${p}`)),
      ];
      const c = card(this, w / 2 + (i - 1) * 380, 580, {
        w: 320, h: 600, portrait: `portrait_${id}`, title: t(`unit.${id}`),
        subtitle: owned ? t('reward.ownedUpgrade') : t('reward.tierCost', { tier: d.tier, cost: d.cost }),
        lines,
        disabled: !!owned && owned.level >= MAX_UNIT_LEVEL,
        onClick: () => this.pick(id),
      });
      this.layer.add(c);
    });
    this.layer.add(new Button(this, w / 2, h - 80, t('reward.skip'), { width: 380, fontSize: 26, onClick: () => { r.gold += 20; save(); this.finish(); } }));
  }

  private pick(id: string): void {
    const r = run();
    const owned = r.army.find((s) => s.unitId === id);
    if (owned) { owned.level = Math.min(MAX_UNIT_LEVEL, owned.level + 1); save(); this.finish(); return; }
    if (r.army.length < MAX_SLOTS) {
      r.army.push({ unitId: id, alloc: 0, level: 0 });
      rebalance(); save(); this.finish(); return;
    }
    this.replace(id);
  }

  private replace(id: string): void {
    const { width: w, height: h } = this.scale;
    const r = run();
    this.clear();
    this.layer.add(this.add.text(w / 2, 100, t('reward.replaceTitle', { unit: t(`unit.${id}`) }), titleStyle(48)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 165, t('reward.replaceHint'), textStyle(26)).setOrigin(0.5));
    r.army.forEach((s, i) => {
      const c = card(this, w / 2 + (i - 1) * 380, 560, {
        w: 300, portrait: `portrait_${s.unitId}`, title: t(`unit.${s.unitId}`),
        subtitle: `${'★'.repeat(s.level)}${'☆'.repeat(MAX_UNIT_LEVEL - s.level)}`,
        onClick: () => { r.army[i] = { unitId: id, alloc: s.alloc, level: 0 }; rebalance(); save(); this.finish(); },
      });
      this.layer.add(c);
    });
    this.layer.add(new Button(this, w / 2, h - 80, t('common.back'), { width: 300, fontSize: 26, onClick: () => this.showDraft() }));
  }

  private finish(): void {
    const node = nodeById(this.cfg.nodeId);
    save();
    if (node.type === 'boss') { this.scene.start('RunEnd', { won: true }); return; }
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(210, () => this.scene.start('Map'));
  }
}
