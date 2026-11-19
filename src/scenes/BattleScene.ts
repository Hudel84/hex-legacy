import Phaser from 'phaser';
import { Battle, type Action, type BattleSetup } from '../battle/engine';
import { type Hex, key, eq, allHexes } from '../battle/hex';
import type { BattleEvent, Stack, Side, UnitDef } from '../battle/types';
import { UNITS } from '../data/units';
import { t } from '../core/i18n';
import { FONT_TITLE, FONT_BODY, COLOR } from '../core/theme';
import { playMusic, playSfx } from '../core/audio';
import { settings } from '../core/settings';
import { Button } from '../ui/Button';

const A = 'assets/';

// ---- board geometry (pointy-top hexes, squashed for a slight top-down perspective) ----
const HEX_W = 150;
const SQUASH = 0.6;
const HEX_R = HEX_W / Math.sqrt(3);            // corner radius before squash
const ROW_STEP = HEX_R * 1.5 * SQUASH;
const GRID_X0 = (1920 - (9 * HEX_W + HEX_W / 2)) / 2 + HEX_W / 2;
const GRID_Y0 = 430;
const TIER_SCALE = [0, 0.78, 0.88, 1.0, 1.1, 1.3, 1.5];
const BASE_H = 150;

function hexCenter(h: Hex): { x: number; y: number } {
  return { x: GRID_X0 + h.col * HEX_W + (h.row % 2 ? HEX_W / 2 : 0), y: GRID_Y0 + h.row * ROW_STEP };
}
function hexPoly(h: Hex, shrink = 0): Phaser.Math.Vector2[] {
  const c = hexCenter(h);
  const r = HEX_R - shrink;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Phaser.Math.DegToRad(60 * i - 30);
    pts.push(new Phaser.Math.Vector2(c.x + r * Math.cos(a), c.y + r * Math.sin(a) * SQUASH));
  }
  return pts;
}
function pixelToHex(x: number, y: number): Hex | null {
  let best: Hex | null = null;
  let bestD = Infinity;
  for (const h of allHexes()) {
    const c = hexCenter(h);
    const d = (c.x - x) ** 2 + ((c.y - y) / SQUASH) ** 2;
    if (d < bestD) { bestD = d; best = h; }
  }
  return bestD <= HEX_R * HEX_R ? best : null;
}

interface StackView {
  stack: Stack;
  box: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  plate: Phaser.GameObjects.Container;
  countText: Phaser.GameObjects.Text;
}

const sheetKey = (d: UnitDef) => `sheet_${d.id}`;
const portraitKey = (d: UnitDef) => `portrait_${d.id}`;
const unitName = (d: UnitDef) => t(`unit.${d.id}`);

export interface BattleConfig {
  setup: BattleSetup;
  playerHero: string;
  enemyHero?: string;
  background: string;
}

export function testBattleConfig(): BattleConfig {
  const seed = Math.floor(Math.random() * 1e9);
  const army = (list: [string, number][]) => list.map(([id, count]) => ({ def: UNITS[id], count }));
  return {
    playerHero: 'human_hero_knight_commander',
    enemyHero: 'undead_hero_necromancer',
    background: 'bg_act1_meadows',
    setup: {
      seed,
      obstacles: Battle.randomObstacles(seed),
      player: { hero: { atk: 2, def: 2 }, army: army([['human_t1_spearman', 12], ['human_t2_crossbowman', 5], ['human_t3_swordsman', 2]]) },
      enemy: { hero: { atk: 1, def: 1 }, army: army([['undead_t1_skeleton', 16], ['undead_t2_zombie', 5], ['undead_t3_ghost', 2]]) },
    },
  };
}

/** Test helper: screen position of a stack (game coordinates). */
(window as unknown as { __stackXY: (uid: number) => [number, number] | null }).__stackXY = (uid: number) => {
  const g = (window as unknown as { game: Phaser.Game }).game;
  const sc = g.scene.getScene('Battle') as unknown as { battle: Battle };
  const s = sc.battle.stack(uid);
  if (!s || s.count <= 0) return null;
  const c = hexCenter(s.pos);
  return [c.x, c.y];
};

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private battle!: Battle;
  private views = new Map<number, StackView>();
  private gridG!: Phaser.GameObjects.Graphics;
  private hiG!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  private activeRing!: Phaser.GameObjects.Image;
  private infoText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private initBar!: Phaser.GameObjects.Container;
  private btnWait!: Button;
  private btnDefend!: Button;
  private btnAuto!: Button;
  private auto = false;
  private inputOpen = false;
  private resolveInput: (() => void) | null = null;
  private reach = new Map<string, Hex[]>();
  private ambient?: Phaser.Sound.BaseSound;

  constructor() { super('Battle'); }

  init(data: { config?: BattleConfig }): void {
    this.cfg = data.config ?? testBattleConfig();
    this.views.clear();
    this.logLines = [];
    this.auto = false;
    this.inputOpen = false;
  }

  preload(): void {
    const { width: w, height: h } = this.scale;
    const txt = this.add.text(w / 2, h / 2, '…', { fontFamily: FONT_TITLE, fontSize: '40px', color: COLOR.gold }).setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => txt.setText(`${Math.round(p * 100)}%`));

    const bg = this.cfg.background;
    this.load.image(bg, `${A}backgrounds/${bg}.webp`);
    this.load.video(`${bg}_loop`, `${A}backgrounds/animated/${bg}_loop.mp4`, true);
    const defs = new Set<UnitDef>();
    for (const side of ['player', 'enemy'] as Side[]) for (const a of this.cfg.setup[side].army) defs.add(a.def);
    for (const d of defs) {
      if (!this.textures.exists(sheetKey(d))) this.load.spritesheet(sheetKey(d), A + d.sheet, { frameWidth: 320, frameHeight: 320 });
      if (!this.textures.exists(portraitKey(d))) this.load.image(portraitKey(d), A + d.portrait);
    }
    for (const hero of [this.cfg.playerHero, this.cfg.enemyHero].filter(Boolean) as string[]) {
      this.load.image(`herobattle_${hero}`, `${A}heroes_battle/${hero}_battle.webp`);
    }
    const imgs: [string, string][] = [
      ['vfx_ring_selected', 'vfx/feedback/vfx_ring_selected'], ['vfx_ring_target', 'vfx/feedback/vfx_ring_target'],
      ['vfx_hit_slash', 'vfx/impacts/vfx_hit_slash'], ['vfx_hit_blunt', 'vfx/impacts/vfx_hit_blunt'],
      ['vfx_hit_pierce', 'vfx/impacts/vfx_hit_pierce'], ['vfx_hit_heal', 'vfx/impacts/vfx_hit_heal'],
      ['vfx_hit_death_smoke', 'vfx/impacts/vfx_hit_death_smoke'], ['vfx_hit_curse', 'vfx/impacts/vfx_hit_curse'],
      ['vfx_proj_crossbow_bolt', 'vfx/projectiles/vfx_proj_crossbow_bolt'], ['vfx_proj_shadow_bolt', 'vfx/projectiles/vfx_proj_shadow_bolt'],
      ['vfx_status_defense_buff', 'vfx/status/vfx_status_defense_buff'],
      ['obstacle_boulders', 'map/objects/mapdeco_boulders'],
      ['ui_victory_screen', 'ui/screens/ui_victory_screen'], ['ui_defeat_screen', 'ui/screens/ui_defeat_screen'],
      ['ui_icon_hourglass', 'ui/ui_icon_hourglass'],
    ];
    for (const [k, p] of imgs) if (!this.textures.exists(k)) this.load.image(k, `${A}${p}.webp`);
    const sfx = ['cb_move', 'cb_fly', 'cb_hit_sword', 'cb_hit_claw', 'cb_hit_blunt', 'cb_hit_bolt', 'cb_counter', 'cb_block',
      'cb_heal', 'cb_death_human', 'cb_death_undead', 'cb_turn_start', 'sp_death_cast', 'ev_victory_crowd', 'cb_crit'];
    for (const k of sfx) if (!this.cache.audio.exists(k)) this.load.audio(k, `${A}audio/sfx/${k}.ogg`);
    if (!this.cache.audio.exists('mus_battle')) this.load.audio('mus_battle', `${A}audio/music/mus_battle.ogg`);
    if (!this.cache.audio.exists('amb_meadows')) this.load.audio('amb_meadows', `${A}audio/ambient/amb_meadows.ogg`);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => txt.destroy());
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.battle = new Battle(this.cfg.setup);

    // background with animated loop on top
    const bgKey = this.cfg.background;
    this.add.image(w / 2, h / 2, bgKey).setDisplaySize(w, h);
    const vid = this.add.video(w / 2, h / 2, `${bgKey}_loop`).setAlpha(0);
    vid.setLoop(true); vid.setMute(true); vid.play(true);
    const poll = this.time.addEvent({
      delay: 100, repeat: 80, callback: () => {
        const el = vid.video;
        if (el && el.readyState >= 2 && el.currentTime > 0 && vid.frame.width > 1) {
          poll.remove(); vid.setDisplaySize(w, h);
          this.tweens.add({ targets: vid, alpha: 1, duration: 800 });
        }
      },
    });
    // slight vignette so the board reads better
    const vg = this.add.graphics();
    vg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
    vg.fillRect(0, 0, w, 220);
    vg.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.7, 0.7);
    vg.fillRect(0, h - 200, w, 200);

    // heroes at the sides
    const ph = this.add.image(125, 640, `herobattle_${this.cfg.playerHero}`).setOrigin(0.5, 1);
    ph.setScale(380 / ph.height);
    if (this.cfg.enemyHero) {
      const eh = this.add.image(w - 125, 640, `herobattle_${this.cfg.enemyHero}`).setOrigin(0.5, 1).setFlipX(true);
      eh.setScale(380 / eh.height);
    }
    this.add.text(125, 650, t(`hero.${this.cfg.playerHero}`), this.smallLabel()).setOrigin(0.5, 0);
    if (this.cfg.enemyHero) this.add.text(w - 125, 650, t(`hero.${this.cfg.enemyHero}`), this.smallLabel()).setOrigin(0.5, 0);

    // grid
    this.gridG = this.add.graphics();
    this.hiG = this.add.graphics();
    this.hoverG = this.add.graphics();
    this.drawGrid();
    for (const k of this.battle.obstacles) {
      const [c, r] = k.split(',').map(Number);
      const p = hexCenter({ col: c, row: r });
      const ob = this.add.image(p.x, p.y + 30, 'obstacle_boulders').setOrigin(0.5, 1);
      ob.setScale(135 / ob.width).setDepth(p.y);
    }

    this.activeRing = this.add.image(0, 0, 'vfx_ring_selected').setVisible(false).setDepth(1);
    this.activeRing.setScale(HEX_W * 1.05 / this.activeRing.width, (HEX_W * 1.05 / this.activeRing.width) * 0.8);
    this.tweens.add({ targets: this.activeRing, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });

    for (const s of this.battle.stacks) this.createView(s);

    // HUD
    this.initBar = this.add.container(w / 2, 78).setDepth(2000);
    this.infoText = this.add.text(w / 2, h - 92, '', {
      fontFamily: FONT_BODY, fontSize: '28px', color: COLOR.light, stroke: '#000', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5).setDepth(2000);
    this.logText = this.add.text(30, h - 18, '', {
      fontFamily: FONT_BODY, fontSize: '21px', color: '#e8dcc0', stroke: '#000', strokeThickness: 4, lineSpacing: 1,
    }).setOrigin(0, 1).setDepth(2000);

    const bx = w - 150;
    this.btnWait = new Button(this, bx, h - 205, t('battle.wait'), { width: 250, fontSize: 26, onClick: () => this.playerAction({ type: 'wait' }) });
    this.btnDefend = new Button(this, bx, h - 125, t('battle.defend'), { width: 250, fontSize: 26, onClick: () => this.playerAction({ type: 'defend' }) });
    this.btnAuto = new Button(this, bx, h - 45, t('battle.auto'), { width: 250, fontSize: 26, onClick: () => this.toggleAuto() });
    for (const b of [this.btnWait, this.btnDefend, this.btnAuto]) b.setDepth(2000);

    // input
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onHover(p.worldX, p.worldY));
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length === 0) this.onClick(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown-W', () => this.playerAction({ type: 'wait' }));
    this.input.keyboard?.on('keydown-D', () => this.playerAction({ type: 'defend' }));

    playMusic(this, 'mus_battle');
    const startAmbient = () => {
      this.ambient = this.sound.add('amb_meadows', { loop: true, volume: settings.sfxVolume * 0.35 });
      this.ambient.play();
    };
    if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, startAmbient); else startAmbient();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.ambient?.stop(); this.ambient?.destroy(); });

    this.log(t('battle.help'));
    this.setButtonsEnabled(false);
    this.time.delayedCall(400, () => this.loop());
  }

  private smallLabel(): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT_TITLE, fontSize: '22px', fontStyle: '700', color: COLOR.gold, stroke: '#000', strokeThickness: 5 };
  }

  // ---------- views ----------

  private createView(s: Stack): void {
    const p = hexCenter(s.pos);
    const box = this.add.container(p.x, p.y);
    const shadow = this.add.ellipse(0, 0, HEX_W * 0.62, HEX_W * 0.2, 0x000000, 0.35);
    const sk = sheetKey(s.def);
    const animKey = `${sk}_idle`;
    if (!this.anims.exists(animKey)) {
      this.anims.create({ key: animKey, frames: this.anims.generateFrameNumbers(sk, { start: 0, end: 31 }), frameRate: 8, repeat: -1 });
    }
    const sprite = this.add.sprite(0, 6, sk).setOrigin(0.5, 0.95);
    sprite.setScale((BASE_H * TIER_SCALE[s.def.tier]) / 320 * 1.3);
    sprite.play({ key: animKey, startFrame: Math.floor(Math.random() * 32) });
    if (s.side === 'enemy') sprite.setFlipX(true);

    const plateX = s.side === 'player' ? 42 : -42;
    const plateBg = this.add.graphics();
    const col = s.side === 'player' ? 0x1f3f7a : 0x7a1f1f;
    plateBg.fillStyle(col, 0.95).fillRoundedRect(-30, -15, 60, 30, 8);
    plateBg.lineStyle(2, 0xf3d48a, 1).strokeRoundedRect(-30, -15, 60, 30, 8);
    const countText = this.add.text(0, 0, String(s.count), {
      fontFamily: FONT_BODY, fontSize: '23px', fontStyle: '700', color: '#ffffff',
    }).setOrigin(0.5);
    const plate = this.add.container(plateX, 16, [plateBg, countText]);

    box.add([shadow, sprite, plate]);
    box.setDepth(p.y + 10);
    this.views.set(s.uid, { stack: s, box, sprite, plate, countText });
  }

  private setCount(uid: number, n: number): void {
    const v = this.views.get(uid);
    if (!v) return;
    v.countText.setText(String(n));
    this.tweens.add({ targets: v.plate, scale: { from: 1.35, to: 1 }, duration: 250 });
  }

  // ---------- grid drawing ----------

  private drawGrid(): void {
    const g = this.gridG;
    g.clear();
    for (const h of allHexes()) {
      if (this.battle.obstacles.has(key(h))) continue;
      g.fillStyle(0x000000, 0.10).fillPoints(hexPoly(h, 2), true);
      g.lineStyle(2, 0xfff2cc, 0.28).strokePoints(hexPoly(h, 2), true, true);
    }
  }

  private drawHighlights(): void {
    const g = this.hiG;
    g.clear();
    const s = this.battle.active;
    if (!s || !this.inputOpen) return;
    for (const [, path] of this.reach) {
      const h = path[path.length - 1];
      g.fillStyle(0x6fb6ff, 0.28).fillPoints(hexPoly(h, 4), true);
      g.lineStyle(2, 0xa8d4ff, 0.6).strokePoints(hexPoly(h, 4), true, true);
    }
    const shoot = this.battle.canShoot(s);
    for (const e of this.battle.enemiesOf(s)) {
      const can = shoot || this.battle.meleeFrom(s, e, this.reach).length > 0;
      if (!can) continue;
      g.fillStyle(0xff5040, 0.30).fillPoints(hexPoly(e.pos, 4), true);
      g.lineStyle(3, 0xff8a70, 0.85).strokePoints(hexPoly(e.pos, 4), true, true);
    }
  }

  // ---------- turn loop ----------

  private async loop(): Promise<void> {
    while (!this.battle.winner) {
      await this.play(this.battle.nextTurn());
      if (this.battle.winner) break;
      const s = this.battle.active!;
      this.updateInitBar();
      this.showActive(s);
      if (s.side === 'enemy' || this.auto) {
        await this.wait(this.auto ? 250 : 450);
        await this.play(this.battle.act(this.battle.decide()));
      } else {
        await this.awaitPlayer(s);
      }
    }
    this.activeRing.setVisible(false);
    this.hiG.clear(); this.hoverG.clear();
    await this.wait(600);
    this.showResult(this.battle.winner!);
  }

  private awaitPlayer(s: Stack): Promise<void> {
    this.reach = this.battle.reachable(s);
    this.inputOpen = true;
    this.setButtonsEnabled(true);
    this.btnWait.setEnabled(!s.waited);
    this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
    this.drawHighlights();
    return new Promise((res) => { this.resolveInput = res; });
  }

  private async playerAction(a: Action): Promise<void> {
    if (!this.inputOpen || !this.battle.isLegal(a)) return;
    this.inputOpen = false;
    this.setButtonsEnabled(false);
    this.hiG.clear(); this.hoverG.clear();
    this.infoText.setText('');
    await this.play(this.battle.act(a));
    const r = this.resolveInput; this.resolveInput = null; r?.();
  }

  private toggleAuto(): void {
    this.auto = !this.auto;
    this.btnAuto.setLabel(t(this.auto ? 'battle.autoOn' : 'battle.auto'));
    if (this.auto && this.inputOpen) {
      const a = this.battle.decide();
      void this.playerAction(a);
    }
  }

  private setButtonsEnabled(on: boolean): void {
    this.btnWait.setEnabled(on);
    this.btnDefend.setEnabled(on);
  }

  private showActive(s: Stack): void {
    const p = hexCenter(s.pos);
    this.activeRing.setPosition(p.x, p.y + 4).setVisible(true);
  }

  // ---------- input ----------

  /** Work out what a click at (x,y) would do for the active player stack. */
  private actionAt(x: number, y: number): { action: Action; target?: Stack; from?: Hex } | null {
    const s = this.battle.active;
    if (!s || !this.inputOpen) return null;
    const h = pixelToHex(x, y);
    if (!h) return null;
    const occ = this.battle.stackAt(h);
    if (occ && occ.side !== s.side) {
      if (this.battle.canShoot(s)) return { action: { type: 'shoot', target: occ.uid }, target: occ };
      const opts = this.battle.meleeFrom(s, occ, this.reach);
      if (!opts.length) return null;
      // choose the attack side closest to the mouse (like HoMM)
      let best = opts[0];
      let bd = Infinity;
      for (const o of opts) {
        const c = hexCenter(o);
        const d = (c.x - x) ** 2 + ((c.y - y) / SQUASH) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
      return { action: { type: 'melee', target: occ.uid, from: best }, target: occ, from: best };
    }
    if (!occ && this.reach.has(key(h))) return { action: { type: 'move', to: h } };
    return null;
  }

  private onHover(x: number, y: number): void {
    this.hoverG.clear();
    const h = pixelToHex(x, y);
    const occ = h ? this.battle.stackAt(h) : undefined;
    const a = this.actionAt(x, y);
    const s = this.battle.active;
    if (a && s) {
      const g = this.hoverG;
      if (a.action.type === 'move') {
        for (const step of this.reach.get(key(a.action.to)) ?? []) g.fillStyle(0xffffff, 0.22).fillPoints(hexPoly(step, 10), true);
        g.lineStyle(3, 0xffffff, 0.9).strokePoints(hexPoly(a.action.to, 4), true, true);
        this.input.setDefaultCursor('pointer');
      } else if (a.target) {
        const ranged = a.action.type === 'shoot';
        if (a.from && !eq(a.from, s.pos)) {
          for (const step of this.reach.get(key(a.from)) ?? []) g.fillStyle(0xffffff, 0.22).fillPoints(hexPoly(step, 10), true);
          g.lineStyle(3, 0xffffff, 0.9).strokePoints(hexPoly(a.from, 4), true, true);
        }
        g.lineStyle(4, 0xffd27a, 1).strokePoints(hexPoly(a.target.pos, 2), true, true);
        const pv = this.battle.preview(s, a.target, ranged, a.from ?? s.pos);
        this.infoText.setText(t(ranged ? 'battle.preview.shoot' : 'battle.preview.melee', {
          b: unitName(a.target.def), min: pv.minDmg, max: pv.maxDmg, kmin: pv.minKills, kmax: pv.maxKills, shots: s.shots - 1,
        }));
        this.input.setDefaultCursor('crosshair');
        return;
      }
    } else {
      this.input.setDefaultCursor('default');
    }
    if (occ) this.infoText.setText(this.stackInfo(occ));
    else if (s && this.inputOpen) this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
  }

  private stackInfo(s: Stack): string {
    const d = s.def;
    const tags: string[] = [];
    if (d.ranged) tags.push(t('passive.ranged', { n: s.shots }));
    if (d.flying) tags.push(t('passive.flying'));
    for (const p of d.passives ?? []) tags.push(t(`passive.${p}`));
    return t('battle.info', {
      name: unitName(d), count: s.count, top: s.topHp, hp: d.hp,
      atk: d.atk + this.battle.heroes[s.side].atk, def: d.def + this.battle.heroes[s.side].def,
      dmin: d.dmg[0], dmax: d.dmg[1], ini: d.ini, spd: d.speed,
    }) + (tags.length ? `\n${tags.join('  ·  ')}` : '');
  }

  private onClick(x: number, y: number): void {
    const a = this.actionAt(x, y);
    if (a) void this.playerAction(a.action);
  }

  // ---------- initiative bar ----------

  private updateInitBar(): void {
    this.initBar.removeAll(true);
    const order = this.battle.turnOrder(11);
    let x = 0;
    const items: Phaser.GameObjects.GameObject[] = [];
    let roundMarked = false;
    order.forEach((o, i) => {
      const s = this.battle.stack(o.uid);
      if (o.nextRound && !roundMarked) {
        roundMarked = true;
        const line = this.add.graphics();
        line.lineStyle(3, 0xf3d48a, 0.9).lineBetween(x + 6, -40, x + 6, 40);
        items.push(line, this.add.text(x + 16, 0, t('battle.round', { n: this.battle.round + 1 }).replace(' ', '\n'), {
          fontFamily: FONT_TITLE, fontSize: '17px', fontStyle: '700', color: COLOR.gold, stroke: '#000', strokeThickness: 4,
          align: 'center',
        }).setOrigin(0, 0.5));
        x += 92;
      }
      const size = i === 0 ? 104 : 80;
      const frame = this.add.graphics();
      const col = s.side === 'player' ? 0x3a78d8 : 0xd84a3a;
      frame.fillStyle(0x140d08, 0.9).fillRoundedRect(x, -size / 2, size, size, 10);
      const img = this.add.image(x + size / 2, 0, portraitKey(s.def));
      img.setDisplaySize(size - 8, size - 8);
      if (s.side === 'enemy') img.setFlipX(true);
      const border = this.add.graphics();
      border.lineStyle(i === 0 ? 5 : 3, i === 0 ? 0xf3d48a : col, 1).strokeRoundedRect(x, -size / 2, size, size, 10);
      const cnt = this.add.text(x + size - 6, size / 2 - 4, String(s.count), {
        fontFamily: FONT_BODY, fontSize: i === 0 ? '24px' : '20px', fontStyle: '700', color: '#fff', stroke: '#000', strokeThickness: 4,
      }).setOrigin(1, 1);
      items.push(frame, img, border, cnt);
      x += size + 8;
    });
    this.initBar.add(items);
    this.initBar.x = this.scale.width / 2 - x / 2;
  }

  // ---------- event playback ----------

  private wait(ms: number): Promise<void> {
    return new Promise((res) => this.time.delayedCall(ms, res));
  }

  private tween(cfg: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((res) => this.tweens.add({ ...cfg, onComplete: () => res() }));
  }

  private async play(events: BattleEvent[]): Promise<void> {
    for (const e of events) {
      switch (e.type) {
        case 'round':
          if (e.round > 1) await this.roundBanner(e.round);
          break;
        case 'turn':
          if (this.battle.stack(e.uid).side === 'player' && !this.auto) playSfx(this, 'cb_turn_start', 0.6);
          break;
        case 'move': await this.animMove(e.uid, e.path); break;
        case 'attack': await this.animAttack(e); break;
        case 'heal': await this.animHeal(e.uid, e.amount, e.count); break;
        case 'death': await this.animDeath(e.uid); break;
        case 'wait':
          this.log(t('battle.log.wait', { a: unitName(this.battle.stack(e.uid).def) }));
          this.floatText(e.uid, '⌛', '#f3d48a');
          await this.wait(250);
          break;
        case 'defend': {
          this.log(t('battle.log.defend', { a: unitName(this.battle.stack(e.uid).def) }));
          playSfx(this, 'cb_block');
          const v = this.views.get(e.uid)!;
          const ic = this.add.image(v.box.x, v.box.y - 120, 'vfx_status_defense_buff').setDepth(3000);
          ic.setScale(90 / ic.width);
          await this.tween({ targets: ic, y: ic.y - 40, alpha: 0, duration: 700 });
          ic.destroy();
          break;
        }
        case 'end': break;
      }
    }
  }

  private async roundBanner(n: number): Promise<void> {
    const tx = this.add.text(this.scale.width / 2, 300, t('battle.round', { n }), {
      fontFamily: FONT_TITLE, fontSize: '64px', fontStyle: '900', color: COLOR.gold, stroke: '#2a1608', strokeThickness: 10,
    }).setOrigin(0.5).setAlpha(0).setDepth(3000);
    await this.tween({ targets: tx, alpha: 1, scale: { from: 1.3, to: 1 }, duration: 250 });
    await this.wait(350);
    await this.tween({ targets: tx, alpha: 0, duration: 250 });
    tx.destroy();
  }

  private async animMove(uid: number, path: Hex[]): Promise<void> {
    const v = this.views.get(uid)!;
    this.activeRing.setVisible(false);
    if (v.stack.def.flying) {
      playSfx(this, 'cb_fly', 0.8);
      const to = hexCenter(path[path.length - 1]);
      const dur = 220 + 70 * Math.hypot(to.x - v.box.x, to.y - v.box.y) / HEX_W;
      const sy = v.sprite.y;
      this.tweens.add({ targets: v.sprite, y: sy - 60, duration: dur / 2, yoyo: true, ease: 'Sine.out' });
      await this.tween({ targets: v.box, x: to.x, y: to.y, duration: dur, ease: 'Sine.inOut',
        onUpdate: () => v.box.setDepth(v.box.y + 10) } as Phaser.Types.Tweens.TweenBuilderConfig);
    } else {
      playSfx(this, 'cb_move', 0.7);
      for (const step of path) {
        const to = hexCenter(step);
        if (to.x !== v.box.x) v.sprite.setFlipX(to.x < v.box.x);
        await this.tween({ targets: v.box, x: to.x, y: to.y, duration: 140, onUpdate: () => v.box.setDepth(v.box.y + 10) } as Phaser.Types.Tweens.TweenBuilderConfig);
      }
    }
    v.sprite.setFlipX(v.stack.side === 'enemy');
    v.box.setDepth(v.box.y + 10);
  }

  private hitSound(att: Stack, ranged: boolean): string {
    if (ranged) return 'cb_hit_bolt';
    if (att.def.faction === 'undead') return att.def.id.includes('zombie') ? 'cb_hit_blunt' : 'cb_hit_claw';
    return 'cb_hit_sword';
  }

  private async animAttack(e: Extract<BattleEvent, { type: 'attack' }>): Promise<void> {
    const av = this.views.get(e.uid)!;
    const tv = this.views.get(e.target)!;
    const att = av.stack;
    const name = unitName(att.def);
    const tname = unitName(tv.stack.def);
    const facing = tv.box.x < av.box.x;
    av.sprite.setFlipX(facing);

    if (e.counter) this.floatText(e.uid, t('battle.counter'), '#ffd27a', -150);

    if (e.ranged) {
      const proj = att.def.faction === 'undead' ? 'vfx_proj_shadow_bolt' : 'vfx_proj_crossbow_bolt';
      const sx = av.box.x + (facing ? -40 : 40), sy = av.box.y - 70;
      const tx = tv.box.x, ty = tv.box.y - 60;
      const p = this.add.image(sx, sy, proj).setDepth(3000);
      p.setScale(110 / p.width).setRotation(Math.atan2(ty - sy, tx - sx));
      playSfx(this, att.def.faction === 'undead' ? 'sp_death_cast' : 'cb_counter', 0.5);
      await this.tween({ targets: p, x: tx, y: ty, duration: 120 + Math.hypot(tx - sx, ty - sy) * 0.35 });
      p.destroy();
    } else {
      const dx = (tv.box.x - av.box.x) * 0.35, dy = (tv.box.y - av.box.y) * 0.35;
      const ox = av.box.x, oy = av.box.y;
      await this.tween({ targets: av.box, x: ox + dx, y: oy + dy, duration: 140, ease: 'Quad.in' });
      this.tweens.add({ targets: av.box, x: ox, y: oy, duration: 220, ease: 'Quad.out' });
    }

    // impact
    playSfx(this, this.hitSound(att, e.ranged));
    const fx = this.add.image(tv.box.x, tv.box.y - 70, e.ranged ? 'vfx_hit_pierce' : (att.def.faction === 'undead' ? 'vfx_hit_curse' : 'vfx_hit_slash')).setDepth(3000);
    fx.setScale(150 / fx.width).setAlpha(0.95);
    this.tweens.add({ targets: fx, scale: fx.scale * 1.3, alpha: 0, duration: 380, onComplete: () => fx.destroy() });
    tv.sprite.setTint(0xff6a5a);
    this.time.delayedCall(160, () => tv.sprite.clearTint());
    const bx = tv.box.x;
    this.tweens.add({ targets: tv.box, x: bx + (facing ? -10 : 10), duration: 50, yoyo: true, repeat: 1, onComplete: () => { tv.box.x = bx; } });
    this.floatText(e.target, `-${e.damage}`, '#ff6b5b');
    if (e.kills > 0) this.floatText(e.target, `☠ ${e.kills}`, '#ffffff', -40, 120);
    this.setCount(e.target, e.left);

    const key = e.counter ? 'battle.log.counter' : e.ranged ? 'battle.log.shoot' : 'battle.log.melee';
    this.log(t(key, { a: name, b: tname, dmg: e.damage, kills: e.kills }));
    await this.wait(380);
    av.sprite.setFlipX(att.side === 'enemy');
  }

  private async animHeal(uid: number, amount: number, count: number): Promise<void> {
    const v = this.views.get(uid)!;
    playSfx(this, 'cb_heal', 0.6);
    const fx = this.add.image(v.box.x, v.box.y - 70, 'vfx_hit_heal').setDepth(3000);
    fx.setScale(140 / fx.width);
    this.tweens.add({ targets: fx, alpha: 0, y: fx.y - 30, duration: 600, onComplete: () => fx.destroy() });
    this.floatText(uid, `+${amount}`, '#7dff8a');
    this.setCount(uid, count);
    this.log(t('battle.log.heal', { a: unitName(v.stack.def), n: amount }));
    await this.wait(300);
  }

  private async animDeath(uid: number): Promise<void> {
    const v = this.views.get(uid)!;
    playSfx(this, v.stack.def.undead ? 'cb_death_undead' : 'cb_death_human');
    this.log(t('battle.log.death', { a: unitName(v.stack.def) }));
    const smoke = this.add.image(v.box.x, v.box.y - 50, 'vfx_hit_death_smoke').setDepth(3000);
    smoke.setScale(170 / smoke.width).setAlpha(0.9);
    this.tweens.add({ targets: smoke, alpha: 0, scale: smoke.scale * 1.4, duration: 700, onComplete: () => smoke.destroy() });
    await this.tween({ targets: v.box, alpha: 0, y: v.box.y + 20, duration: 500 });
    v.box.destroy();
    this.views.delete(uid);
  }

  private floatText(uid: number, text: string, color: string, dy = 0, delay = 0): void {
    const v = this.views.get(uid);
    if (!v) return;
    const tx = this.add.text(v.box.x, v.box.y - 140 + dy, text, {
      fontFamily: FONT_TITLE, fontSize: '36px', fontStyle: '900', color, stroke: '#000', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(3500).setAlpha(0);
    this.tweens.chain({
      targets: tx,
      tweens: [
        { alpha: 1, y: tx.y - 20, duration: 160, delay },
        { y: tx.y - 60, alpha: 0, duration: 800, delay: 350 },
      ],
      onComplete: () => tx.destroy(),
    });
  }

  private log(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > 4) this.logLines.shift();
    this.logText?.setText(this.logLines.join('\n'));
  }

  // ---------- result ----------

  private showResult(winner: Side): void {
    const { width: w, height: h } = this.scale;
    const won = winner === 'player';
    playSfx(this, won ? 'ev_victory_crowd' : 'cb_death_human');
    for (const o of [this.initBar, this.infoText, this.logText, this.btnWait, this.btnDefend, this.btnAuto]) {
      this.tweens.add({ targets: o, alpha: 0, duration: 300 });
    }
    this.input.setDefaultCursor('default');
    const layer = this.add.container(0, 0).setDepth(5000).setAlpha(0);
    const img = this.add.image(w / 2, h / 2, won ? 'ui_victory_screen' : 'ui_defeat_screen').setDisplaySize(w, h);
    const title = this.add.text(w / 2, 170, t(won ? 'battle.victory' : 'battle.defeat'), {
      fontFamily: FONT_TITLE, fontSize: '110px', fontStyle: '900', color: won ? COLOR.gold : '#e8c8c0', stroke: '#2a1608', strokeThickness: 14,
    }).setOrigin(0.5);
    const losses = this.battle.stacks
      .filter((s) => s.side === 'player' && s.startCount > s.count)
      .map((s) => t('battle.lossItem', { name: unitName(s.def), lost: s.startCount - s.count, total: s.startCount }));
    const sum = this.add.text(w / 2, 290, losses.length ? t('battle.losses', { list: losses.join(', ') }) : t('battle.noLosses'), {
      fontFamily: FONT_BODY, fontSize: '34px', color: COLOR.light, stroke: '#000', strokeThickness: 6, align: 'center',
      wordWrap: { width: 1400 },
    }).setOrigin(0.5);
    layer.add([img, title, sum]);
    this.tweens.add({ targets: layer, alpha: 1, duration: 700 });
    const again = new Button(this, w / 2 - 230, h - 120, t('battle.again'), { style: 'red', width: 400, fontSize: 30,
      onClick: () => this.scene.restart({ config: testBattleConfig() }) });
    const menu = new Button(this, w / 2 + 230, h - 120, t('battle.toTitle'), { width: 400, fontSize: 30,
      onClick: () => this.scene.start('Title') });
    for (const b of [again, menu]) { b.setDepth(5001).setAlpha(0); this.tweens.add({ targets: b, alpha: 1, delay: 500, duration: 400 }); }
  }
}
