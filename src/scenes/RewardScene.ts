import { rankByLetter, rateLoot, fmtMult } from '../run/rating';
import { settings } from '../core/settings';
import { PASSIVE_MODS } from '../battle/passives';
import { passiveDesc } from '../ui/UnitInfo';
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
import { offer, bossRelics, type PerkDef } from '../run/perks';
import { levelUpOptions, takeThemeRank, rankUpgrades, chooseTalentUpgrade, themeRank, applyBoon, addLeadership } from '../run/state';
import { levelOptionCard, themeName, rankLabel } from '../ui/talentUi';
import { spellName } from '../ui/spellUi';
import { perkCard, loadPerkIcons, KIND_COLOR } from '../ui/perkUi';
import { bonus } from '../meta/meta';
import type { RunBattleConfig } from '../run/encounters';
import { card, titleStyle, textStyle, stat, resRow, panel } from '../ui/widgets';
import { Button, toast } from '../ui/Button';
import { openUpgradeChoice, levelLabel } from '../ui/upgradeUi';
import { levelUpUnit } from '../run/state';


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
  private relicDone = false;
  /** Treasure goblin killed: bonus gold and an extra item. */
  private treasure = false;
  private treasureGold = 0;
  private extraItems: ItemInst[] = [];
  /** Battle rating (S..D) from the battle screen; multiplies the meta resources. */
  private rank: ReturnType<typeof rankByLetter>;

  constructor() { super('Reward'); }

  init(data: { config: RunBattleConfig; treasure?: boolean; rank?: string }): void {
    this.rank = rankByLetter(data.rank);
    this.cfg = data.config; this.artifactDone = false; this.itemFind = null; this.consFind = null; this.eliteItem = null;
    this.relicDone = false; this.treasure = !!data.treasure; this.treasureGold = 0; this.extraItems = [];
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
      // talents (Plunder): more and better finds, sometimes an artifact
      if (g.next() < 0.35 + perkFactor('item')) this.itemFind = rollItem(g, globalFloor(node.floor), perkFactor('itemRare') > 0 ? 'rare' : undefined);
      if (g.next() < 0.15 + perkFactor('cons')) this.consFind = rollConsumable(g);
      this.artifactDone = !(g.next() < perkFactor('artifact'));
    }
    if (this.treasure) {
      const gf = globalFloor(node.floor);
      this.treasureGold = Math.round((40 + gf * 6) * (1 + perkFactor('gold')));
      this.extraItems.push(rollItem(g, gf + 2, 'rare'));
    }
    commitRng(g);
    this.draft = pool.slice(0, 3 + perkFactor('draft'));
    loadItemAssets(this, [this.itemFind, this.eliteItem, ...this.extraItems, ...equipped(), ...(run().bag ?? [])].filter((x): x is ItemInst => !!x).map((x) => x.id));
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
    r.gold += this.cfg.reward.gold + this.treasureGold + perkFactor('goldWin');
    if (perkFactor('leadWin') > 0) addLeadership(perkFactor('leadWin'));
    r.battlesWon++;
    this.levelUps = gainXp(this.cfg.reward.xp);
    const node = nodeById(this.cfg.nodeId);
    this.loot = rateLoot(lootFor(node.type, node.floor), this.rank?.mult ?? 1) as Record<string, number>;
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
    if (this.rank) {
      const rk = this.rank;
      this.layer.add(this.add.text(w / 2, 440, t('rating.line', { rank: rk.rank }) + (rk.mult > 1 ? '  ·  ' + t('rating.bonus', { x: fmtMult(rk.mult, settings.lang) }) : ''),
        textStyle(24, rk.color, true)).setOrigin(0.5));
    }
    if (this.treasure) {
      this.layer.add(this.add.text(w / 2, this.rank ? 500 : 470, t('reward.treasureGoblin', { n: this.treasureGold }), textStyle(30, '#ffe08a', true)).setOrigin(0.5));
    }
    this.time.delayedCall(1300, () => this.next());
  }

  private next(): void {
    if (this.levelUps > 0) { this.levelUp(); return; }
    const node = nodeById(this.cfg.nodeId);
    if (node.type === 'boss' && !this.relicDone) { this.relicChoice(); return; }
    if (node.type !== 'boss' && !this.artifactDone) { this.artifactChoice(); return; }
    if (!this.itemFind && this.extraItems.length) this.itemFind = this.extraItems.shift()!;
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
    if (r.pendingTalent) { this.talentUpgrade(); return; }
    this.layer.add(this.add.text(w / 2, 238, t('reward.chooseTalent'), textStyle(30)).setOrigin(0.5));
    const g = rng();
    const opts = levelUpOptions(g);
    commitRng(g);
    const gap = opts.length > 3 ? 330 : 360;
    // Oracle (city): roll new level-up choices a few times per run
    if ((r.rerolls ?? 0) > 0 && opts.some((o) => o.kind === 'new')) {
      this.layer.add(new Button(this, w / 2, 1010, t('talent.reroll', { n: r.rerolls ?? 0 }), {
        width: 380, fontSize: 24, onClick: () => { r.rerolls = (r.rerolls ?? 1) - 1; save(); this.next(); },
      }));
    }
    opts.forEach((o, i) => {
      const x = w / 2 + (i - (opts.length - 1) / 2) * gap;
      const cur = o.kind === 'boon' ? 0 : themeRank(o.theme);
      this.layer.add(levelOptionCard(this, x, 620, o, cur, () => {
        playSfx(this, 'ui_talent_pick');
        if (o.kind === 'boon') { applyBoon(o.boon); this.levelUps--; save(); this.next(); return; }
        const before = new Set((r.spells ?? []).map((s) => s.id));
        takeThemeRank(o.theme);
        save();
        const learned = (r.spells ?? []).find((s) => !before.has(s.id));
        if (learned) toast(this, t('talent.spellLearned', { spell: spellName(learned.id) }));
        this.talentUpgrade();
      }));
    });
  }

  /** The upgrade of the rank just gained: one of three, rank 3 one of two legendary ones. */
  private talentUpgrade(): void {
    const { width: w } = this.scale;
    const pt = run().pendingTalent!;
    const opts = rankUpgrades(pt.theme, pt.rank);
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, `${themeName(pt.theme)} · ${rankLabel(pt.rank)}`, titleStyle(56)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 195, t(pt.rank === 3 ? 'talent.chooseLegendary' : 'talent.chooseUpgrade'), textStyle(30)).setOrigin(0.5));
    opts.forEach((p, i) => {
      this.layer.add(perkCard(this, w / 2 + (i - (opts.length - 1) / 2) * 360, 590, p, () => {
        chooseTalentUpgrade(p.id);
        this.levelUps--;
        save();
        playSfx(this, 'ui_equip');
        this.next();
      }));
    });
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
    this.layer.add(this.add.text(w / 2, 120, t(this.eliteItem ? 'reward.eliteTitle' : 'reward.artifact'), titleStyle(60)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 195, t(this.eliteItem ? 'reward.chooseArtifactOrItem' : 'reward.chooseArtifact'), textStyle(30)).setOrigin(0.5));
    const n = opts.length + (this.eliteItem ? 1 : 0);
    const xs = (i: number) => w / 2 + (i - (n - 1) / 2) * 360;
    opts.forEach((p, i) => this.layer.add(perkCard(this, xs(i), 590, p, () => { grantPerk(p.id); save(); playSfx(this, 'ui_equip'); this.next(); })));
    const it = this.eliteItem;
    if (it) {
      const info = itemInfo(it, heroFaction());
      this.layer.add(card(this, xs(opts.length), 590, {
        w: 300, h: 520, portrait: itemIconKey(it.id), title: info.title, subtitle: info.sub, subtitleColor: info.color,
        tag: t('kind.item'), tagColor: KIND_COLOR.item,
        lines: info.lines.slice(0, -1).map((l) => l.text), lineSize: 19,
        onClick: () => { this.itemFind = it; playSfx(this, 'ui_equip'); this.next(); },
      }));
    }
  }


  /** After a boss: one of three legendary boss relics (the boss's own and two others). */
  private relicChoice(): void {
    const { width: w } = this.scale;
    this.relicDone = true;
    const bossId = this.cfg.setup.enemy.army.find((a) => a.def.id.startsWith('boss_'))?.def.id ?? '';
    const g = rng();
    const opts = bossRelics(bossId, owner(), g);
    commitRng(g);
    if (!opts.length) { this.next(); return; }
    playSfx(this, 'ui_reward');
    this.clear();
    this.layer.add(this.add.text(w / 2, 120, t('reward.relic'), titleStyle(60)).setOrigin(0.5));
    this.layer.add(this.add.text(w / 2, 195, t('reward.chooseRelic'), textStyle(30)).setOrigin(0.5));
    opts.forEach((p, i) => {
      const c = perkCard(this, w / 2 + (i - (opts.length - 1) / 2) * 360, 590, p, () => { grantPerk(p.id); save(); playSfx(this, 'ui_equip'); this.next(); });
      if (p.boss === bossId) this.layer.add(this.add.text(c.x, 300, t('reward.relicOwn'), textStyle(22, '#ffb347', true)).setOrigin(0.5));
      this.layer.add(c);
    });
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
    // right column (tester feedback v0.20.4): what is worn there now, with its stats, and what equipping would change
    const RX = w / 2 + 250, RW = 380;
    const head = this.add.text(RX, 270, t('reward.wornNow'), titleStyle(24));
    this.layer.add(head);
    let ry = head.y + head.height + 10;
    if (free || !cur.length) {
      const ft = this.add.text(RX, ry, t('reward.slotFree'), textStyle(22, '#9fe39f'));
      this.layer.add(ft); ry += ft.height + 12;
    } else {
      // one worn item: full stats; two (rings): both, smaller
      const room = 330 / cur.length;
      for (const c of cur) {
        this.layer.add(itemIcon(this, RX + 34, ry + 34, c, 68));
        const block = this.add.container(0, 0);
        this.layer.add(block);
        let hgt = 0;
        for (let size = cur.length > 1 ? 16 : 19; size >= 11; size--) {
          block.removeAll(true);
          hgt = itemInfoBlock(this, block, RX + 80, ry, RW - 80, itemInfo(c, heroFaction(), sets[ITEMS[c.id].set ?? ''] ?? 0), size);
          if (hgt <= room - 8) break;
        }
        ry += Math.max(hgt, 72) + 10;
      }
    }
    // stat changes if the found item is put on
    const before = heroTotals(r);
    const sim = JSON.parse(JSON.stringify(r));
    equipItem(it, undefined, sim);
    const after = heroTotals(sim);
    const ch = (['atk', 'def', 'power', 'knowledge', 'lead'] as const).filter((k) => after[k] !== before[k]);
    const ih = this.add.text(RX, Math.max(ry + 6, 600), t('hero.ifEquip'), titleStyle(22));
    this.layer.add(ih);
    const lines = ch.length ? ch.map((k) => `${t(`stat.${k}`)} ${after[k] > before[k] ? '+' : ''}${after[k] - before[k]}`) : [t('hero.noChange')];
    let ly = ih.y + ih.height + 4;
    ch.length ? ch.forEach((k, i) => {
      const tx = this.add.text(RX, ly, lines[i], textStyle(21, after[k] > before[k] ? '#9fe39f' : '#ff9a8a', true));
      this.layer.add(tx); ly += tx.height + 2;
    }) : this.layer.add(this.add.text(RX, ly, lines[0], { ...textStyle(18, '#d9c7a0'), wordWrap: { width: RW } }));
    void itemName;
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
        ...(d.passives ?? []).map((p) => (PASSIVE_MODS[p] ? `${t(`passiveName.${p}`)}: ${passiveDesc(p)}` : t(`passive.${p}`))),
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
    this.layer.add(new Button(this, w / 2, h - 80, t('reward.skip'), { width: 380, fontSize: 26, onClick: () => { r.gold += 10; save(); this.finish(); } }));
  }

  private pick(id: string): void {
    const r = run();
    const owned = r.army.find((s) => s.unitId === id);
    if (owned) {
      openUpgradeChoice(this, owned, (up) => { levelUpUnit(owned, up); save(); this.finish(); }, () => this.showDraft());
      return;
    }
    if (r.army.length < MAX_SLOTS) {
      r.army.push({ unitId: id, alloc: 0, level: 0, ups: [] });
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
        subtitle: levelLabel(s),
        onClick: () => { r.army[i] = { unitId: id, alloc: s.alloc, level: 0, ups: [] }; rebalance(); save(); this.finish(); },
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
