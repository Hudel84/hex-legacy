import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { playMusic, playSfx } from '../core/audio';
import { img, sfx, loadRunUi } from '../core/assets';
import { run, save, availableNodes, nodeById, rng, commitRng, count } from '../run/state';
import type { MapNode, NodeType } from '../run/mapgen';
import { buildEnemy, battleConfig } from '../run/encounters';
import { EVENT_IDS } from '../run/events';
import { ArmyPanel } from '../ui/ArmyPanel';
import { panel, textStyle, titleStyle } from '../ui/widgets';
import { Button, toast } from '../ui/Button';

const MAP_X = 420;
const MAP_W = 1080;
const MAP_H = Math.round(MAP_W * 1920 / 1072);
const ICON: Record<NodeType, string> = {
  battle: 'node_battle', elite: 'node_elite', event: 'node_event', shop: 'node_shop',
  rest: 'node_rest', treasure: 'node_treasure', shrine: 'node_shrine', boss: 'node_boss',
};
const LEGEND: NodeType[] = ['battle', 'elite', 'event', 'shop', 'rest', 'treasure', 'shrine', 'boss'];

const px = (n: MapNode) => MAP_X + n.x * MAP_W;
const py = (n: MapNode) => n.y * MAP_H;

export class MapScene extends Phaser.Scene {
  private token!: Phaser.GameObjects.Sprite;
  private busy = false;
  private tip!: Phaser.GameObjects.Text;
  private armyPanel!: ArmyPanel;

  constructor() { super('Map'); }

  preload(): void {
    const r = run();
    loadRunUi(this);
    ArmyPanel.preload(this);
    const biomeMap: Record<string, string> = { meadows: 'advmap_act1_meadows', autumn_forest: 'advmap_act1_autumn_forest', rocky_coast: 'advmap_act1_rocky_coast' };
    const mk = biomeMap[r.biome] ?? 'advmap_act1_meadows';
    img(this, mk, `map/biomes/${mk}.webp`);
    for (const k of ['node_battle', 'node_elite', 'node_event', 'node_shop', 'node_rest', 'node_shrine', 'node_boss']) img(this, k, `map/${k}.webp`);
    img(this, 'node_treasure', 'map/objects/mapobj_treasure_chest.webp');
    for (const k of ['ring_available', 'ring_current', 'ring_visited', 'path_dot', 'path_dot_lit', 'marker_check']) img(this, k, `map/node_states/${k}.webp`);
    if (!this.textures.exists('walk_humans')) this.load.spritesheet('walk_humans', 'assets/map/animated/anim_map_hero_humans_walk_sheet_8x4.webp', { frameWidth: 320, frameHeight: 320 });
    sfx(this, 'mus_map_act1', 'audio/music/mus_map_act1.ogg');
  }

  create(): void {
    const r = run();
    const { width: w, height: h } = this.scale;
    this.busy = false;
    const biomeMap: Record<string, string> = { meadows: 'advmap_act1_meadows', autumn_forest: 'advmap_act1_autumn_forest', rocky_coast: 'advmap_act1_rocky_coast' };
    const mk = biomeMap[r.biome] ?? 'advmap_act1_meadows';

    // world: the map image in the middle column
    this.cameras.main.setBackgroundColor('#120c08');
    this.add.image(MAP_X, 0, mk).setOrigin(0).setDisplaySize(MAP_W, MAP_H);
    this.cameras.main.setBounds(0, 0, w, MAP_H);

    // paths
    const visited = new Set(r.visited);
    const traveled = new Set<string>();
    for (let i = 1; i < r.visited.length; i++) traveled.add(`${r.visited[i - 1]}>${r.visited[i]}`);
    const dots = this.add.container(0, 0);
    for (const n of r.map) {
      for (const nid of n.next) {
        const m = nodeById(nid);
        const lit = traveled.has(`${n.id}>${m.id}`);
        const x1 = px(n), y1 = py(n), x2 = px(m), y2 = py(m);
        const len = Math.hypot(x2 - x1, y2 - y1);
        const steps = Math.floor((len - 90) / 26);
        for (let k = 0; k <= steps; k++) {
          const f = (45 + k * 26) / len;
          const d = this.add.image(x1 + (x2 - x1) * f, y1 + (y2 - y1) * f, lit ? 'path_dot_lit' : 'path_dot');
          d.setScale((lit ? 18 : 14) / d.width).setAlpha(lit ? 1 : 0.85);
          dots.add(d);
        }
      }
    }

    // nodes
    const avail = new Set(availableNodes().map((n) => n.id));
    for (const n of r.map) {
      const x = px(n), y = py(n);
      const size = n.type === 'boss' ? 170 : 84;
      const isAvail = avail.has(n.id) && !this.busy;
      const isVisited = visited.has(n.id);
      if (isAvail) {
        const ring = this.add.image(x, y, 'ring_available');
        ring.setScale((size * 1.45) / ring.width);
        this.tweens.add({ targets: ring, scale: ring.scale * 1.12, alpha: 0.6, duration: 700, yoyo: true, repeat: -1 });
      } else if (n.id === r.currentNode) {
        const ring = this.add.image(x, y, 'ring_current'); ring.setScale((size * 1.45) / ring.width);
      }
      const icon = this.add.image(x, y, ICON[n.type]);
      icon.setScale(size / Math.max(icon.width, icon.height));
      if (!isAvail && !isVisited && n.id !== r.currentNode) icon.setAlpha(0.8);
      if (isVisited && n.id !== r.currentNode) {
        icon.setAlpha(0.55);
        const chk = this.add.image(x + size * 0.3, y + size * 0.25, 'marker_check'); chk.setScale(36 / chk.width);
      }
      if (isAvail) {
        icon.setInteractive({ useHandCursor: true });
        const base = icon.scale;
        icon.on('pointerover', () => { icon.setScale(base * 1.15); this.showTip(n, x, y - size * 0.75); playSfx(this, 'ui_hover'); });
        icon.on('pointerout', () => { icon.setScale(base); this.tip.setVisible(false); });
        icon.on('pointerup', () => this.travel(n));
      } else {
        icon.setInteractive();
        icon.on('pointerover', () => this.showTip(n, x, y - size * 0.75));
        icon.on('pointerout', () => this.tip.setVisible(false));
      }
    }

    // hero token
    if (!this.anims.exists('walk_humans_anim')) {
      this.anims.create({ key: 'walk_humans_anim', frames: this.anims.generateFrameNumbers('walk_humans', { start: 0, end: 31 }), frameRate: 16, repeat: -1 });
    }
    const start = r.currentNode !== null ? nodeById(r.currentNode) : null;
    const tx = start ? px(start) : MAP_X + MAP_W / 2;
    const ty = start ? py(start) : MAP_H - 25;
    this.token = this.add.sprite(tx, ty + 10, 'walk_humans', 0).setOrigin(0.5, 0.92).setDepth(50);
    this.token.setScale(120 / 320);

    this.tip = this.add.text(0, 0, '', { ...textStyle(24, COLOR.light, true), backgroundColor: '#1b120bdd', padding: { x: 10, y: 6 } })
      .setOrigin(0.5, 1).setDepth(100).setVisible(false);

    // initial scroll: show the current position in the lower part of the screen
    this.cameras.main.scrollY = Phaser.Math.Clamp(ty - h * 0.65, 0, MAP_H - h);

    // scrolling with wheel and drag
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY + dy, 0, MAP_H - h);
    });
    let dragY: number | null = null;
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => { dragY = p.y; });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { dragY = null; });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => {
      if (dragY !== null && p.isDown) {
        this.cameras.main.scrollY = Phaser.Math.Clamp(this.cameras.main.scrollY - (p.y - dragY), 0, MAP_H - h);
        dragY = p.y;
      }
    });

    // fixed UI
    this.armyPanel = new ArmyPanel(this, 10, 20);
    this.armyPanel.setDepth(200);
    const right = this.add.container(1510, 20).setScrollFactor(0).setDepth(200);
    right.add(panel(this, 0, 0, 400, 1040).setOrigin(0));
    right.add(this.add.text(200, 50, t('run.act', { n: r.act }), titleStyle(34)).setOrigin(0.5));
    right.add(this.add.text(200, 95, t(`biome.${r.biome}`), textStyle(24, '#e8dcc0')).setOrigin(0.5));
    LEGEND.forEach((type, i) => {
      const y = 175 + i * 74;
      const ic = this.add.image(70, y, ICON[type]); ic.setScale(56 / Math.max(ic.width, ic.height));
      right.add(ic);
      right.add(this.add.text(115, y, t(`node.${type}`), textStyle(23)).setOrigin(0, 0.5));
    });
    right.add(this.add.text(200, 790, t('map.hint'), { ...textStyle(18, '#c9b896'), align: 'center', wordWrap: { width: 340 } }).setOrigin(0.5));
    const menu = new Button(this, 1710, 990, t('map.menu'), { width: 300, fontSize: 26, onClick: () => { save(); this.scene.start('Title'); } });
    menu.setScrollFactor(0).setDepth(201);

    playMusic(this, 'mus_map_act1');
    if (!availableNodes().length) toast(this, '…');
  }

  private showTip(n: MapNode, x: number, y: number): void {
    this.tip.setText(t(`node.${n.type}`)).setPosition(x, y).setVisible(true);
  }

  private travel(n: MapNode): void {
    if (this.busy) return;
    const r = run();
    if (n.type !== 'event' && n.type !== 'shop' && n.type !== 'rest' && n.type !== 'treasure' && n.type !== 'shrine'
      && !r.army.some((s) => count(s) > 0)) { toast(this, t('map.noArmy')); return; }
    this.busy = true;
    this.tip.setVisible(false);
    playSfx(this, 'ui_node_select');
    const tx = px(n), ty = py(n) + 10;
    this.token.setFlipX(tx < this.token.x);
    this.token.play('walk_humans_anim');
    const dist = Math.hypot(tx - this.token.x, ty - this.token.y);
    this.cameras.main.pan(MAP_X + MAP_W / 2, Phaser.Math.Clamp(ty - 150, this.scale.height / 2, MAP_H - this.scale.height / 2), dist * 3 + 300);
    this.tweens.add({
      targets: this.token, x: tx, y: ty, duration: dist * 3 + 300, ease: 'Sine.inOut',
      onComplete: () => {
        this.token.stop(); this.token.setFrame(0);
        r.currentNode = n.id;
        r.visited.push(n.id);
        save();
        this.time.delayedCall(250, () => this.enter(n));
      },
    });
  }

  private enter(n: MapNode): void {
    switch (n.type) {
      case 'battle': case 'elite': case 'boss': {
        const cfg = battleConfig(n, buildEnemy(n));
        save();
        this.scene.start('Battle', { config: cfg });
        break;
      }
      case 'event': {
        const g = rng();
        const seen = new Set(run().seenEvents ?? []);
        const pool = EVENT_IDS.filter((e) => !seen.has(e));
        const id = g.pick(pool.length ? pool : EVENT_IDS);
        commitRng(g);
        (run().seenEvents ??= []).push(id);
        save();
        this.scene.start('Node', { kind: 'event', eventId: id });
        break;
      }
      default:
        this.scene.start('Node', { kind: n.type });
    }
  }
}
