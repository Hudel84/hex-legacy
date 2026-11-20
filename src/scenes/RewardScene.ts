import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playSfx, playMusic, mapMusic } from '../core/audio';
import { img, sfx, loadRunUi, loadPortrait } from '../core/assets';
import {
  run, save, gainXp, rng, commitRng, draftPool, nodeById, MAX_SLOTS, MAX_UNIT_LEVEL, rebalance, unitDef,
  addLoot, lootFor, owner, grantPerk, perkFactor, spellReward, learnSpell, spellMax, magicGrowth, heroTotals,
} from '../run/state';
import { loadSpellIcons, spellCard } from '../ui/spellUi';
import { rollItem, rollConsumable, sellPrice, CONSUMABLES, ITEMS, itemIconKey, type ItemInst } from '../run/items';
import { globalFloor } from '../run/encounters';
import { advanceAct, LAST_ACT } from '../run/state';
import { stashItem, addToBag, equipItem, bagFull, beltFull, addConsumable, slotsFor, heroFaction, equipped } from '../run/state';
import { withItemTextures, loadItemAssets, itemIcon, itemInfo, itemInfoBlock, consumableIcon, consumableName, consumableDesc, itemName } from '../ui/itemUi';
import { setCounts } from '../run/items';
import { offer, type PerkDef } from '../run/perks';
import { perkCard, loadPerkIcons } from '../ui/perkUi';
import { bonus } from '../meta/meta';
import type { RunBattleConfig } from '../run/encounters';
import { card, titleStyle, textStyle, stat, resRow, panel } from '../ui/widgets';
import { Button, toast } from '../ui/Button';


export class RewardScene extends Phaser.Scene {
  private cfg!: RunBattleConfig;
  private layer!: Phaser.GameObjects.Container;
  private levelUps = 0;
  private draft: string[] = [];
  private loot: Record<string, number> = {};
  private artifactDone = false;
  private itemFind: ItemInst | null = null;
  private consFind: string | null = null;
  private eliteItem: ItemInst | null = null;

  constructor() { super('Reward'); }

  init(data: { config: RunBattleConfig }): void {
    this.cfg = data.config; this.artifactDone = false; this.itemFind = null; this.consFind = null; this.eliteItem = null;
  }

  preload(): void {
    loadRunUi(this);
    img(this, 'ui_victory_screen', 'ui/screens/ui_victory_screen.webp');
    const node = nodeById(this.cfg.nodeId);
    const g = rng();
    const pool = g.shuffle(draftPool(owner().faction, node.floor));
    // equipment finds (GDD 5.3): 35 % item and 15 % consumable after normal fights, elites offer an item next to artifacts
    if (node.type === 'elite') this.eliteItem = rollItem(g, globalFloor(node.floor), 'rare');
    else if (node.type !== 'boss') {
      if (g.next() < 0.35) this.itemFind = rollItem(g, globalFloor(node.floor));
      if (g.next() < 0.15) this.consFind = rollConsumable(g);
    }
    commitRng(g);
    this.draft = pool.slice(0, 3 + perkFactor('draft'));
    loadItemAssets(this, [this.itemFind, this.eliteItem, ...equipped(), ...(run().bag ?? [])].filter((x): x is ItemInst => !!x).map((x) => x.id));
    loadPerkIcons(this);
    loadSpellIcons(this);
    for (const id of [...this.draft, ...run().army.map((s) => s.unitId)]) loadPortrait(this, id);
    sfx(this, mapMusic(run().act), `audio/music/${mapMusic(run().act)}.ogg`);
  }

  create(): void {
    if (this.cfg.final) { save(); this.scene.start('RunEnd', { won: true }); return; }
    const { width: w, height: h } = this.scale;
    const r = run();
    this.add.image(w / 2, h / 2, 'ui_victory_screen').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.55).setOrigin(0);
    this.layer = this.add.container(0, 0);
    this.time.delayedCall(3500, () => playMusic(this, mapMusic(r.act), 2000)); // after the victory stinger

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
    if (this.itemFind) { this.showItemFind(); return; }
    if (this.consFind) { this.showConsFind(); return; }
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
      cards[cards.length - 1] = (x: number) => spellCard(this, x, 610, sr.kind, sr.id, heroTotals(r).power, lvl, () => { learnSpell(sr.id); done(); });
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
    const opts = offer('artifact', this.eliteItem ? 2 : 3, owner(), g);
    commitRng(g);
    if (!opts.length && !this.eliteItem) { this.next(); return; }
    playSfx(this, 'ui_reward');
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, t('reward.artifact'), titleStyle(60)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 195, t(this.eliteItem ? 'reward.chooseArtifactOrItem' : 'reward.chooseArtifact'), textStyle(30)).setOrigin(0.5));
    const n = opts.length + (this.eliteItem ? 1 : 0);
    const xs = (i: number) => w / 2 + (i - (n - 1) / 2) * 360;
    opts.forEach((p, i) => this.layer.add(perkCard(this, xs(i), 590, p, () => { grantPerk(p.id); save(); playSfx(this, 'ui_equip'); this.next(); })));
    const it = this.eliteItem;
    if (it) {
      const info = itemInfo(it, heroFaction());
      this.layer.add(card(this, xs(opts.length), 590, {
        w: 300, h: 520, portrait: itemIconKey(it.id), title: info.title, subtitle: info.sub, subtitleColor: info.color,
        lines: info.lines.slice(0, -1).map((l) => l.text), lineSize: 19,
        onClick: () => { this.itemFind = it; playSfx(this, 'ui_equip'); this.next(); },
      }));
    }
  }


  /** A found item: put on, into the backpack or sell. */
  private showItemFind(): void {
    const it0 = this.itemFind!;
    if (!this.textures.exists(itemIconKey(it0.id))) { withItemTextures(this, [it0.id], () => this.showItemFind()); return; }
    const { width: w, height: h } = this.scale;
    const it = this.itemFind!;
    const r = run();
    playSfx(this, 'ui_reward');
    this.clear();
    this.layer.add(this.add.text(w / 2, 110, t('reward.itemFound'), titleStyle(56)).setOrigin(0.5));
    this.layer.add(panel(this, w / 2, 520, 1300, 600));
    this.layer.add(itemIcon(this, w / 2 - 470, 470, it, 220));
    const sets = setCounts(equipped());
    const set = ITEMS[it.id].set;
    itemInfoBlock(this, this.layer, w / 2 - 320, 280, 520, itemInfo(it, heroFaction(), (sets[set ?? ''] ?? 0) + (set ? 1 : 0)), 22);
    // what is worn in that place now
    const cur = slotsFor(it).map((k) => r.equip?.[k]).filter((x): x is ItemInst => !!x);
    const free = slotsFor(it).some((k) => !r.equip?.[k]);
    this.layer.add(this.add.text(w / 2 + 270, 280, t('reward.wornNow'), titleStyle(24)));
    if (free || !cur.length) this.layer.add(this.add.text(w / 2 + 270, 325, t('reward.slotFree'), textStyle(22, '#9fe39f')));
    else cur.forEach((c, i) => {
      this.layer.add(itemIcon(this, w / 2 + 320, 370 + i * 120, c, 90));
      this.layer.add(this.add.text(w / 2 + 380, 350 + i * 120, itemName(c.id), { ...textStyle(21, '#efe3c8', true), wordWrap: { width: 230 } }));
    });
    const done = (msg?: string) => { this.itemFind = null; save(); if (msg) toast(this, msg); this.time.delayedCall(msg ? 700 : 0, () => this.next()); };
    const by = h - 150;
    this.layer.add(new Button(this, w / 2 - 420, by, t('reward.equip'), { style: 'red', width: 380, fontSize: 26, onClick: () => {
      const gold = equipItem(it); playSfx(this, 'ui_equip'); done(gold ? t('hero.soldOld', { n: gold }) : undefined);
    } }));
    const bag = new Button(this, w / 2, by, t('reward.toBag'), { width: 380, fontSize: 26, onClick: () => {
      if (addToBag(it)) { playSfx(this, 'ui_equip'); done(); }
    } });
    bag.setEnabled(!bagFull());
    this.layer.add(bag);
    this.layer.add(new Button(this, w / 2 + 420, by, t('reward.sell', { n: sellPrice(it) }), { width: 380, fontSize: 26, onClick: () => {
      r.gold += sellPrice(it); playSfx(this, 'ui_coins'); done();
    } }));
    void stashItem;
  }

  /** A found potion or scroll: into the belt (or swap one) or sell. */
  private showConsFind(): void {
    const { width: w, height: h } = this.scale;
    const id = this.consFind!;
    const r = run();
    const price = Math.round(CONSUMABLES[id].price * 0.4);
    playSfx(this, 'ui_reward');
    this.clear();
    this.layer.add(this.add.text(w / 2, 110, t('reward.consFound'), titleStyle(56)).setOrigin(0.5));
    this.layer.add(panel(this, w / 2, 420, 1100, 360));
    this.layer.add(consumableIcon(this, w / 2 - 380, 420, id, 180));
    this.layer.add(this.add.text(w / 2 - 240, 320, consumableName(id), textStyle(34, '#ffe08a', true)));
    this.layer.add(this.add.text(w / 2 - 240, 375, consumableDesc(id, heroTotals().power), { ...textStyle(24, '#efe3c8'), wordWrap: { width: 640 } }));
    const done = () => { this.consFind = null; save(); this.next(); };
    const by = h - 170;
    if (!beltFull()) {
      this.layer.add(new Button(this, w / 2 - 230, by, t('reward.takeCons'), { style: 'red', width: 400, fontSize: 26, onClick: () => { addConsumable(id); playSfx(this, 'ui_equip'); done(); } }));
    } else {
      this.layer.add(this.add.text(w / 2, 650, t('reward.beltFull'), textStyle(24, '#e8dcc0')).setOrigin(0.5));
      (r.belt ?? []).forEach((b, i) => {
        if (!b) return;
        this.layer.add(new Button(this, w / 2 + (i - 1) * 420, 740, t('reward.swap', { name: consumableName(b) }), { width: 400, fontSize: 20, onClick: () => {
          r.belt![i] = id; r.gold += Math.round(CONSUMABLES[b].price * 0.4); playSfx(this, 'ui_equip'); done();
        } }));
      });
    }
    this.layer.add(new Button(this, w / 2 + 230, by, t('reward.sell', { n: price }), { width: 400, fontSize: 26, onClick: () => { r.gold += price; playSfx(this, 'ui_coins'); done(); } }));
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
    if (node.type === 'boss') {
      // act boss beaten: next act, or after act 3 the final battle against the Void God
      if (run().act < LAST_ACT) { advanceAct(); save(); this.scene.start('Act'); }
      else this.scene.start('Act', { final: true });
      return;
    }
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(210, () => this.scene.start('Map'));
  }
}
