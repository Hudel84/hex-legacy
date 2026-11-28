import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR, FONT_BODY } from '../core/theme';
import { playSfx, playMusic } from '../core/audio';
import { img, sfx, loadRunUi, loadPortrait } from '../core/assets';

const NODE_MUSIC: Record<string, string> = { shop: 'mus_shop', rest: 'mus_rest', event: 'mus_event', treasure: 'mus_event', shrine: 'mus_event' };
import {
  run, save, addLeadership, applyBoon, BOONS, rng, commitRng, MAX_UNIT_LEVEL, MAX_SLOTS, nodeById, rebalance, unitDef, type ArmySlot, heroTotals,
} from '../run/state';
import { eventById, type EventOutcome } from '../run/events';
import { buildEnemy, battleConfig, globalFloor, shopNeutrals, neutralPrice } from '../run/encounters';
import { ArmyPanel } from '../ui/ArmyPanel';
import { bonus } from '../meta/meta';
import { ASC, ascOf } from '../run/ascension';
import { addLoot, lootFor, owner, grantPerk, learnSpell, spellReward, perkFactor } from '../run/state';
import { rollItem, rollConsumable, sellPrice, ITEM_PRICE, ITEMS, CONSUMABLES, type ItemInst } from '../run/items';
import { stashItem, slotsFor, bagFull, beltFull, addConsumable, sellItem, addToBag, heroFaction } from '../run/state';
import { itemName, itemInfo, consumableName, consumableDesc, rarityName } from '../ui/itemUi';
import { loadSpellIcons, spellName } from '../ui/spellUi';
import { openUpgradeChoice, levelLabel, roleName, upgradeName } from '../ui/upgradeUi';
import { roleOf } from '../run/upgrades';
import { levelUpUnit } from '../run/state';
import { offer, perkById, artifactPrice } from '../run/perks';
import { perkLines } from '../ui/perkUi';
import { panel, titleStyle, inkStyle } from '../ui/widgets';
import { Button } from '../ui/Button';

type Kind = 'shop' | 'rest' | 'treasure' | 'shrine' | 'event';

interface Opt { label: string; hint?: string; price?: number; enabled?: boolean; action: () => void; }

const BG: Record<Exclude<Kind, 'event'>, string> = {
  shop: 'ui_node_shop_bg', rest: 'ui_node_rest_bg', treasure: 'ui_node_treasure_bg', shrine: 'ui_node_shrine_bg',
};

/** Shop discount: Marketplace (city) + Gold talent, max. 60 %. */
const shopDiscount = (): number => Math.min(0.6, bonus.shopDiscount() + perkFactor('discount'));
/** Price factor: discounts, and ascension 6 (hard times: +25 %). */
const priceMult = (): number => (1 - shopDiscount()) * ASC.shop(ascOf(run()));

export class NodeScene extends Phaser.Scene {
  private kind: Kind = 'shop';
  private eventId = '';
  private box!: Phaser.GameObjects.Container;
  private armyPanel!: ArmyPanel;
  private shopNeutral: string[] | null = null;
  private shopArtifact: string | null = null;
  private shopItems: ItemInst[] | null = null;
  private shopCons: string[] | null = null;

  constructor() { super('Node'); }

  init(data: { kind: Kind; eventId?: string }): void {
    this.kind = data.kind;
    this.eventId = data.eventId ?? '';
    this.shopNeutral = null;
    this.shopArtifact = null;
    this.shopItems = null;
    this.shopCons = null;
  }

  preload(): void {
    loadRunUi(this);
    ArmyPanel.preload(this);
    loadSpellIcons(this);
    if (this.kind === 'event') {
      const ev = eventById(this.eventId);
      img(this, ev.image, `events/${ev.image}.webp`);
    } else {
      img(this, BG[this.kind], `ui/screens/${BG[this.kind]}.webp`);
    }
    const mus = NODE_MUSIC[this.kind];
    if (mus) sfx(this, mus, `audio/music/${mus}.ogg`);
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    if (NODE_MUSIC[this.kind]) playMusic(this, NODE_MUSIC[this.kind]);
    if (this.kind === 'event') {
      const ev = eventById(this.eventId);
      const bg = this.add.image(w / 2, h / 2, ev.image).setDisplaySize(w, h).setAlpha(0.35);
      void bg;
      this.add.rectangle(0, 0, w, h, 0x000000, 0.45).setOrigin(0);
      const pic = this.add.image(765, 480, ev.image);
      pic.setScale(690 / pic.width);
      const fr = this.add.graphics();
      fr.lineStyle(6, 0xb8862c, 1).strokeRect(pic.x - pic.displayWidth / 2, pic.y - pic.displayHeight / 2, pic.displayWidth, pic.displayHeight);
    } else {
      this.add.image(w / 2, h / 2, BG[this.kind]).setDisplaySize(w, h);
      this.add.rectangle(0, 0, w, h, 0x000000, 0.2).setOrigin(0);
    }
    this.armyPanel = new ArmyPanel(this, 10, 20);
    this.box = this.add.container(0, 0);
    this.cameras.main.fadeIn(250);
    playMusic(this, 'mus_map_act1');

    switch (this.kind) {
      case 'shop': this.shop(); break;
      case 'rest': this.rest(); break;
      case 'treasure': this.treasure(); break;
      case 'shrine': this.shrine(); break;
      case 'event': this.event(); break;
    }
  }

  // ---------- generic layout ----------

  private show(title: string, text: string, opts: Opt[]): void {
    this.box.removeAll(true);
    const ev = this.kind === 'event';
    const x = ev ? 1500 : 1320, W = ev ? 760 : 820;
    const H = 980;
    this.box.add(panel(this, x, 540, W, H, 'ui_panel_parchment', 60));
    this.box.add(this.add.text(x, 110, title, { ...titleStyle(40, '#4a2c10'), stroke: '#00000000', strokeThickness: 0 }).setOrigin(0.5));
    const body = this.add.text(x, 170, text, { ...inkStyle(28), color: '#2b1a0c', align: 'center', wordWrap: { width: W - 120 }, lineSpacing: 4 }).setOrigin(0.5, 0);
    this.box.add(body);
    let y = Math.max(300, 170 + body.height + 30);
    const need = opts.reduce((a, o) => a + (o.hint ? 112 : 84), 0);
    const squeeze = Math.min(1, (1010 - y) / need);
    for (const o of opts) {
      const row = this.optionRow(x, y, W - 110, o);
      if (squeeze < 1) row.setScale(1, Math.max(0.82, squeeze));
      this.box.add(row);
      y += (o.hint ? 112 : 84) * squeeze;
    }
    this.armyPanel.refresh();
  }

  private optionRow(x: number, y: number, w: number, o: Opt): Phaser.GameObjects.Container {
    const enabled = o.enabled !== false;
    const h = o.hint ? 98 : 70;
    const c = this.add.container(x, y + h / 2);
    const g = this.add.graphics();
    const draw = (hover: boolean) => {
      g.clear();
      g.fillStyle(enabled ? (hover ? 0x5a3a1e : 0x3b2614) : 0x2a221b, enabled ? 0.92 : 0.8).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
      g.lineStyle(3, hover ? 0xf3d48a : enabled ? 0x8a6a2b : 0x5a4a3a, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    };
    draw(false);
    c.add(g);
    const lb = this.add.text(-w / 2 + 22, o.hint ? -h / 2 + 10 : 0, o.label, {
      fontFamily: FONT_BODY, fontSize: '26px', fontStyle: '700', color: enabled ? COLOR.gold : '#b3a58a',
    }).setOrigin(0, o.hint ? 0 : 0.5);
    if (lb.width > w - 170) lb.setScale((w - 170) / lb.width);
    c.add(lb);
    if (o.hint) {
      // with a large text setting the hint shrinks until it fits into the row
      const top = lb.y + lb.displayHeight;
      for (let size = 20; size >= 11; size--) {
        const ht = this.add.text(-w / 2 + 22, top, o.hint, {
          fontFamily: FONT_BODY, fontSize: `${size}px`, color: enabled ? '#e8dcc0' : '#a89a80', wordWrap: { width: w - 170 },
        });
        if (top + ht.height <= h / 2 - 4 || size === 11) { c.add(ht); break; }
        ht.destroy();
      }
    }
    if (o.price !== undefined) {
      const gi = this.add.image(w / 2 - 105, 0, 'icon_gold'); gi.setScale(34 / gi.width);
      c.add(gi);
      c.add(this.add.text(w / 2 - 82, 0, String(o.price), { fontFamily: FONT_BODY, fontSize: '28px', fontStyle: '700', color: enabled ? '#ffe9a8' : '#e07a6a' }).setOrigin(0, 0.5));
    }
    c.setSize(w, h);
    if (enabled) {
      c.setInteractive({ useHandCursor: true });
      c.on('pointerover', () => { draw(true); playSfx(this, 'ui_hover'); });
      c.on('pointerout', () => draw(false));
      c.on('pointerup', () => { playSfx(this, 'ui_click'); o.action(); });
    }
    return c;
  }

  private leaveOpt(label = t('node.leave')): Opt {
    return { label, action: () => this.leave() };
  }

  /** The node is done: a reload no longer opens it again. */
  private settle(): void { delete run().pendingNode; }

  private leave(): void {
    this.settle();
    save();
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(210, () => this.scene.start('Map'));
  }

  private result(title: string, text: string): void {
    this.settle();
    save();
    this.show(title, text, [this.leaveOpt(t('common.continue'))]);
  }

  /** Let the player choose one of the army slots (for upgrades). */
  private chooseSlot(title: string, filter: (s: ArmySlot) => boolean, then: (s: ArmySlot) => void, back: () => void, price?: (s: ArmySlot) => number, replace = false): void {
    const r = run();
    const opts: Opt[] = r.army.map((s) => ({
      label: `${t(`unit.${s.unitId}`)}  ${levelLabel(s)}`,
      hint: replace ? `${roleName(roleOf(unitDef(s.unitId)))} · ${t('shop.replaceHint', { n: s.level })}`
        : s.level < MAX_UNIT_LEVEL ? `${roleName(roleOf(unitDef(s.unitId)))} · ${t('node.upgradeHint')}` : t('node.maxLevel'),
      price: price?.(s),
      enabled: filter(s),
      action: () => then(s),
    }));
    opts.push({ label: t('common.back'), action: back });
    this.show(title, t(replace ? 'shop.replaceText' : 'node.chooseUnit'), opts);
  }

  // ---------- shop ----------

  private shop(): void {
    const r = run();
    // the shop (v0.19, Ben 27.11.): artifact (expensive), equipment and two neutral creatures to hire - no training, spells or upgrades
    if (this.shopNeutral === null) {
      const g = rng();
      this.shopNeutral = shopNeutrals(g, r.currentNode !== null ? nodeById(r.currentNode).floor : 0);
      commitRng(g);
    }
    const opts: Opt[] = [{ label: t('shop.gear'), hint: t('shop.gearHint'), action: () => this.gearShop() }];
    for (const id of this.shopNeutral) {
      const d = unitDef(id);
      const cost = Math.round(neutralPrice(id) * priceMult());
      const full = r.army.length >= MAX_SLOTS;
      opts.push({
        label: t('shop.neutral', { unit: t(`unit.${id}`), tier: d.tier }),
        hint: `${t('shop.neutralStack', { n: Math.max(1, Math.floor(r.leadership / d.cost)) })}${full ? ' · ' + t('shop.neutralReplace') : ''}`,
        price: cost, enabled: r.gold >= cost,
        action: () => {
          const hire = (slot: ArmySlot | null) => {
            if (r.gold < cost) { playSfx(this, 'ui_error'); return; }
            r.gold -= cost;
            const unit: ArmySlot = { unitId: id, alloc: 0, level: 0, ups: [] };
            if (slot) r.army[r.army.indexOf(slot)] = unit; else r.army.push(unit);
            rebalance();
            this.shopNeutral = this.shopNeutral!.filter((x) => x !== id);
            playSfx(this, 'ui_buy'); save(); this.shop();
            // portrait of the new unit for the army panel (not preloaded)
            if (!this.textures.exists(`portrait_${id}`)) {
              loadPortrait(this, id);
              this.load.once('complete', () => this.armyPanel.refresh());
              this.load.start();
            }
          };
          if (!full) hire(null);
          else this.chooseSlot(t('shop.replaceTitle', { unit: t(`unit.${id}`) }), () => true, (s2) => hire(s2), () => this.shop(), undefined, true);
        },
      });
    }
    if (this.shopArtifact === null) {
      const g = rng();
      this.shopArtifact = offer('artifact', 1, owner(), g)[0]?.id ?? '';
      commitRng(g);
    }
    if (this.shopArtifact) {
      const p = perkById(this.shopArtifact);
      // artifacts are expensive (x1.5 in v0.19)
      const cost = Math.round(artifactPrice(p) * priceMult());
      opts.push({
        label: t('shop.artifact', { name: t(`perk.${p.id}`) }), hint: perkLines(p).join(' · '), price: cost, enabled: r.gold >= cost,
        action: () => { r.gold -= cost; grantPerk(p.id); this.shopArtifact = ''; playSfx(this, 'ui_buy'); save(); this.shop(); },
      });
    }
    opts.push(this.leaveOpt());
    this.show(t('node.shop'), t('shop.text'), opts);
  }

  private floor(): number { const r = run(); return globalFloor(r.currentNode !== null ? nodeById(r.currentNode).floor : 0); }

  /** Equipment: two items and two consumables for sale, and selling from the backpack. */
  private gearShop(): void {
    const r = run();
    if (this.shopItems === null) {
      const g = rng();
      this.shopItems = [rollItem(g, this.floor()), rollItem(g, this.floor(), 'rare')];
      this.shopCons = [rollConsumable(g), rollConsumable(g)];
      commitRng(g);
    }
    const disc = priceMult();
    const opts: Opt[] = [];
    for (const it of this.shopItems) {
      const d = ITEMS[it.id];
      const cost = Math.round(ITEM_PRICE[d.rarity] * disc);
      const room = slotsFor(it).some((k) => !r.equip?.[k]) || !bagFull();
      const info = itemInfo(it, heroFaction());
      opts.push({
        label: `${itemName(it.id)} (${rarityName(d.rarity)})`,
        hint: info.lines.slice(0, -1).map((l) => l.text).slice(0, 4).join(' · '),
        price: cost, enabled: r.gold >= cost && room,
        action: () => {
          r.gold -= cost; stashItem(it); this.shopItems = this.shopItems!.filter((x) => x !== it);
          playSfx(this, 'ui_buy'); save(); this.gearShop();
        },
      });
    }
    for (const id of this.shopCons ?? []) {
      const cost = Math.round(CONSUMABLES[id].price * disc);
      opts.push({
        label: consumableName(id), hint: consumableDesc(id, heroTotals(r).power), price: cost, enabled: r.gold >= cost && !beltFull(),
        action: () => {
          r.gold -= cost; addConsumable(id); const i = this.shopCons!.indexOf(id); this.shopCons!.splice(i, 1);
          playSfx(this, 'ui_buy'); save(); this.gearShop();
        },
      });
    }
    opts.push({ label: t('shop.sell'), hint: t('shop.sellHint'), enabled: (r.bag ?? []).length > 0, action: () => this.sellMenu() });
    opts.push({ label: t('common.back'), action: () => this.shop() });
    this.show(t('shop.gear'), t(bagFull() ? 'shop.gearTextFull' : 'shop.gearText'), opts);
  }

  private sellMenu(): void {
    const r = run();
    const opts: Opt[] = (r.bag ?? []).map((it) => ({
      label: t('shop.sellItem', { name: itemName(it.id), n: sellPrice(it) }),
      hint: itemInfo(it, heroFaction()).lines.slice(0, -1).map((l) => l.text).slice(0, 3).join(' · '),
      action: () => { sellItem(it.uid); playSfx(this, 'ui_coins'); save(); this.sellMenu(); },
    }));
    opts.push({ label: t('common.back'), action: () => this.gearShop() });
    this.show(t('shop.sell'), t('shop.sellText'), opts);
  }

  private rest(): void {
    const r = run();
    this.show(t('node.rest'), t('rest.text'), [
      {
        label: t('rest.upgrade'), hint: t('rest.upgradeHint'), enabled: r.army.some((s) => s.level < MAX_UNIT_LEVEL),
        action: () => this.chooseSlot(t('rest.upgrade'), (s) => s.level < MAX_UNIT_LEVEL, (s) => {
          openUpgradeChoice(this, s, (up) => {
            levelUpUnit(s, up); playSfx(this, 'ui_equip');
            if (bonus.campLeadership()) addLeadership(bonus.campLeadership());
            this.result(t('node.rest'), t('rest.upgraded', { unit: t(`unit.${s.unitId}`), up: up ? upgradeName(up) : '' }));
          }, () => this.rest());
        }, () => this.rest()),
      },
      {
        label: t('rest.drill'), hint: t('rest.drillHint', { n: bonus.campDrill() }),
        action: () => { addLeadership(bonus.campDrill() + bonus.campLeadership()); playSfx(this, 'ui_levelup'); this.result(t('node.rest'), t('rest.drilled', { n: bonus.campDrill() + bonus.campLeadership() })); },
      },
    ]);
  }

  // ---------- treasure ----------

  private treasure(): void {
    const r = run();
    const g = rng();
    const gold = g.int(40, 70);
    const boon = g.next() < 0.5 ? g.pick(BOONS.filter((b) => b !== 'gold60')) : null;
    commitRng(g);
    r.gold += gold;
    if (boon) applyBoon(boon);
    addLoot(lootFor('treasure', 6));
    const g2 = rng();
    const art = g2.next() < 0.4 ? offer('artifact', 1, owner(), g2)[0] : undefined;
    commitRng(g2);
    if (art) grantPerk(art.id);
    const g3 = rng();
    const scroll = g3.next() < 0.35 ? spellReward(g3) : null;
    const item = g3.next() < 0.5 ? rollItem(g3, this.floor()) : null;
    const cons = g3.next() < 0.3 ? rollConsumable(g3) : null;
    commitRng(g3);
    const stash = item ? stashItem(item) : null;
    const consOk = cons ? addConsumable(cons) : false;
    if (cons && !consOk) r.gold += Math.round(CONSUMABLES[cons].price * 0.4);
    if (scroll) learnSpell(scroll.id);
    playSfx(this, 'ui_reward');
    save();
    const lvl = scroll ? r.spells?.find((x) => x.id === scroll.id)?.level ?? 1 : 1;
    const text = t('treasure.text', { gold }) + (boon ? `\n\n${t('treasure.boon', { boon: t(`boon.${boon}`) })}` : '')
      + (art ? `\n\n${t('treasure.artifact', { name: t(`perk.${art.id}`) })}\n${perkLines(art).join(' · ')}` : '')
      + (scroll ? `\n\n${t(scroll.kind === 'learn' ? 'treasure.spell' : 'treasure.spellUp', { spell: spellName(scroll.id), n: lvl })}` : '')
      + (item && stash ? `\n\n${t(`treasure.item_${stash.where}`, { name: itemName(item.id), n: stash.gold })}` : '')
      + (cons ? `\n${t(consOk ? 'treasure.cons' : 'treasure.consSold', { name: consumableName(cons) })}` : '');
    this.show(t('node.treasure'), text, [this.leaveOpt(t('common.continue'))]);
  }

  // ---------- shrine ----------

  private shrine(): void {
    const r = run();
    this.show(t('node.shrine'), t('shrine.text'), [
      {
        label: t('shrine.offer'), hint: t('shrine.offerHint'), price: 40, enabled: r.gold >= 40,
        action: () => { r.gold -= 40; r.atk += 1; r.def += 1; playSfx(this, 'ui_talent_pick'); this.result(t('node.shrine'), t('shrine.blessed')); },
      },
      {
        label: t('shrine.oath'), hint: t('shrine.oathHint'), enabled: r.leadership > 60,
        action: () => {
          r.leadership -= 15;
          const excess = r.army.reduce((a, s) => a + s.alloc, 0) - r.leadership;
          if (excess > 0) rebalance();
          r.atk += 3; playSfx(this, 'ui_talent_pick');
          this.result(t('node.shrine'), t('shrine.sworn'));
        },
      },
      this.leaveOpt(),
    ]);
  }

  // ---------- events ----------

  private event(): void {
    const r = run();
    const ev = eventById(this.eventId);
    this.show(t(`event.${ev.id}.title`), t(`event.${ev.id}.text`), ev.options.map((o) => ({
      label: t(o.key),
      hint: o.hint ? t(o.hint) : undefined,
      enabled: o.can ? o.can(r) : true,
      action: () => this.outcome(o.run(r)),
    })));
  }

  private outcome(o: EventOutcome): void {
    // forge (v0.20.7): the player picks the upgrade of the forged unit (before: a random one)
    const slot = o.upgrade ? run().army.find((s) => s.unitId === o.upgrade && s.level < MAX_UNIT_LEVEL) : undefined;
    if (slot) {
      openUpgradeChoice(this, slot, (up) => {
        levelUpUnit(slot, up); playSfx(this, 'ui_equip');
        this.outcome({ ...o, upgrade: undefined });
      });
      return;
    }
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(o.vars ?? {})) vars[k] = typeof v === 'string' && v.includes('.') ? t(v) : v;
    this.settle();
    save();
    const ev = eventById(this.eventId);
    if (o.battle) {
      const b = o.battle;
      this.show(t(`event.${ev.id}.title`), t(o.text, vars), [{
        label: t('event.toBattle'),
        action: () => {
          const node = nodeById(run().currentNode!);
          const cfg = battleConfig(node, buildEnemy({ ...node, type: 'battle' }, b.group), b.rewardMul);
          save();
          this.scene.start('Battle', { config: cfg });
        },
      }]);
      return;
    }
    this.show(t(`event.${ev.id}.title`), t(o.text, vars), [this.leaveOpt(t('common.continue'))]);
  }
}
