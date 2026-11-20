import Phaser from 'phaser';
import { t } from '../core/i18n';
import { COLOR } from '../core/theme';
import { playMusic, playSfx } from '../core/audio';
import { img, sfx, loadRunUi } from '../core/assets';
import { run, save, availableNodes, nodeById, rng, commitRng, count , heroTotals } from '../run/state';
import type { MapNode, NodeType } from '../run/mapgen';
import { buildEnemy, battleConfig } from '../run/encounters';
import { EVENT_IDS } from '../run/events';
import { heroById } from '../run/heroes';
import { ArmyPanel } from '../ui/ArmyPanel';
import { panel, textStyle, titleStyle } from '../ui/widgets';
import { Button, toast } from '../ui/Button';
import { perkById, perkIconKey } from '../run/perks';
import { loadSpellIcons, spellIcon, spellName, levelStars, spellTooltipLines } from '../ui/spellUi';
import { spellMax } from '../run/state';
import { perkLines, rarityLabel, RARITY_COLOR, tooltip, loadPerkIcons } from '../ui/perkUi';

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
    const wk = this.walkKey();
    if (!this.textures.exists(wk)) this.load.spritesheet(wk, `assets/map/animated/anim_map_hero_${wk.slice(5)}_walk_sheet_8x4.webp`, { frameWidth: 320, frameHeight: 320 });
    sfx(this, 'mus_map_act1', 'audio/music/mus_map_act1.ogg');
    loadPerkIcons(this, [...(r.talents ?? []), ...(r.artifacts ?? [])].map(perkById));
    loadSpellIcons(this, (r.spells ?? []).map((x) => x.id));
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
    const wk = this.walkKey();
    if (!this.anims.exists(`${wk}_anim`)) {
      this.anims.create({ key: `${wk}_anim`, frames: this.anims.generateFrameNumbers(wk, { start: 0, end: 31 }), frameRate: 16, repeat: -1 });
    }
    const start = r.currentNode !== null ? nodeById(r.currentNode) : null;
    const tx = start ? px(start) : MAP_X + MAP_W / 2;
    const ty = start ? py(start) : MAP_H - 25;
    this.token = this.add.sprite(tx, ty + 10, wk, 0).setOrigin(0.5, 0.92).setDepth(50);
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
    right.add(panel(this, 200, 520, 400, 1040));
    right.add(this.add.text(200, 50, t('run.act', { n: r.act }), titleStyle(34)).setOrigin(0.5));
    right.add(this.add.text(200, 95, t(`biome.${r.biome}`), textStyle(24, '#e8dcc0')).setOrigin(0.5));
    LEGEND.forEach((type, i) => {
      const y = 150 + i * 50;
      const ic = this.add.image(70, y, ICON[type]); ic.setScale(42 / Math.max(ic.width, ic.height));
      right.add(ic);
      right.add(this.add.text(110, y, t(`node.${type}`), textStyle(21)).setOrigin(0, 0.5));
    });
    // talents and artifacts with tooltips
    const perkGrid = (title: string, ids: string[], y0: number): number => {
      right.add(this.add.text(200, y0, title, titleStyle(24)).setOrigin(0.5, 0));
      if (!ids.length) { right.add(this.add.text(200, y0 + 40, t('map.none'), textStyle(18, '#c9b896')).setOrigin(0.5, 0)); return y0 + 80; }
      ids.forEach((id, i) => {
        const p = perkById(id);
        const x = 60 + (i % 5) * 70, y = y0 + 64 + Math.floor(i / 5) * 70;
        const bg = this.add.graphics();
        bg.fillStyle(0x000000, 0.45).fillRoundedRect(x - 30, y - 30, 60, 60, 10);
        bg.lineStyle(2, Phaser.Display.Color.HexStringToColor(RARITY_COLOR[p.cursed ? 'cursed' : p.rarity]).color, 1).strokeRoundedRect(x - 30, y - 30, 60, 60, 10);
        const ic = this.add.image(x, y, perkIconKey(p)).setInteractive();
        ic.setScale(52 / Math.max(ic.width, ic.height));
        tooltip(this, ic, `${t(`perk.${p.id}`)} (${rarityLabel(p)})`, perkLines(p));
        right.add([bg, ic]);
      });
      return y0 + 64 + Math.ceil(ids.length / 5) * 70;
    };
    let py0 = perkGrid(t('map.talents'), r.talents ?? [], 560);
    py0 = perkGrid(t('map.artifacts'), r.artifacts ?? [], py0 + 6);
    // spells with tooltips (level stars below the icon)
    const book = r.spells ?? [];
    right.add(this.add.text(200, py0 + 6, t('map.spells'), titleStyle(24)).setOrigin(0.5, 0));
    book.forEach((x, i) => {
      const cx = 60 + (i % 5) * 70, cy = py0 + 70 + Math.floor(i / 5) * 80;
      const ic = spellIcon(this, cx, cy, x.id, 60);
      ic.setInteractive();
      tooltip(this, ic, `${spellName(x.id)} ${levelStars(x.level, spellMax(x.id))}`, spellTooltipLines(x.id, heroTotals(r).power, x.level));
      right.add(ic);
      right.add(this.add.text(cx, cy + 32, '★'.repeat(x.level), textStyle(14, '#ffe08a', true)).setOrigin(0.5, 0));
    });
    right.setScrollFactor(0, 0, true);
    const menu = new Button(this, 1710, 990, t('map.menu'), { width: 300, fontSize: 26, onClick: () => { save(); this.scene.start('Title'); } });
    menu.setScrollFactor(0).setDepth(201);

    playMusic(this, 'mus_map_act1');
    if (!availableNodes().length) toast(this, '…');
  }

  /** Walking hero token of the run's people (sheet key walk_<people>). */
  private walkKey(): string {
    const f = heroById(run().heroId).faction;
    return `walk_${({ human: 'humans', undead: 'undead', elf: 'elves', dwarf: 'dwarves', orc: 'orcs', demon: 'demons' } as Record<string, string>)[f] ?? 'humans'}`;
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
    this.token.play(`${this.walkKey()}_anim`);
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
