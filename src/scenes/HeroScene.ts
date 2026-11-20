// Hero screen (GDD 5.3): equipment panel with 9 item places and 3 belt places, backpack, hero values, effects and sets.
// Opened as an overlay from the map and node screens (the calling scene is paused meanwhile).
import Phaser from 'phaser';
import { t } from '../core/i18n';
import { playSfx } from '../core/audio';
import { img, loadRunUi } from '../core/assets';
import {
  run, save, heroTotals, equipped, equipItem, unequip, heroFaction, playerMods, slotsFor,
} from '../run/state';
import { heroById } from '../run/heroes';
import { EQUIP_SLOTS, ITEMS, BAG_SIZE as BAG_LIMIT, setCounts, type EquipSlot, type ItemInst } from '../run/items';
import { maxMana } from '../battle/spells';
import { NO_MODS, type SideMods } from '../battle/mods';
import { panel, titleStyle, textStyle } from '../ui/widgets';
import { Button, toast } from '../ui/Button';
import { tooltip } from '../ui/perkUi';
import {
  loadItemAssets, itemIcon, consumableIcon, itemInfo, itemInfoBlock, consumableName, consumableDesc, effectLines, SLOT_PLACEHOLDER,
} from '../ui/itemUi';
import { loadSpellIcons } from '../ui/spellUi';

/** Open the hero screen on top of `from` (map or node screen). */
export function openHero(from: Phaser.Scene): void {
  if (from.scene.isActive('Hero')) return;
  from.scene.pause();
  from.scene.launch('Hero', { caller: from.scene.key });
}

// equipment panel art: 1550x2100 source coordinates of its 12 places (ui_equipment_panel_slots.json)
const SRC_H = 2100;
const PLACES: Record<string, [number, number]> = {
  head: [182, 410], amulet: [182, 724], chest: [182, 1047], cloak: [182, 1372],
  weapon: [1174, 410], offhand: [1174, 724], ring1: [1174, 1047], ring2: [1174, 1372],
  boots: [182, 1704], belt0: [513, 1704], belt1: [844, 1704], belt2: [1174, 1704],
};
const PLACE_W = 194;
const PANEL_H = 960;
const PANEL_X = 70, PANEL_Y = 60;

type Drop = { kind: 'equip'; slot: EquipSlot } | { kind: 'bag' };

export class HeroScene extends Phaser.Scene {
  private caller = 'Map';
  private layer!: Phaser.GameObjects.Container;
  private detail!: Phaser.GameObjects.Container;
  private f = PANEL_H / SRC_H;
  private bagRects: Phaser.Geom.Rectangle[] = [];
  private slotRects = new Map<EquipSlot, Phaser.Geom.Rectangle>();

  constructor() { super('Hero'); }

  init(data: { caller?: string }): void { this.caller = data.caller ?? 'Map'; }

  preload(): void {
    loadRunUi(this);
    img(this, 'ui_hero_screen_bg', 'ui/hero_screen/ui_hero_screen_bg.webp');
    img(this, 'ui_equipment_panel', 'ui/hero_screen/ui_equipment_panel.webp');
    const r = run();
    img(this, `herobattle_${r.heroId}`, `heroes_battle/${r.heroId}_battle.webp`);
    loadItemAssets(this, [...equipped(r), ...(r.bag ?? [])].map((i) => i.id));
    loadSpellIcons(this, []);
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.add.image(w / 2, h / 2, 'ui_hero_screen_bg').setDisplaySize(w, h);
    this.add.rectangle(0, 0, w, h, 0x000000, 0.35).setOrigin(0);
    const pn = this.add.image(PANEL_X, PANEL_Y, 'ui_equipment_panel').setOrigin(0);
    pn.setScale(PANEL_H / pn.height);
    this.f = pn.displayHeight / SRC_H;
    // the hero stands in the silhouette
    const hk = `herobattle_${run().heroId}`;
    if (this.textures.exists(hk)) {
      const hi = this.add.image(PANEL_X + 775 * this.f, PANEL_Y + 1620 * this.f, hk).setOrigin(0.5, 1);
      hi.setScale(1150 * this.f / hi.height).setAlpha(0.95);
    }
    this.add.text(PANEL_X + 775 * this.f, PANEL_Y + 165 * this.f, t(`hero.${run().heroId}`), titleStyle(30)).setOrigin(0.5);

    this.layer = this.add.container(0, 0);
    this.detail = this.add.container(0, 0);
    this.input.dragDistanceThreshold = 10;
    new Button(this, 1730, 600, t('hero.close'), { width: 300, fontSize: 26, onClick: () => this.close() }).setDepth(10);
    this.input.keyboard?.on('keydown-ESC', () => this.close());
    this.input.keyboard?.on('keydown-I', () => this.close());
    this.refresh();
    playSfx(this, 'ui_open', 0.6);
  }

  private close(): void {
    save();
    const c = this.scene.get(this.caller);
    this.scene.stop();
    c.scene.resume();
    c.events.emit('hero-closed');
  }

  private place(key: string): { x: number; y: number; s: number } {
    const [x, y] = PLACES[key];
    const s = PLACE_W * this.f;
    return { x: PANEL_X + x * this.f + s / 2, y: PANEL_Y + y * this.f + s / 2, s };
  }

  // ---------- drawing ----------

  private refresh(): void {
    const r = run();
    this.layer.removeAll(true);
    this.slotRects.clear();
    const faction = heroFaction(r);
    const sets = setCounts(equipped(r));

    // equipment places
    for (const slot of EQUIP_SLOTS) {
      const p = this.place(slot);
      this.slotRects.set(slot, new Phaser.Geom.Rectangle(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s));
      const it = r.equip?.[slot];
      if (!it) { this.placeholder(p, SLOT_PLACEHOLDER[slot], t(`itemSlot.${slot.startsWith('ring') ? 'ring' : slot}`)); continue; }
      const ic = itemIcon(this, p.x, p.y, it, p.s * 0.96);
      this.makeItem(ic, it, { kind: 'equip', slot }, () => {
        if (!unequip(slot)) { toast(this, t('hero.bagFull')); playSfx(this, 'ui_error'); return; }
        playSfx(this, 'ui_equip'); this.refresh();
      }, sets[ITEMS[it.id].set ?? ''] ?? 0, faction);
    }
    // belt
    (r.belt ?? []).forEach((id, i) => {
      const p = this.place(`belt${i}`);
      if (!id) { this.placeholder(p, 'slot_consumable', t('hero.beltEmpty')); return; }
      const ic = consumableIcon(this, p.x, p.y, id, p.s * 0.92);
      ic.setInteractive();
      ic.on('pointerover', () => this.showConsumable(id));
      this.layer.add(ic);
    });

    // right side: values
    const X = 860, W = 1000;
    const tot = heroTotals(r);
    const base = { atk: r.atk, def: r.def, power: r.power ?? 0, knowledge: r.knowledge ?? 0, lead: r.leadership };
    this.layer.add(panel(this, X + 250, 260, 500, 420));
    this.layer.add(this.add.text(X + 250, 112, t('hero.values'), titleStyle(28)).setOrigin(0.5));
    const rows: [string, string, number, number, string?][] = [
      ['icon_atk', 'stat.atk', base.atk, tot.atk], ['icon_def', 'stat.def', base.def, tot.def],
      ['icon_power', 'stat.power', base.power, tot.power], ['icon_knowledge', 'stat.knowledge', base.knowledge, tot.knowledge, t('hero.mana', { n: maxMana(tot.knowledge) })],
      ['icon_lead', 'stat.lead', base.lead, tot.lead],
    ];
    rows.forEach(([icon, label, b, total, extra], i) => {
      const y = 150 + i * 56;
      if (this.textures.exists(icon)) { const ic = this.add.image(X + 70, y + 14, icon); ic.setScale(38 / Math.max(ic.width, ic.height)); this.layer.add(ic); }
      this.layer.add(this.add.text(X + 100, y, t(label), textStyle(22, '#e8dcc0')));
      const bonus = total - b;
      this.layer.add(this.add.text(X + 330, y, String(total), textStyle(24, '#ffffff', true)).setOrigin(1, 0));
      if (bonus) this.layer.add(this.add.text(X + 340, y + 2, `(${bonus > 0 ? '+' : ''}${bonus})`, textStyle(20, bonus > 0 ? '#9fe39f' : '#e07a6a')));
      if (extra) this.layer.add(this.add.text(X + 100, y + 26, extra, textStyle(16, '#9fd0ff')));
    });

    // effects of equipment (incl. sets) and talents/artifacts
    this.layer.add(panel(this, X + 760, 260, 480, 420));
    this.layer.add(this.add.text(X + 760, 112, t('hero.effects'), titleStyle(28)).setOrigin(0.5));
    const m = playerMods(r);
    const diff: Partial<SideMods> = {};
    for (const [k, v] of Object.entries(m) as [keyof SideMods, number][]) if (v !== NO_MODS[k]) diff[k] = v;
    const lines = effectLines({}, diff);
    const et = this.add.text(X + 565, 148, lines.length ? lines.join('\n') : t('hero.noEffects'),
      { ...textStyle(lines.length > 8 ? 16 : 19, '#efe3c8'), wordWrap: { width: 390 }, lineSpacing: 2 });
    this.layer.add(et);
    const activeSets = Object.entries(sets).filter(([, n]) => n >= 2);
    if (activeSets.length) {
      this.layer.add(this.add.text(X + 565, 148 + et.height + 8, activeSets.map(([id, n]) => `${t(`set.${id}`)} ${n}/3`).join('\n'), textStyle(18, '#5fe0c0', true)));
    }

    // backpack
    const bag = r.bag ?? [];
    this.layer.add(this.add.text(X, 490, t('hero.bag', { n: bag.length, max: BAG_LIMIT }), titleStyle(26)));
    this.bagRects = [];
    for (let i = 0; i < BAG_LIMIT; i++) {
      const x = X + 65 + i * 128, y = 600, s = 110;
      this.bagRects.push(new Phaser.Geom.Rectangle(x - s / 2, y - s / 2, s, s));
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.45).fillRoundedRect(x - s / 2, y - s / 2, s, s, 12).lineStyle(2, 0x8a6a2b, 1).strokeRoundedRect(x - s / 2, y - s / 2, s, s, 12);
      this.layer.add(g);
      const it = bag[i];
      if (!it) continue;
      const ic = itemIcon(this, x, y, it, s * 0.92);
      this.makeItem(ic, it, { kind: 'bag' }, () => {
        const gold = equipItem(it);
        playSfx(this, 'ui_equip');
        if (gold) toast(this, t('hero.soldOld', { n: gold }));
        this.refresh();
      }, sets[ITEMS[it.id].set ?? ''] ?? 0, faction);
    }
    this.layer.add(this.add.text(X + 530, 545, t('hero.help'), { ...textStyle(17, '#d9c7a0'), wordWrap: { width: 190 } }));
    this.showHint();
  }

  private placeholder(p: { x: number; y: number; s: number }, key: string, label: string): void {
    if (!this.textures.exists(key)) return;
    const ph = this.add.image(p.x, p.y, key).setAlpha(0.35);
    ph.setScale(p.s * 0.7 / Math.max(ph.width, ph.height));
    ph.setInteractive();
    tooltip(this, ph, label, [t('hero.emptySlot')]);
    this.layer.add(ph);
  }

  /** Hover shows details, click moves the item (equip / to the backpack), dragging works too. */
  private makeItem(ic: Phaser.GameObjects.Container, it: ItemInst, from: Drop, click: () => void, setCount: number, faction: string): void {
    this.layer.add(ic);
    ic.setInteractive({ useHandCursor: true, draggable: true });
    const home = { x: ic.x, y: ic.y };
    let dragging = false;
    ic.on('pointerover', () => this.showItem(it, setCount, faction, from));
    ic.on('dragstart', () => { dragging = true; ic.setDepth(50); this.layer.bringToTop(ic); });
    ic.on('drag', (_p: Phaser.Input.Pointer, x: number, y: number) => ic.setPosition(x, y));
    ic.on('dragend', (p: Phaser.Input.Pointer) => {
      const target = this.dropAt(p.worldX, p.worldY);
      ic.setPosition(home.x, home.y);
      this.time.delayedCall(0, () => { dragging = false; });
      if (!target) return;
      this.drop(it, from, target);
    });
    ic.on('pointerup', () => { if (!dragging) { playSfx(this, 'ui_click'); click(); } });
  }

  private dropAt(x: number, y: number): Drop | null {
    for (const [slot, rc] of this.slotRects) if (rc.contains(x, y)) return { kind: 'equip', slot };
    if (this.bagRects.some((rc) => rc.contains(x, y))) return { kind: 'bag' };
    return null;
  }

  private drop(it: ItemInst, from: Drop, to: Drop): void {
    if (to.kind === 'bag' && from.kind === 'equip') {
      if (!unequip(from.slot)) { toast(this, t('hero.bagFull')); playSfx(this, 'ui_error'); return; }
    } else if (to.kind === 'equip') {
      if (!slotsFor(it).includes(to.slot)) { toast(this, t('hero.wrongSlot')); playSfx(this, 'ui_error'); return; }
      const r = run();
      if (from.kind === 'equip') {
        // swap two rings
        const other = r.equip?.[to.slot] ?? null;
        r.equip![to.slot] = it;
        r.equip![from.slot] = other;
      } else {
        const gold = equipItem(it, to.slot);
        if (gold) toast(this, t('hero.soldOld', { n: gold }));
      }
    } else return;
    playSfx(this, 'ui_equip');
    this.refresh();
  }

  // ---------- details on the right ----------

  private showHint(): void {
    this.detail.removeAll(true);
    this.detail.add(panel(this, 1360, 868, 1000, 390));
    this.detail.add(this.add.text(1360, 868, t('hero.hover'), textStyle(22, '#c9b896')).setOrigin(0.5));
  }

  private showItem(it: ItemInst, setCount: number, faction: string, from: Drop): void {
    const r = run();
    this.detail.removeAll(true);
    this.detail.add(panel(this, 1360, 868, 1000, 390));
    const info = itemInfo(it, faction, setCount);
    itemInfoBlock(this, this.detail, 905, 715, 520, info, 18);
    // comparison: what would change if this item were put on (or taken off)
    const before = heroTotals(r);
    const sim = JSON.parse(JSON.stringify(r));
    if (from.kind === 'bag') equipItem(it, undefined, sim); else unequip(from.slot, sim);
    const after = heroTotals(sim);
    const ch = (['atk', 'def', 'power', 'knowledge', 'lead'] as const)
      .filter((k) => after[k] !== before[k])
      .map((k) => `${t(`stat.${k}`)} ${after[k] > before[k] ? '+' : ''}${after[k] - before[k]}`);
    const head = from.kind === 'bag' ? t('hero.ifEquip') : t('hero.ifRemove');
    this.detail.add(this.add.text(1460, 715, head, titleStyle(22)));
    const old = from.kind === 'bag' ? slotsFor(it).map((s) => r.equip?.[s]).find(Boolean) : null;
    const txt = (ch.length ? ch.join('\n') : t('hero.noChange')) + (old ? `\n\n${t('hero.replaces', { name: t(`item.${old.id}`) })}` : '');
    this.detail.add(this.add.text(1460, 752, txt, { ...textStyle(20, '#efe3c8'), wordWrap: { width: 380 } }));
  }

  private showConsumable(id: string): void {
    this.detail.removeAll(true);
    this.detail.add(panel(this, 1360, 868, 1000, 390));
    this.detail.add(this.add.text(905, 715, consumableName(id), textStyle(28, '#ffe08a', true)));
    this.detail.add(this.add.text(905, 757, t('hero.consumable'), textStyle(19, '#c9b896')));
    this.detail.add(this.add.text(905, 795, consumableDesc(id, heroTotals().power), { ...textStyle(21, '#efe3c8'), wordWrap: { width: 900 } }));
    void heroById;
  }
}
