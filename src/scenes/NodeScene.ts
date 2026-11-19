import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR, FONT_BODY } from '../core/theme';
import { playSfx, playMusic } from '../core/audio';
import { img, loadRunUi } from '../core/assets';
import {
  run, save, addLeadership, applyBoon, BOONS, rng, commitRng, MAX_UNIT_LEVEL, MAX_SLOTS, nodeById, draftPool, rebalance, unitDef, type ArmySlot,
} from '../run/state';
import { eventById, type EventOutcome } from '../run/events';
import { buildEnemy, battleConfig } from '../run/encounters';
import { ArmyPanel } from '../ui/ArmyPanel';
import { panel, titleStyle, inkStyle } from '../ui/widgets';
import { Button } from '../ui/Button';

type Kind = 'shop' | 'rest' | 'treasure' | 'shrine' | 'event';

interface Opt { label: string; hint?: string; price?: number; enabled?: boolean; action: () => void; }

const BG: Record<Exclude<Kind, 'event'>, string> = {
  shop: 'ui_node_shop_bg', rest: 'ui_node_rest_bg', treasure: 'ui_node_treasure_bg', shrine: 'ui_node_shrine_bg',
};

export class NodeScene extends Phaser.Scene {
  private kind: Kind = 'shop';
  private eventId = '';
  private box!: Phaser.GameObjects.Container;
  private armyPanel!: ArmyPanel;
  private shopUnit: string | null = null;

  constructor() { super('Node'); }

  init(data: { kind: Kind; eventId?: string }): void {
    this.kind = data.kind;
    this.eventId = data.eventId ?? '';
    this.shopUnit = null;
  }

  preload(): void {
    loadRunUi(this);
    ArmyPanel.preload(this);
    if (this.kind === 'event') {
      const ev = eventById(this.eventId);
      img(this, ev.image, `events/${ev.image}.webp`);
    } else {
      img(this, BG[this.kind], `ui/screens/${BG[this.kind]}.webp`);
    }
    if (this.kind === 'shop') for (const id of draftPool('human', 99)) img(this, `portrait_${id}`, unitDef(id).portrait);
  }

  create(): void {
    const { width: w, height: h } = this.scale;
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
    let y = Math.max(330, 170 + body.height + 40);
    for (const o of opts) {
      const row = this.optionRow(x, y, W - 110, o);
      this.box.add(row);
      y += o.hint ? 112 : 84;
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
    c.add(this.add.text(-w / 2 + 22, o.hint ? -h / 2 + 14 : 0, o.label, {
      fontFamily: FONT_BODY, fontSize: '26px', fontStyle: '700', color: enabled ? COLOR.gold : '#b3a58a',
    }).setOrigin(0, o.hint ? 0 : 0.5));
    if (o.hint) {
      c.add(this.add.text(-w / 2 + 22, -h / 2 + 52, o.hint, {
        fontFamily: FONT_BODY, fontSize: '20px', color: enabled ? '#e8dcc0' : '#a89a80', wordWrap: { width: w - 170 },
      }));
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

  private leave(): void {
    save();
    this.cameras.main.fadeOut(200);
    this.time.delayedCall(210, () => this.scene.start('Map'));
  }

  private result(title: string, text: string): void {
    save();
    this.show(title, text, [this.leaveOpt(t('common.continue'))]);
  }

  /** Let the player choose one of the army slots (for upgrades). */
  private chooseSlot(title: string, filter: (s: ArmySlot) => boolean, then: (s: ArmySlot) => void, back: () => void): void {
    const r = run();
    const opts: Opt[] = r.army.map((s) => ({
      label: `${t(`unit.${s.unitId}`)}  ${'★'.repeat(s.level)}${'☆'.repeat(MAX_UNIT_LEVEL - s.level)}`,
      hint: s.level < MAX_UNIT_LEVEL ? t('node.upgradeHint') : t('node.maxLevel'),
      enabled: filter(s),
      action: () => then(s),
    }));
    opts.push({ label: t('common.back'), action: back });
    this.show(title, t('node.chooseUnit'), opts);
  }

  // ---------- shop ----------

  private price(base: number): number { return base + 15 * run().shopBuys; }

  private shop(): void {
    const r = run();
    if (this.shopUnit === null) {
      const g = rng();
      const floor = r.currentNode !== null ? nodeById(r.currentNode).floor : 0;
      const pool = draftPool('human', floor).filter((id) => !r.army.some((s) => s.unitId === id));
      this.shopUnit = pool.length ? g.pick(pool) : '';
      commitRng(g);
    }
    const buy = (cost: number, fn: () => void) => () => {
      if (r.gold < cost) { playSfx(this, 'ui_error'); return; }
      r.gold -= cost; r.shopBuys++; fn(); playSfx(this, 'ui_buy'); save(); this.shop();
    };
    const opts: Opt[] = [
      { label: t('shop.atk'), hint: t('shop.atkHint'), price: this.price(45), enabled: r.gold >= this.price(45), action: buy(this.price(45), () => { r.atk += 1; }) },
      { label: t('shop.def'), hint: t('shop.defHint'), price: this.price(45), enabled: r.gold >= this.price(45), action: buy(this.price(45), () => { r.def += 1; }) },
      { label: t('shop.lead'), hint: t('shop.leadHint'), price: this.price(50), enabled: r.gold >= this.price(50), action: buy(this.price(50), () => addLeadership(15)) },
      {
        label: t('shop.upgrade'), hint: t('shop.upgradeHint'), price: 70,
        enabled: r.gold >= 70 && r.army.some((s) => s.level < MAX_UNIT_LEVEL),
        action: () => this.chooseSlot(t('shop.upgrade'), (s) => s.level < MAX_UNIT_LEVEL, (s) => {
          r.gold -= 70; s.level++; playSfx(this, 'ui_equip'); save(); this.shop();
        }, () => this.shop()),
      },
    ];
    if (this.shopUnit) {
      const id = this.shopUnit;
      const cost = 40 + unitDef(id).tier * 20;
      const full = r.army.length >= MAX_SLOTS;
      opts.push({
        label: t('shop.unit', { unit: t(`unit.${id}`) }),
        hint: full ? t('shop.unitFull') : t('shop.unitHint'),
        price: cost, enabled: r.gold >= cost && !full,
        action: () => {
          r.gold -= cost; r.army.push({ unitId: id, alloc: 0, level: 0 }); rebalance(); this.shopUnit = '';
          playSfx(this, 'ui_buy'); save(); this.scene.restart({ kind: 'shop' });
        },
      });
    }
    opts.push(this.leaveOpt());
    this.show(t('node.shop'), t('shop.text'), opts);
  }

  // ---------- rest ----------

  private rest(): void {
    const r = run();
    this.show(t('node.rest'), t('rest.text'), [
      {
        label: t('rest.upgrade'), hint: t('rest.upgradeHint'), enabled: r.army.some((s) => s.level < MAX_UNIT_LEVEL),
        action: () => this.chooseSlot(t('rest.upgrade'), (s) => s.level < MAX_UNIT_LEVEL, (s) => {
          s.level++; playSfx(this, 'ui_equip');
          this.result(t('node.rest'), t('rest.upgraded', { unit: t(`unit.${s.unitId}`) }));
        }, () => this.rest()),
      },
      {
        label: t('rest.drill'), hint: t('rest.drillHint'),
        action: () => { addLeadership(12); playSfx(this, 'ui_levelup'); this.result(t('node.rest'), t('rest.drilled')); },
      },
    ]);
  }

  // ---------- treasure ----------

  private treasure(): void {
    const r = run();
    const g = rng();
    const gold = g.int(70, 110);
    const boon = g.next() < 0.5 ? g.pick(BOONS.filter((b) => b !== 'gold60')) : null;
    commitRng(g);
    r.gold += gold;
    if (boon) applyBoon(boon);
    playSfx(this, 'ui_reward');
    save();
    const text = t('treasure.text', { gold }) + (boon ? `\n\n${t('treasure.boon', { boon: t(`boon.${boon}`) })}` : '');
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
    const vars: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(o.vars ?? {})) vars[k] = typeof v === 'string' && v.includes('.') ? t(v) : v;
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
