import { openHero } from './HeroScene';
import { rankFor, fmtMult } from '../run/rating';
import Phaser from 'phaser';
import { Battle, type Action, type BattleSetup } from '../battle/engine';
import { type Hex, key, eq, allHexes } from '../battle/hex';
import type { BattleEvent, Stack, Side, UnitDef } from '../battle/types';
import { UNITS } from '../data/units';
import { t } from '../core/i18n';
import { FONT_TITLE, FONT_BODY, COLOR } from '../core/theme';
import { playMusic, playSfx, playStinger } from '../core/audio';
import { loadVoices, playVoice } from '../core/voice';
import { settings } from '../core/settings';
import { Button } from '../ui/Button';
import { shade } from '../ui/widgets';
import { tooltip } from '../ui/perkUi';
import type { RunBattleConfig } from '../run/encounters';
import { showUnitInfo, loadAbilityIcons, ABILITY_ICON, STATUS_ICON } from '../ui/UnitInfo';
import { loadRunUi, audioUrls } from '../core/assets';
import { SPELLS, type Element, noTarget } from '../battle/spells';
import { loadSpellIcons, spellName, spellDesc, spellIcon, levelStars, SCHOOL_COLOR } from '../ui/spellUi';
import { panel, titleStyle, textStyle, fitWidth } from '../ui/widgets';
import { racePassive } from '../ui/UnitInfo';
import { CONSUMABLES } from '../run/items';
import { loadItemAssets, consumableIcon, consumableName, consumableDesc } from '../ui/itemUi';
import { run as currentRun, save as saveRun } from '../run/state';

/** Visuals of hero spells: impact image, optional projectile from the hero, sound (sp_<snd>_cast / _impact). */
const ELEMENT_FX: Record<Element, { hit: string; proj?: string; snd: string }> = {
  holy: { hit: 'vfx_hit_holy', proj: 'vfx_proj_holy_beam', snd: 'light' },
  death: { hit: 'vfx_hit_curse', proj: 'vfx_proj_shadow_bolt', snd: 'death' },
  nature: { hit: 'vfx_hit_poison', proj: 'vfx_proj_poison_glob', snd: 'nature' },
  earth: { hit: 'vfx_hit_earth', snd: 'earth' },
  fire: { hit: 'vfx_hit_fire_explosion', proj: 'vfx_proj_fireball', snd: 'fire' },
  lightning: { hit: 'vfx_hit_lightning', proj: 'vfx_proj_lightning_bolt', snd: 'lightning' },
};
const SCHOOL_SND: Record<string, string> = { light: 'light', nature: 'nature', earth: 'earth', storm: 'mind', dark: 'death', fire: 'fire' };
const CAST_FX: Record<string, string> = {
  light: 'vfx_cast_light', nature: 'vfx_cast_nature', earth: 'vfx_cast_earth', storm: 'vfx_cast_mind_rune', dark: 'vfx_cast_death', fire: 'vfx_cast_chaos',
};
/** Special impact images and sounds for spells without a damage element. */
const SPELL_HIT: Record<string, string> = {
  holyHeal: 'vfx_hit_heal', resurrection: 'vfx_hit_resurrection', raiseDead: 'vfx_hit_resurrection', divineShield: 'vfx_hit_shield_bubble',
  slow: 'vfx_hit_frost', poisonSpores: 'vfx_hit_poison', inferno: 'vfx_hit_fire_explosion', bloodRage: 'vfx_hit_blood_magic',
  curseOfWeakness: 'vfx_hit_curse', fear: 'vfx_hit_curse', haste: 'vfx_hit_teleport', regrowth: 'vfx_hit_heal',
  confusion: 'vfx_hit_teleport', quicksand: 'vfx_hit_earth', entanglingRoots: 'vfx_hit_poison', stoneSkin: 'vfx_hit_earth',
  healingRain: 'vfx_hit_heal', callOfTheWild: 'vfx_hit_heal',
};
const SPELL_SND: Record<string, string> = { bloodRage: 'blood', inferno: 'fire', lightningBolt: 'lightning', chainLightning: 'lightning' };
const BUFFS = new Set(['bless', 'ward', 'haste', 'focus', 'regrowth', 'thornskin', 'frenzy', 'shield', 'fury', 'spearwall', 'disembodied']);

const A = 'assets/';

// ---- board geometry (pointy-top hexes, squashed for a slight top-down perspective) ----
const HEX_W = 150;
const SQUASH = 0.6;
const HEX_R = HEX_W / Math.sqrt(3);            // corner radius before squash
const ROW_STEP = HEX_R * 1.5 * SQUASH;
const GRID_X0 = (1920 - (9 * HEX_W + HEX_W / 2)) / 2 + HEX_W / 2;
const GRID_Y0 = 430;
const TIER_SCALE = [0, 0.8, 0.9, 1.0, 1.1, 1.28, 1.45];
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
  statusRow: Phaser.GameObjects.Container;
  /** Stack count and status icons, drawn above all units and following the box (v0.18.2). */
  over: Phaser.GameObjects.Container;
}

/** Depth of the count plates: above every unit (depth = y + 10 < 1200), below effects (3000+) and the HUD (2000). */
const OVERLAY_DEPTH = 1500;
const sheetKey = (d: UnitDef) => `sheet_${d.id}`;
const portraitKey = (d: UnitDef) => `portrait_${d.id}`;
const unitName = (d: UnitDef) => t(`unit.${d.id}`);

export interface QuickBattleConfig {
  setup: BattleSetup;
  playerHero: string;
  enemyHero?: string;
  background: string;
  ambient?: string;
  music?: string;
  mode?: 'quick';
}
export type BattleConfig = QuickBattleConfig | RunBattleConfig;

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
      player: { hero: { atk: 2, def: 2, power: 2, knowledge: 3,
        spells: [{ id: 'smite', level: 1 }, { id: 'blessing', level: 1 }, { id: 'holyHeal', level: 2 }, { id: 'haste', level: 1 }, { id: 'fireball', level: 1 }],
        consumables: ['potionHeal', 'scroll_lightningBolt', 'potionMana'] },
        army: army([['human_t1_spearman', 12], ['human_t2_crossbowman', 5], ['human_t3_swordsman', 2]]) },
      enemy: { hero: { atk: 1, def: 1, power: 2, knowledge: 2, spells: [{ id: 'lifeDrain', level: 1 }, { id: 'curseOfWeakness', level: 1 }] },
        army: army([['undead_t1_skeleton', 16], ['undead_t2_zombie', 5], ['undead_t3_ghost', 2]]) },
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
  return [c.x, c.y];  // head hex (clickable for wide units too)
};

/** Test helper: screen position of a hex (game coordinates). */
(window as unknown as { __hexXY: (col: number, row: number) => [number, number] }).__hexXY = (col: number, row: number) => {
  const c = hexCenter({ col, row });
  return [c.x, c.y];
};

export class BattleScene extends Phaser.Scene {
  private cfg!: BattleConfig;
  private battle!: Battle;
  private views = new Map<number, StackView>();
  private trapViews = new Map<string, Phaser.GameObjects.Container>();
  private gridG!: Phaser.GameObjects.Graphics;
  private hiG!: Phaser.GameObjects.Graphics;
  private hoverG!: Phaser.GameObjects.Graphics;
  /** Red hexes: how far the enemy stack under the mouse can move (v0.20.1). */
  private enemyReachG!: Phaser.GameObjects.Graphics;
  private activeRing!: Phaser.GameObjects.Image;
  private infoText!: Phaser.GameObjects.Text;
  private logLines: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private initBar!: Phaser.GameObjects.Container;
  private btnWait!: Button;
  private btnDefend!: Button;
  private btnAuto!: Button;
  private auto = false;
  private lastSpellVoice = -1e9;
  private inputOpen = false;
  private resolveInput: (() => void) | null = null;
  private reach = new Map<string, Hex[]>();
  private ambient?: Phaser.Sound.BaseSound;
  private cursorIcon!: Phaser.GameObjects.Image;
  private btnAbility!: Button;
  private targeting = false;
  private infoOpen: Phaser.GameObjects.Container | null = null;
  private btnSpell!: Button;
  private manaText!: Phaser.GameObjects.Text;
  private castNote!: Phaser.GameObjects.Text;
  private spellTargeting: string | null = null;
  private bookOpen: Phaser.GameObjects.Container | null = null;
  private itemTargeting: number | null = null;
  private beltBar!: Phaser.GameObjects.Container;
  /** Tactics phase before the first round (v0.18): stacks can be moved inside the set-up zone. */
  private deploying = false;
  private deployCols = 2;
  private deploySel: number | null = null;
  private btnStart: Button | null = null;

  constructor() { super('Battle'); }

  init(data: { config?: BattleConfig }): void {
    this.cfg = data.config ?? testBattleConfig();
    this.views.clear();
    this.logLines = [];
    this.auto = false;
    this.inputOpen = false;
    this.targeting = false;
    this.infoOpen = null;
    this.spellTargeting = null;
    this.bookOpen = null;
    this.itemTargeting = null;
    this.deploying = false;
    this.deploySel = null;
    this.btnStart = null;
  }

  preload(): void {
    loadRunUi(this);
    loadAbilityIcons(this);
    const { width: w, height: h } = this.scale;
    const txt = this.add.text(w / 2, h / 2, '…', { fontFamily: FONT_TITLE, fontSize: '40px', color: COLOR.gold }).setOrigin(0.5);
    this.load.on(Phaser.Loader.Events.PROGRESS, (p: number) => txt.setText(`${Math.round(p * 100)}%`));

    const bg = this.cfg.background;
    if (!this.textures.exists(bg)) this.load.image(bg, `${A}backgrounds/${bg}.webp`);
    const LOOPS = ['bg_act1_meadows', 'bg_act1_autumn_forest', 'bg_act2_graveyard', 'bg_act2_snowy_pass', 'bg_act2_swamp_ruins',
      'bg_act3_crystal_cavern', 'bg_act3_demon_wasteland', 'bg_act3_volcanic'];
    if (LOOPS.includes(bg) && !this.cache.video.exists(`${bg}_loop`)) this.load.video(`${bg}_loop`, `${A}backgrounds/animated/${bg}_loop.mp4`, true);
    const defs = new Set<UnitDef>();
    for (const side of ['player', 'enemy'] as Side[]) for (const a of this.cfg.setup[side].army) defs.add(a.def);
    // creatures that can be summoned during the battle (boss skills, relics, the Void God)
    const passives = [...defs].flatMap((d) => d.passives ?? []);
    const mods = [this.cfg.setup.player.mods, this.cfg.setup.enemy.mods];
    if (passives.includes('raiseDead') || mods.some((m) => (m?.raise ?? 0) > 0)) defs.add(UNITS.undead_t1_skeleton);
    if (passives.includes('hellGate') || mods.some((m) => (m?.imps ?? 0) > 0)) defs.add(UNITS.demon_t1_imp);
    // spells that summon (Call of the Wild: dire wolves)
    const books = (['player', 'enemy'] as Side[]).flatMap((sd) => this.cfg.setup[sd].hero?.spells ?? []);
    if (books.some((x) => x.id === 'callOfTheWild')) defs.add(UNITS.neutral_dire_wolf);
    for (const sd of ['player', 'enemy'] as Side[]) { const su = this.cfg.setup[sd].hero?.summon; if (su && UNITS[su.id]) defs.add(UNITS[su.id]); }
    if (passives.includes('voidCaller')) for (const id of ['summon_void_spawn', 'summon_void_eye_tentacle']) if (UNITS[id]) defs.add(UNITS[id]);
    for (const d of defs) {
      if (d.still) { if (!this.textures.exists(sheetKey(d))) this.load.image(sheetKey(d), A + d.still); }
      else if (!this.textures.exists(sheetKey(d))) this.load.spritesheet(sheetKey(d), A + d.sheet, { frameWidth: 320, frameHeight: 320 });
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
      ['vfx_proj_arrow', 'vfx/projectiles/vfx_proj_arrow'], ['vfx_proj_fire_spark', 'vfx/projectiles/vfx_proj_fire_spark'],
      ['vfx_proj_rune_bolt', 'vfx/projectiles/vfx_proj_rune_bolt'], ['vfx_hit_fire_explosion', 'vfx/impacts/vfx_hit_fire_explosion'],
      ['vfx_status_defense_buff', 'vfx/status/vfx_status_defense_buff'],
      ['obstacle_boulders', 'map/objects/mapdeco_boulders'], ['trap_bear', 'vfx/fields/vfx_field_bear_trap'],
      ['ui_victory_screen', 'ui/screens/ui_victory_screen'], ['ui_defeat_screen', 'ui/screens/ui_defeat_screen'],
      ['ui_icon_hourglass', 'ui/ui_icon_hourglass'],
      ['cursor_sword', 'icons/equipment/icon_equip_weapon_steel_longsword'],
      ['cursor_shoot', 'icons/equipment/icon_equip_weapon_light_crossbow'],
    ];
    for (const [k, p] of imgs) if (!this.textures.exists(k)) this.load.image(k, `${A}${p}.webp`);
    const sfx = ['cb_move', 'cb_fly', 'cb_hit_sword', 'cb_hit_claw', 'cb_hit_blunt', 'cb_hit_bolt', 'cb_counter', 'cb_block',
      'cb_heal', 'cb_death_human', 'cb_death_undead', 'cb_turn_start', 'sp_death_cast', 'ev_victory_crowd', 'cb_crit', 'cb_buff', 'ui_open',
      'cb_hit_arrow', 'cb_death_demon', 'cb_death_beast', 'sp_fire_cast'];
    for (const k of sfx) if (!this.cache.audio.exists(k)) this.load.audio(k, audioUrls(`audio/sfx/${k}.ogg`));
    // hero magic
    const book = [...(this.cfg.setup.player.hero.spells ?? []), ...(this.cfg.setup.enemy.hero.spells ?? [])].map((x) => x.id);
    loadSpellIcons(this, book);
    if ((this.cfg.setup.player.hero.consumables ?? []).some((x) => !!x)) loadItemAssets(this, []);
    const magicImgs: [string, string][] = [];
    const magicSfx: string[] = [];
    if (book.length) {
      for (const k of Object.values(CAST_FX)) magicImgs.push([k, `vfx/feedback/${k}`]);
      for (const k of ['vfx_fx_buff_up', 'vfx_fx_debuff_down']) magicImgs.push([k, `vfx/feedback/${k}`]);
      for (const k of ['vfx_hit_holy', 'vfx_hit_earth', 'vfx_hit_fire_explosion', 'vfx_hit_lightning', 'vfx_hit_poison', 'vfx_hit_resurrection',
        'vfx_hit_shield_bubble', 'vfx_hit_frost', 'vfx_hit_blood_magic', 'vfx_hit_teleport']) magicImgs.push([k, `vfx/impacts/${k}`]);
      for (const k of ['vfx_proj_holy_beam', 'vfx_proj_poison_glob', 'vfx_proj_fireball', 'vfx_proj_lightning_bolt', 'vfx_proj_rune_bolt']) magicImgs.push([k, `vfx/projectiles/${k}`]);
      for (const sc of ['light', 'mind', 'death', 'nature', 'earth', 'fire', 'lightning', 'blood']) magicSfx.push(`sp_${sc}_cast`, `sp_${sc}_impact`);
      magicSfx.push('cb_debuff');
    }
    // talent effects without spells (Burning, Death and Decay)
    const tm = [this.cfg.setup.player.mods, this.cfg.setup.enemy.mods];
    if (tm.some((m) => (m?.hellfire ?? 0) > 0)) { magicImgs.push(['vfx_hit_fire_explosion', 'vfx/impacts/vfx_hit_fire_explosion']); magicSfx.push('sp_fire_impact'); }
    if (tm.some((m) => (m?.decay ?? 0) > 0)) magicSfx.push('sp_death_impact');
    for (const [k, p] of magicImgs) if (!this.textures.exists(k)) this.load.image(k, `${A}${p}.webp`);
    for (const k of magicSfx) if (!this.cache.audio.exists(k)) this.load.audio(k, audioUrls(`audio/sfx/${k}.ogg`));
    const music = this.cfg.music ?? 'mus_battle';
    const amb = this.cfg.ambient ?? 'amb_meadows';
    if (!this.cache.audio.exists(music)) this.load.audio(music, audioUrls(`audio/music/${music}.ogg`));
    if (!this.cache.audio.exists(amb)) this.load.audio(amb, audioUrls(`audio/ambient/${amb}.ogg`));
    for (const k of ['stinger_victory', 'stinger_defeat']) if (!this.cache.audio.exists(k)) this.load.audio(k, audioUrls(`audio/music/${k}.ogg`));
    if (this.cfg.playerHero) loadVoices(this, this.cfg.playerHero, ['battle', 'victory', 'spell']);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => txt.destroy());
  }

  create(): void {
    const { width: w, height: h } = this.scale;
    this.battle = new Battle(this.cfg.setup);

    // background with animated loop on top
    const bgKey = this.cfg.background;
    this.add.image(w / 2, h / 2, bgKey).setDisplaySize(w, h).setDepth(-2);
    if (this.cache.video.exists(`${bgKey}_loop`)) this.addLoop(bgKey);
    this.build();
  }

  private addLoop(bgKey: string): void {
    const { width: w, height: h } = this.scale;
    const vid = this.add.video(w / 2, h / 2, `${bgKey}_loop`).setAlpha(0).setDepth(-1);
    vid.setLoop(true); vid.setMute(true); vid.play(true);
    vid.on(Phaser.GameObjects.Events.VIDEO_COMPLETE, () => { vid.seekTo(0); vid.play(true); });
    const poll = this.time.addEvent({
      delay: 100, repeat: 80, callback: () => {
        const el = vid.video;
        if (el && el.readyState >= 2 && el.currentTime > 0 && vid.frame.width > 1) {
          poll.remove(); vid.setDisplaySize(w, h);
          this.tweens.add({ targets: vid, alpha: 1, duration: 800 });
        }
      },
    });
  }

  private build(): void {
    const { width: w, height: h } = this.scale;
    // slight vignette so the board reads better
    shade(this, 0, 0, w, 220, 0.55, 0);
    shade(this, 0, h - 200, w, 200, 0, 0.7);

    // heroes at the sides
    const ph = this.add.image(125, 640, `herobattle_${this.cfg.playerHero}`).setOrigin(0.5, 1);
    ph.setScale(380 / ph.height);
    // click on the hero (or key I): hero screen to look things up (read-only during a battle, v0.20.1)
    if (this.cfg.mode === 'run') {
      ph.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 20 });
      ph.on('pointerover', () => { ph.setTint(0xfff0c0); this.infoText.setText(t('battle.heroScreen')); });
      ph.on('pointerout', () => { ph.clearTint(); this.infoText.setText(''); });
      ph.on('pointerup', () => this.openHeroScreen());
      this.input.keyboard?.on('keydown-I', () => this.openHeroScreen());
    }
    if (this.cfg.enemyHero) {
      const eh = this.add.image(w - 125, 640, `herobattle_${this.cfg.enemyHero}`).setOrigin(0.5, 1).setFlipX(true);
      eh.setScale(380 / eh.height);
    }
    fitWidth(this.add.text(125, 650, t(`hero.${this.cfg.playerHero}`), this.smallLabel()).setOrigin(0.5, 0), 240);
    if (this.cfg.enemyHero) fitWidth(this.add.text(w - 125, 650, t(`hero.${this.cfg.enemyHero}`), this.smallLabel()).setOrigin(0.5, 0), 240);
    this.buildMagicHud();

    // grid
    this.gridG = this.add.graphics();
    this.hiG = this.add.graphics();
    this.enemyReachG = this.add.graphics();
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

    // attack cursor: a sword that points in the attack direction, or a crossbow for shots
    this.cursorIcon = this.add.image(0, 0, 'cursor_sword').setDepth(4500).setVisible(false);

    // HUD
    this.initBar = this.add.container(w / 2, 78).setDepth(2000);
    this.infoText = this.add.text(w / 2 + 130 * Math.min(1, settings.textSize ?? 0), h - 92, '', {
      fontFamily: FONT_BODY, fontSize: '28px', color: COLOR.light, stroke: '#000', strokeThickness: 5, align: 'center',
    }).setOrigin(0.5).setDepth(2000);
    this.logText = this.add.text(30, h - 18, '', {
      fontFamily: FONT_BODY, fontSize: '21px', color: '#e8dcc0', stroke: '#000', strokeThickness: 4, lineSpacing: 1,
      wordWrap: { width: settings.textSize ? 780 : 1400 },
    }).setOrigin(0, 1).setDepth(2000);

    const bx = w - 150;
    this.btnAbility = new Button(this, bx, h - 285, t('battle.ability'), { width: 250, fontSize: 20, style: 'red', onClick: () => this.abilityClicked() });
    this.btnAbility.on('pointerover', () => this.abilityHover());
    this.btnAbility.setDepth(2000).setVisible(false);
    this.btnWait = new Button(this, bx, h - 205, t('battle.wait'), { width: 250, fontSize: 26, onClick: () => this.playerAction({ type: 'wait' }) });
    this.btnDefend = new Button(this, bx, h - 125, t('battle.defend'), { width: 250, fontSize: 26, onClick: () => this.playerAction({ type: 'defend' }) });
    this.btnAuto = new Button(this, bx, h - 45, t('battle.auto'), { width: 250, fontSize: 26, onClick: () => this.toggleAuto() });
    for (const b of [this.btnWait, this.btnDefend, this.btnAuto]) b.setDepth(2000);

    // input
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (p: Phaser.Input.Pointer) => this.onHover(p.worldX, p.worldY));
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (this.infoOpen?.active) return;
      if (p.rightButtonReleased()) { this.onRightClick(p.worldX, p.worldY); return; }
      if (over.length === 0) this.onClick(p.worldX, p.worldY);
    });
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.deploying && this.deploySel !== null) { this.deploySel = null; this.infoText.setText(t('battle.tacticsShort')); this.drawDeploy(); return; }
      this.closeBook(); this.cancelTargeting(); this.cancelItem();
    });
    this.input.keyboard?.on('keydown-S', () => this.toggleBook());
    this.input.keyboard?.on('keydown-A', () => this.abilityClicked());
    this.input.keyboard?.on('keydown-W', () => this.playerAction({ type: 'wait' }));
    this.input.keyboard?.on('keydown-D', () => this.playerAction({ type: 'defend' }));

    playMusic(this, this.cfg.music ?? 'mus_battle');
    this.time.delayedCall(900, () => playVoice(this, this.cfg.playerHero, 'battle'));
    const startAmbient = () => {
      const amb = this.cfg.ambient ?? 'amb_meadows';
      if (!this.sys.isActive() || this.ambient || !this.cache.audio.exists(amb)) return; // scene left or file missing
      try {
        this.ambient = this.sound.add(amb, { loop: true, volume: settings.sfxVolume * 0.12 });
        this.ambient.play();
      } catch { this.ambient = undefined; }
    };
    if (this.sound.locked) this.sound.once(Phaser.Sound.Events.UNLOCKED, startAmbient); else startAmbient();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { try { this.ambient?.stop(); this.ambient?.destroy(); } catch { /* gone */ } this.ambient = undefined; this.sound.off(Phaser.Sound.Events.UNLOCKED, startAmbient); });

    this.log(t('battle.help'));
    this.setButtonsEnabled(false);
    this.time.delayedCall(400, () => this.startOrDeploy());
  }

  /** Count plates follow their stack (moves, lunges, fades). */
  update(): void {
    for (const v of this.views.values()) {
      if (!v.box.active) continue;
      v.over.setPosition(v.box.x, v.box.y).setVisible(v.box.visible).setAlpha(v.box.alpha);
    }
  }

  private openHeroScreen(): void {
    if (this.bookOpen || this.infoOpen?.active || this.battle.winner) return;
    this.showEnemyReach(null);
    this.hoverG.clear();
    this.input.setDefaultCursor('default');
    playSfx(this, 'ui_click');
    openHero(this);
  }

  // ---------- tactics (set-up before the battle, v0.18) ----------

  private startOrDeploy(): void {
    if (this.cfg.mode !== 'run' || settings.tactics === false) { void this.loop(); return; }
    const { width: w, height: h } = this.scale;
    this.deploying = true;
    this.deployCols = this.cfg.setup.deployCols ?? 2;
    this.deploySel = null;
    this.btnWait.setVisible(false);
    this.btnDefend.setVisible(false);
    this.btnStart = new Button(this, w - 150, h - 165, t('battle.start'), { width: 250, fontSize: 24, style: 'red', onClick: () => this.endDeploy() });
    this.btnStart.setDepth(2000);
    this.input.keyboard?.on('keydown-ENTER', () => this.endDeploy());
    this.infoText.setText(t('battle.tacticsShort'));
    this.log(t('battle.tacticsHelp'));
    this.drawDeploy();
  }

  private drawDeploy(): void {
    const g = this.hiG;
    g.clear();
    if (!this.deploying) return;
    const sel = this.deploySel;
    for (const hx of allHexes()) {
      if (!this.battle.inDeployZone(hx, this.deployCols)) continue;
      const ok = sel !== null && this.battle.canDeploy(sel, hx, this.deployCols);
      g.fillStyle(0x7fe07a, ok ? 0.38 : 0.22).fillPoints(hexPoly(hx, 4), true);
      g.lineStyle(ok ? 3 : 2, 0xc8ffb8, ok ? 0.95 : 0.6).strokePoints(hexPoly(hx, 4), true, true);
    }
    if (sel !== null) this.polyStack(g, this.battle.stack(sel), 0xffd84a, 0.25, 0xffe58a, 1, 4);
  }

  private deployHover(x: number, y: number): void {
    const hx = pixelToHex(x, y);
    const st = hx ? this.battle.stackAt(hx) : undefined;
    const own = st && st.side === 'player' ? st : undefined;
    const ok = !!hx && this.deploySel !== null && this.battle.canDeploy(this.deploySel, hx, this.deployCols);
    if (ok) this.hoverG.lineStyle(4, 0xffffff, 1).strokePoints(hexPoly(hx!, 4), true, true);
    else if (own) this.polyStack(this.hoverG, own, 0, 0, 0xffffff, 1, 4);
    this.input.setDefaultCursor(ok || own ? 'pointer' : 'default');
  }

  private deployClick(x: number, y: number): void {
    const hx = pixelToHex(x, y);
    if (!hx) return;
    const st = this.battle.stackAt(hx);
    const own = st && st.side === 'player' ? st : undefined;
    const sel = this.deploySel;
    if (sel !== null && own?.uid === sel) { this.deploySel = null; this.infoText.setText(t('battle.tacticsShort')); this.drawDeploy(); return; }
    if (sel !== null && this.battle.canDeploy(sel, hx, this.deployCols)) {
      this.battle.deploy(sel, hx, this.deployCols);
      playSfx(this, 'cb_move', 0.6);
      for (const v of this.views.values()) {
        if (v.stack.side !== 'player') continue;
        const p = this.stackCenter(v.stack);
        this.tweens.add({ targets: v.box, x: p.x, y: p.y, duration: 220, ease: 'Sine.out' });
        v.box.setDepth(p.y + 10);
      }
      this.deploySel = null;
      this.infoText.setText(t('battle.tacticsShort'));
      this.hoverG.clear();
      this.drawDeploy();
      return;
    }
    if (own) {
      this.deploySel = own.uid;
      playSfx(this, 'ui_click');
      this.infoText.setText(t('battle.tacticsPicked', { unit: unitName(own.def) }));
      this.drawDeploy();
    }
  }

  private endDeploy(): void {
    if (!this.deploying || this.infoOpen?.active) return;
    this.deploying = false;
    this.deploySel = null;
    this.input.keyboard?.off('keydown-ENTER');
    this.btnStart?.destroy();
    this.btnStart = null;
    this.btnWait.setVisible(true);
    this.btnDefend.setVisible(true);
    this.hiG.clear(); this.hoverG.clear();
    this.input.setDefaultCursor('default');
    this.infoText.setText('');
    playSfx(this, 'ui_click');
    // remember the set-up for the next battles of this run
    try {
      const r = currentRun();
      const f = { ...(r.formation ?? {}) };
      for (const st of this.battle.stacks) if (st.side === 'player' && st.count > 0) f[st.def.id] = { col: st.pos.col, row: st.pos.row };
      r.formation = f;
      saveRun();
    } catch { /* no run */ }
    void this.loop();
  }

  private smallLabel(): Phaser.Types.GameObjects.Text.TextStyle {
    return { fontFamily: FONT_TITLE, fontSize: '22px', fontStyle: '700', color: COLOR.gold, stroke: '#000', strokeThickness: 5 };
  }

  // ---------- views ----------

  /** Mirror a unit sprite and keep its feet on the same spot (the origin must be mirrored too). */
  private face(sp: Phaser.GameObjects.Sprite, left: boolean): void {
    const fx = (sp.getData('fx') as number | undefined) ?? 0.5;
    const flip = left !== !!sp.getData('faceLeft');
    sp.setFlipX(flip);
    sp.setOrigin(flip ? 1 - fx : fx, sp.originY);
  }

  /** Screen position of a stack: the middle of all hexes it covers. */
  private stackCenter(st: Stack, pos: Hex = st.pos): { x: number; y: number } {
    const cs = this.battle.cells(st, pos).map(hexCenter);
    return { x: cs.reduce((a, c) => a + c.x, 0) / cs.length, y: cs.reduce((a, c) => a + c.y, 0) / cs.length };
  }

  /** Outline every hex of a stack. */
  private polyStack(g: Phaser.GameObjects.Graphics, st: Stack, fill: number, fa: number, line: number, la: number, lw = 3): void {
    for (const c of this.battle.cells(st)) {
      if (fa > 0) g.fillStyle(fill, fa).fillPoints(hexPoly(c, 4), true);
      g.lineStyle(lw, line, la).strokePoints(hexPoly(c, 4), true, true);
    }
  }

  private createView(s: Stack): void {
    const p = this.stackCenter(s);
    const box = this.add.container(p.x, p.y);
    const shadow = this.add.ellipse(0, 0, HEX_W * (s.def.wide ? 1.5 : 0.62), HEX_W * (s.def.wide ? 0.32 : 0.2), 0x000000, 0.35);
    const sk = sheetKey(s.def);
    const still = !!s.def.still;
    const animKey = `${sk}_idle`;
    if (!still && !this.anims.exists(animKey)) {
      this.anims.create({ key: animKey, frames: this.anims.generateFrameNumbers(sk, { start: 0, end: 31 }), frameRate: 8, repeat: -1 });
    }
    const fb = this.frameBox(sk, still);
    const sprite = this.add.sprite(0, 6, sk, still ? undefined : 0).setOrigin(s.def.wide ? (fb.left + fb.right) / 2 : fb.feetX, fb.bottom);
    sprite.setData('fx', s.def.wide ? (fb.left + fb.right) / 2 : fb.feetX);
    // same visible size for every unit of a tier, no matter how much empty space its frames have
    const fw = still ? sprite.width : 320, fh = still ? sprite.height : 320;
    const visible = Math.max((fb.bottom - fb.top) * fh, (fb.right - fb.left) * fw * 0.75);
    const target = BASE_H * (s.def.sizeScale ?? TIER_SCALE[s.def.tier]);
    sprite.setScale(target / visible);
    if (still) {
      // no idle video: gentle breathing in code
      this.tweens.add({ targets: sprite, scaleY: sprite.scaleY * 1.025, duration: 1400 + Math.random() * 400, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    } else {
      sprite.play({ key: animKey, startFrame: Math.floor(Math.random() * 32) });
    }
    sprite.setData('faceLeft', !!s.def.faceLeft);
    this.face(sprite, s.side === 'enemy');

    const plateX = s.side === 'player' ? 42 : -42;
    const plateBg = this.add.graphics();
    const col = s.side === 'player' ? 0x1f3f7a : 0x7a1f1f;
    plateBg.fillStyle(col, 0.95).fillRoundedRect(-30, -15, 60, 30, 8);
    plateBg.lineStyle(2, 0xf3d48a, 1).strokeRoundedRect(-30, -15, 60, 30, 8);
    const countText = this.add.text(0, 0, String(s.count), {
      fontFamily: FONT_BODY, fontSize: '23px', fontStyle: '700', color: '#ffffff',
    }).setOrigin(0.5);
    const plate = this.add.container(plateX, 16, [plateBg, countText]);

    const statusRow = this.add.container(plateX, 44);
    box.add([shadow, sprite]);
    box.setDepth(p.y + 10);
    // count plate and statuses in their own layer, so units standing in front never hide them
    const over = this.add.container(p.x, p.y, [plate, statusRow]).setDepth(OVERLAY_DEPTH + p.y / 10);
    this.views.set(s.uid, { stack: s, box, sprite, plate, countText, statusRow, over });
  }

  /** Visible bounding box of frame 0 as fractions of the frame (cached per sheet). */
  private frameBox(key: string, whole = false): { top: number; bottom: number; left: number; right: number; feetX: number } {
    const cache = (this.registry.get('frameBox2') as Record<string, { top: number; bottom: number; left: number; right: number; feetX: number }>) ?? {};
    if (cache[key]) return cache[key];
    let box = { top: 0.05, bottom: 0.95, left: 0.05, right: 0.95, feetX: 0.5 };
    try {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      const N = 80;
      const c = document.createElement('canvas');
      c.width = N; c.height = N;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      if (whole) ctx.drawImage(src, 0, 0, src.width, src.height, 0, 0, N, N);
      else ctx.drawImage(src, 0, 0, 320, 320, 0, 0, N, N);
      const d = ctx.getImageData(0, 0, N, N).data;
      let top = N, bottom = -1, left = N, right = -1;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (d[(y * N + x) * 4 + 3] > 60) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
      }
      if (bottom > top) {
        // where the figure stands: middle of the opaque pixels in the lowest 15 % of the figure
        const y0 = Math.floor(bottom - (bottom - top) * 0.15);
        let sx = 0, n = 0;
        for (let y = y0; y <= bottom; y++) for (let x = 0; x < N; x++) if (d[(y * N + x) * 4 + 3] > 60) { sx += x; n++; }
        const feetX = n ? (sx / n + 0.5) / N : (left + right + 1) / 2 / N;
        box = { top: top / N, bottom: Math.min(0.99, (bottom + 1) / N), left: left / N, right: (right + 1) / N, feetX };
      }
    } catch { /* keep default */ }
    cache[key] = box;
    this.registry.set('frameBox2', cache);
    return box;
  }

  private refreshStatus(uid: number): void {
    const v = this.views.get(uid);
    if (!v) return;
    v.statusRow.removeAll(true);
    const sts = v.stack.statuses;
    sts.forEach((st, i) => {
      const k = STATUS_ICON[st.id];
      if (!k || !this.textures.exists(k)) return;
      const ic = this.add.image((i - (sts.length - 1) / 2) * 30, 0, k);
      ic.setScale(28 / ic.width);
      v.statusRow.add(ic);
    });
    v.sprite.setAlpha(this.battle.hasStatus(v.stack, 'disembodied') ? 0.45 : 1);
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
      this.polyStack(g, e, 0xff5040, 0.30, 0xff8a70, 0.85);
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
        this.updateAbilityButton(undefined);
        this.updateSpellButton();
        await this.wait(this.auto ? 250 : 450);
        const spell = this.battle.aiCast(s.side);
        if (spell.length) {
          await this.play(spell);
          if (this.battle.winner) break;
          this.updateInitBar();
          await this.wait(200);
        }
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
    this.updateAbilityButton(s);
    this.updateSpellButton();
    this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
    this.drawHighlights();
    return new Promise((res) => { this.resolveInput = res; });
  }

  private updateAbilityButton(s?: Stack): void {
    const ab = s ? this.battle.ability(s) : null;
    if (!s || !ab || s.side !== 'player') { this.btnAbility.setVisible(false); return; }
    const usable = this.battle.abilityTargets(s).length > 0;
    this.btnAbility.setVisible(true);
    this.btnAbility.setLabel(t(`ability.${ab.id}.name`) + (s.cooldown > 0 ? ` (${s.cooldown})` : ''));
    this.btnAbility.setEnabled(usable && this.inputOpen);
  }

  private abilityHover(): void {
    const s = this.battle.active;
    const ab = s ? this.battle.ability(s) : null;
    if (ab) this.infoText.setText(`${t(`ability.${ab.id}.name`)}: ${t(`ability.${ab.id}.desc`)}`);
  }

  private abilityClicked(): void {
    const s = this.battle.active;
    if (!s || !this.inputOpen || s.side !== 'player' || this.bookOpen) return;
    this.spellTargeting = null;
    const ab = this.battle.ability(s);
    if (!ab || !this.battle.abilityTargets(s).length) return;
    if (ab.target === 'self') { void this.playerAction({ type: 'ability' }); return; }
    this.targeting = !this.targeting;
    if (!this.targeting) { this.cancelTargeting(); return; }
    this.hideAttackCursor();
    this.drawTargets(s);
    this.infoText.setText(t('battle.chooseTarget', { ability: t(`ability.${ab.id}.name`) }));
  }

  private drawTargets(s: Stack): void {
    const g = this.hiG;
    g.clear();
    for (const uid of this.battle.abilityTargets(s)) {
      this.polyStack(g, this.battle.stack(uid), 0xb070ff, 0.35, 0xd8b0ff, 0.95);
    }
  }

  private cancelTargeting(): void {
    if (!this.targeting) return;
    this.targeting = false;
    this.drawHighlights();
    const s = this.battle.active;
    if (s) this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
  }

  private inspect(st: Stack): void {
    if (this.infoOpen?.active) return;
    this.hideAttackCursor();
    this.infoOpen = showUnitInfo(this, {
      def: st.def, count: st.count, topHp: st.topHp, enemy: st.side === 'enemy',
      atkBonus: this.battle.effAtk(st) - st.def.atk, defBonus: this.battle.effDef(st) - st.def.def,
      shots: st.shots, cooldown: st.def.active ? st.cooldown : undefined, statuses: st.statuses, level: st.def.level,
      portraitKey: portraitKey(st.def),
      crit: this.battle.critChance(st), critMult: this.battle.critMult(st), morale: this.battle.moraleChance(st),
    });
  }

  private onRightClick(x: number, y: number): void {
    if (this.spellTargeting) { this.cancelSpell(); return; }
    if (this.itemTargeting !== null) { this.cancelItem(); return; }
    if (this.targeting) { this.cancelTargeting(); return; }
    const h = pixelToHex(x, y);
    const st = h ? this.battle.stackAt(h) : undefined;
    if (st) this.inspect(st);
  }

  private async playerAction(a: Action): Promise<void> {
    if (!this.inputOpen || !this.battle.isLegal(a)) return;
    this.inputOpen = false;
    this.targeting = false;
    this.spellTargeting = null;
    this.itemTargeting = null;
    this.setButtonsEnabled(false);
    this.btnAbility.setEnabled(false);
    this.updateSpellButton();
    this.hideAttackCursor();
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
    const p = this.stackCenter(s);
    const base = HEX_W * 1.05 / this.activeRing.width;
    this.activeRing.setScale(base * (s.def.wide ? 1.9 : 1), base * 0.8 * (s.def.wide ? 1.2 : 1));
    this.activeRing.setPosition(p.x, p.y + 4).setVisible(true);
  }


  // ---------- hero magic ----------

  private buildMagicHud(): void {
    const { width: w } = this.scale;
    const hasBook = this.battle.spellbook('player').length > 0;
    this.manaText = this.add.text(125, 692, '', { ...textStyle(24, '#9fd0ff', true), stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 0).setDepth(2000);
    this.btnSpell = new Button(this, 125, 770, t('battle.spells'), { width: 236, fontSize: 22, onClick: () => this.toggleBook() });
    this.btnSpell.setDepth(2000).setVisible(hasBook);
    this.btnSpell.on('pointerover', () => { if (!this.bookOpen) this.infoText.setText(t('battle.spellsHint')); });
    this.castNote = this.add.text(125, 812, '', textStyle(18, '#d9c7a0')).setOrigin(0.5, 0).setDepth(2000);
    this.manaText.setVisible(hasBook);
    if (hasBook && this.textures.exists('icon_mana')) {
      const ic = this.add.image(0, 0, 'icon_mana').setDepth(2000).setInteractive();
      ic.setScale(34 / ic.width);
      tooltip(this, ic, t('stat.mana'), [t('battle.manaHint')]);
      this.manaText.setData('icon', ic);
    }
    if (this.battle.spellbook('enemy').length) {
      this.add.text(w - 125, 692, '', textStyle(22, '#9fd0ff', true)).setOrigin(0.5, 0).setDepth(2000).setName('enemyMana');
    }
    this.beltBar = this.add.container(0, 0).setDepth(2000);
    this.updateSpellButton();
  }

  /** Belt with potions and scrolls (one per round, does not use up the turn or the spell). */
  private drawBelt(): void {
    if (!this.beltBar) return;
    this.beltBar.removeAll(true);
    const b = this.battle;
    const belt = b.belt('player');
    if (!belt.some((x) => !!x) && !b.usedItems.player.length) return;
    const can = this.inputOpen && b.canUseItem('player');
    belt.forEach((id, i) => {
      const x = 50 + i * 75, y = 885;
      if (!id) {
        const g = this.add.graphics();
        g.lineStyle(2, 0x6a5030, 0.7).strokeRoundedRect(x - 32, y - 32, 64, 64, 8);
        this.beltBar.add(g);
        return;
      }
      const ic = consumableIcon(this, x, y, id, 64);
      const usable = can && b.itemTargets('player', i).length > 0;
      ic.setAlpha(usable ? 1 : 0.5);
      ic.setInteractive({ useHandCursor: usable });
      ic.on('pointerover', () => this.infoText.setText(`${consumableName(id)}: ${consumableDesc(id, b.spellPower('player'))}`));
      ic.on('pointerup', () => { if (usable) this.chooseItem(i); });
      this.beltBar.add(ic);
      if (this.itemTargeting === i) {
        const g = this.add.graphics();
        g.lineStyle(4, 0xffe08a, 1).strokeRoundedRect(x - 35, y - 35, 70, 70, 10);
        this.beltBar.add(g);
      }
    });
  }

  private chooseItem(i: number): void {
    const b = this.battle;
    const targets = b.itemTargets('player', i);
    if (!targets.length || !this.inputOpen) return;
    this.closeBook();
    this.cancelSpell();
    this.cancelTargeting();
    if (targets[0] === -1) { void this.useItem(i); return; }
    this.itemTargeting = i;
    this.hiG.clear();
    const id = b.belt('player')[i];
    const ally = CONSUMABLES[id].kind === 'potion';
    for (const uid of targets) this.polyStack(this.hiG, b.stack(uid), ally ? 0x60d070 : 0x4aa8ff, 0.35, ally ? 0xb0ffb0 : 0xa8d8ff, 0.95);
    this.infoText.setText(t('battle.chooseItemTarget', { item: consumableName(id) }));
    this.drawBelt();
  }

  private cancelItem(): void {
    if (this.itemTargeting === null) return;
    this.itemTargeting = null;
    this.drawHighlights();
    this.drawBelt();
    const s = this.battle.active;
    if (s && this.inputOpen) this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
  }

  private async useItem(i: number, target?: number): Promise<void> {
    const b = this.battle;
    if (!this.inputOpen || !b.isLegalItem('player', i, target)) return;
    this.inputOpen = false;
    this.itemTargeting = null;
    this.setButtonsEnabled(false);
    this.btnAbility.setEnabled(false);
    this.hideAttackCursor();
    this.hiG.clear(); this.hoverG.clear();
    this.infoText.setText('');
    this.drawBelt();
    await this.play(b.useItem('player', i, target));
    this.updateInitBar();
    if (b.winner) { const r = this.resolveInput; this.resolveInput = null; r?.(); return; }
    const s = b.active!;
    this.reach = b.reachable(s);
    this.inputOpen = true;
    this.setButtonsEnabled(true);
    this.btnWait.setEnabled(!s.waited);
    this.updateAbilityButton(s);
    this.updateSpellButton();
    this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
    this.drawHighlights();
  }

  private updateSpellButton(): void {
    this.drawBelt();
    if (!this.btnSpell) return;
    const b = this.battle;
    void b;
    const txt = `${b.mana.player} / ${b.maxMana.player}`;
    this.manaText.setText(txt);
    const ic = this.manaText.getData('icon') as Phaser.GameObjects.Image | undefined;
    ic?.setPosition(this.manaText.x - this.manaText.width / 2 - 22, this.manaText.y + this.manaText.height / 2);
    const em = this.children.getByName('enemyMana') as Phaser.GameObjects.Text | null;
    em?.setText(`${t('stat.mana')} ${b.mana.enemy} / ${b.maxMana.enemy}`);
    if (!b.spellbook('player').length) return;
    const can = this.inputOpen && b.canCast('player') && b.spellbook('player').some((x) => b.spellTargets('player', x.id).length > 0);
    this.btnSpell.setEnabled(can);
    this.castNote.setText(b.castThisRound.player && !b.winner ? t('battle.castDone') : '');
  }

  private toggleBook(): void { if (this.bookOpen) this.closeBook(); else this.openBook(); }

  private closeBook(): void {
    if (!this.bookOpen) return;
    this.bookOpen.destroy();
    this.bookOpen = null;
  }

  /** The hero's spellbook: all known spells, castable ones can be clicked. */
  private openBook(): void {
    const b = this.battle;
    const s = b.active;
    if (!s || s.side !== 'player' || !this.inputOpen || !b.canCast('player') || this.infoOpen?.active) return;
    this.cancelTargeting();
    this.cancelSpell();
    this.hideAttackCursor();
    const { width: w, height: h } = this.scale;
    const book = b.spellbook('player');
    const rows = Math.ceil(book.length / 2);
    const PW = 1180, PH = Math.min(1040, 270 + rows * 150);
    const root = this.add.container(0, 0).setDepth(8000);
    const dim = this.add.rectangle(0, 0, w, h, 0x000000, 0.5).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closeBook());
    root.add(dim);
    root.add(panel(this, w / 2, h / 2, PW, PH, 'ui_panel_dark_wood', 70));
    const top = h / 2 - PH / 2;
    root.add(this.add.text(w / 2, top + 58, t('battle.spellbook'), titleStyle(44)).setOrigin(0.5));
    root.add(this.add.text(w / 2, top + 108, t('battle.spellbookSub', { mana: b.mana.player, max: b.maxMana.player, power: b.spellPower('player') }),
      textStyle(22, '#9fd0ff', true)).setOrigin(0.5));
    book.forEach((slot, i) => {
      const sp = SPELLS[slot.id];
      const x = w / 2 - PW / 2 + 70 + (i % 2) * 540, y = top + 150 + Math.floor(i / 2) * 150;
      const targets = b.spellTargets('player', slot.id);
      const ok = targets.length > 0;
      const cost = b.spellCost('player', slot.id);
      const reason = b.mana.player < cost ? t('battle.noMana') : !ok ? t('battle.noTarget') : '';
      const c = this.add.container(x, y);
      const g = this.add.graphics();
      const draw = (hover: boolean) => {
        g.clear();
        g.fillStyle(hover ? 0x4a3018 : 0x24170c, ok ? 0.92 : 0.6).fillRoundedRect(0, 0, 510, 136, 12);
        g.lineStyle(2, hover ? 0xf3d48a : 0x6a5030, 1).strokeRoundedRect(0, 0, 510, 136, 12);
      };
      draw(false);
      c.add(g);
      const ic = spellIcon(this, 62, 68, slot.id, 96);
      c.add(ic);
      c.add(this.add.text(122, 10, `${spellName(slot.id)}  ${levelStars(slot.level)}  T${sp.tier}`, textStyle(23, SCHOOL_COLOR[sp.school], true)));
      const mi = this.add.image(470, 24, 'icon_mana'); mi.setScale(26 / mi.width);
      c.add(mi);
      c.add(this.add.text(452, 24, String(cost), textStyle(22, b.mana.player >= cost ? '#9fd0ff' : '#e07a6a', true)).setOrigin(1, 0.5));
      c.add(this.add.text(122, 42, reason || spellDesc(slot.id, b.spellPower('player'), slot.level),
        { ...textStyle(18, reason ? '#e0a090' : '#efe3c8'), wordWrap: { width: 375 } }));
      if (!ok) c.setAlpha(0.55);
      else {
        // the whole row is clickable: an own zone (a container hit area is shifted by half its size)
        const hit = this.add.zone(0, 0, 510, 136).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => { draw(true); playSfx(this, 'ui_hover'); });
        hit.on('pointerout', () => draw(false));
        hit.on('pointerup', () => this.chooseSpell(slot.id));
        c.add(hit);
      }
      root.add(c);
    });
    root.add(fitWidth(this.add.text(w / 2, top + PH - 78, t('battle.spellbookHint'), textStyle(19, '#c9b896')).setOrigin(0.5), PW - 200));
    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 120 });
    playSfx(this, 'ui_open', 0.6);
    this.bookOpen = root;
  }

  private chooseSpell(id: string): void {
    this.closeBook();
    const sp = SPELLS[id];
    if (this.battle.castsWithoutTarget('player', id)) { void this.castSpell(id); return; }
    this.spellTargeting = id;
    this.targeting = false;
    this.hiG.clear();
    for (const uid of this.battle.spellTargets('player', id)) {
      this.polyStack(this.hiG, this.battle.stack(uid), 0x4aa8ff, 0.35, 0xa8d8ff, 0.95);
    }
    this.infoText.setText(t('battle.chooseSpellTarget', { spell: spellName(id) }));
  }

  private cancelSpell(): void {
    if (!this.spellTargeting) return;
    this.spellTargeting = null;
    this.drawHighlights();
    const s = this.battle.active;
    if (s && this.inputOpen) this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
  }

  private spellHover(x: number, y: number): void {
    const id = this.spellTargeting!;
    const h = pixelToHex(x, y);
    const st = h ? this.battle.stackAt(h) : undefined;
    if (!st || !this.battle.spellTargets('player', id).includes(st.uid)) {
      this.input.setDefaultCursor('default');
      this.infoText.setText(t('battle.chooseSpellTarget', { spell: spellName(id) }));
      return;
    }
    this.input.setDefaultCursor('pointer');
    const area = SPELLS[id].target === 'area' ? this.battle.areaOf('player', st) : [st];
    for (const v of area) this.polyStack(this.hoverG, v, 0, 0, 0xffffff, 1, 4);
    const pv = this.battle.previewSpell('player', id, st.uid);
    const extra = pv ? t('battle.spellPreview', { dmg: pv.damage, kills: pv.kills }) : spellDesc(id, this.battle.spellPower('player'), this.battle.spellLevel('player', id));
    this.infoText.setText(`${spellName(id)} → ${unitName(st.def)}\n${extra}`);
  }

  private async castSpell(id: string, target?: number): Promise<void> {
    const b = this.battle;
    if (!this.inputOpen || !b.isLegalCast('player', id, target)) return;
    this.inputOpen = false;
    this.spellTargeting = null;
    this.targeting = false;
    this.setButtonsEnabled(false);
    this.btnAbility.setEnabled(false);
    this.hideAttackCursor();
    this.hiG.clear(); this.hoverG.clear();
    this.infoText.setText('');
    this.updateSpellButton();
    await this.play(b.cast('player', id, target));
    this.updateInitBar();
    if (b.winner) { const r = this.resolveInput; this.resolveInput = null; r?.(); return; }
    // the same stack keeps its turn
    const s = b.active!;
    this.reach = b.reachable(s);
    this.inputOpen = true;
    this.setButtonsEnabled(true);
    this.btnWait.setEnabled(!s.waited);
    this.updateAbilityButton(s);
    this.updateSpellButton();
    this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
    this.drawHighlights();
  }

  /** Where a side's hero stands on screen (spells start there). */
  private heroPos(side: Side): { x: number; y: number } {
    const { width: w } = this.scale;
    if (side === 'player') return { x: 125, y: 470 };
    return this.cfg.enemyHero ? { x: w - 125, y: 470 } : { x: w / 2, y: 150 };
  }

  private async animCast(e: Extract<BattleEvent, { type: 'cast' }>): Promise<void> {
    const sp = SPELLS[e.spell];
    const hero = e.side === 'player' ? t(`hero.${this.cfg.playerHero}`) : this.cfg.enemyHero ? t(`hero.${this.cfg.enemyHero}`) : t('battle.enemyHero');
    this.log(t('battle.log.cast', { hero, spell: spellName(e.spell) }));
    this.updateSpellButton();
    const p = this.heroPos(e.side);
    const snd = SPELL_SND[e.spell] ?? (sp.element ? ELEMENT_FX[sp.element].snd : SCHOOL_SND[sp.school]);
    playSfx(this, `sp_${snd}_cast`, 0.8);
    if (e.side === 'player' && !this.auto && this.time.now - this.lastSpellVoice > 20000) {
      this.lastSpellVoice = this.time.now;
      playVoice(this, this.cfg.playerHero, 'spell', 0.9);
    }
    const ck = CAST_FX[sp.school];
    if (this.textures.exists(ck)) {
      const fx = this.add.image(p.x, p.y, ck).setDepth(3200).setAlpha(0);
      fx.setScale(260 / fx.width);
      this.tweens.chain({ targets: fx, tweens: [{ alpha: 1, scale: fx.scale * 1.15, duration: 220 }, { alpha: 0, duration: 400 }], onComplete: () => fx.destroy() });
    }
    const name = this.add.text(p.x, p.y - 230, spellName(e.spell), {
      fontFamily: FONT_TITLE, fontSize: '34px', fontStyle: '900', color: SCHOOL_COLOR[sp.school], stroke: '#000', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(3600).setAlpha(0);
    this.tweens.chain({ targets: name, tweens: [{ alpha: 1, y: name.y - 15, duration: 200 }, { alpha: 0, duration: 400, delay: 600 }], onComplete: () => name.destroy() });
    await this.wait(300);
    // projectile towards the target (damage and enemy spells)
    const tv = e.target !== undefined ? this.views.get(e.target) : undefined;
    const proj = sp.element ? ELEMENT_FX[sp.element].proj : (sp.target !== 'ally' ? 'vfx_proj_rune_bolt' : undefined);
    if (tv && proj && this.textures.exists(proj)) {
      const tx = tv.box.x, ty = tv.box.y - 70;
      const pr = this.add.image(p.x, p.y - 60, proj).setDepth(3300);
      pr.setScale(130 / pr.width).setRotation(Math.atan2(ty - (p.y - 60), tx - p.x));
      await this.tween({ targets: pr, x: tx, y: ty, duration: 160 + Math.hypot(tx - p.x, ty - p.y) * 0.3 });
      pr.destroy();
    }
    // impact picture for spells without damage (damage spells show it on every hit)
    if (tv && !sp.element) {
      const k = SPELL_HIT[e.spell] ?? (sp.target === 'ally' ? 'vfx_hit_holy' : 'vfx_hit_curse');
      if (this.textures.exists(k)) {
        const fx = this.add.image(tv.box.x, tv.box.y - 70, k).setDepth(3000);
        fx.setScale(160 / fx.width);
        this.tweens.add({ targets: fx, scale: fx.scale * 1.25, alpha: 0, duration: 600, onComplete: () => fx.destroy() });
      }
      playSfx(this, `sp_${snd}_impact`, 0.7);
      await this.wait(200);
    }
  }

  private async animItem(e: Extract<BattleEvent, { type: 'useItem' }>): Promise<void> {
    const hero = e.side === 'player' ? t(`hero.${this.cfg.playerHero}`) : t('battle.enemyHero');
    this.log(t('battle.log.item', { hero, item: consumableName(e.item) }));
    this.drawBelt();
    const p = this.heroPos(e.side);
    const ic = consumableIcon(this, p.x, p.y - 120, e.item, 90).setDepth(3600).setAlpha(0);
    this.tweens.chain({ targets: ic, tweens: [{ alpha: 1, y: ic.y - 30, duration: 200 }, { alpha: 0, duration: 350, delay: 400 }], onComplete: () => ic.destroy() });
    playSfx(this, CONSUMABLES[e.item].kind === 'potion' ? 'cb_heal' : 'ui_open', 0.6);
    if (e.item === 'potionMana') { this.updateSpellButton(); this.floatTextAt(p.x, p.y - 200, '+12 Mana', '#9fd0ff'); }
    const tv = e.target !== undefined ? this.views.get(e.target) : undefined;
    if (tv && CONSUMABLES[e.item].kind === 'potion') {
      const fx = this.add.image(tv.box.x, tv.box.y - 70, 'vfx_hit_heal').setDepth(3000);
      fx.setScale(150 / fx.width);
      this.tweens.add({ targets: fx, alpha: 0, y: fx.y - 30, duration: 600, onComplete: () => fx.destroy() });
    }
    await this.wait(350);
  }

  private floatTextAt(x: number, y: number, text: string, color: string): void {
    const tx = this.add.text(x, y, text, { fontFamily: FONT_TITLE, fontSize: '32px', fontStyle: '900', color, stroke: '#000', strokeThickness: 6 })
      .setOrigin(0.5).setDepth(3600);
    this.tweens.add({ targets: tx, y: y - 50, alpha: 0, duration: 1100, onComplete: () => tx.destroy() });
  }

  private async animSpellHit(e: Extract<BattleEvent, { type: 'spellHit' }>): Promise<void> {
    const v = this.views.get(e.uid);
    if (!v) return;
    const sp = SPELLS[e.spell];
    const fxd = ELEMENT_FX[sp.element ?? 'holy'];
    playSfx(this, `sp_${SPELL_SND[e.spell] ?? fxd.snd}_impact`, 0.8);
    if (this.textures.exists(fxd.hit)) {
      const fx = this.add.image(v.box.x, v.box.y - 70, fxd.hit).setDepth(3000);
      fx.setScale(170 / fx.width);
      this.tweens.add({ targets: fx, scale: fx.scale * 1.3, alpha: 0, duration: 500, onComplete: () => fx.destroy() });
    }
    v.sprite.setTint(0xff8a6a);
    this.time.delayedCall(180, () => v.sprite.clearTint());
    if (e.damage > 0) this.floatText(e.uid, `-${e.damage}`, '#ffb070');
    if (e.kills > 0) this.floatText(e.uid, `☠ ${e.kills}`, '#ffffff', -40, 120);
    this.setCount(e.uid, e.left);
    this.log(t('battle.log.spellHit', { spell: spellName(e.spell), b: unitName(v.stack.def), dmg: e.damage, kills: e.kills }));
    await this.wait(260);
  }

  // ---------- input ----------

  /** Work out what a click at (x,y) would do for the active player stack. */
  private actionAt(x: number, y: number): { action: Action; target?: Stack; from?: Hex } | null {
    const s = this.battle.active;
    if (!s || !this.inputOpen) return null;
    const h = pixelToHex(x, y);
    if (!h) return null;
    const occ = this.battle.stackAt(h);
    if (this.targeting) {
      if (occ && this.battle.abilityTargets(s).includes(occ.uid)) return { action: { type: 'ability', target: occ.uid }, target: occ };
      return null;
    }
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
    if (this.bookOpen) { this.showEnemyReach(null); return; }
    {
      // red hexes: how far the enemy under the mouse can move
      const hh = pixelToHex(x, y);
      const st = hh ? this.battle.stackAt(hh) : undefined;
      this.showEnemyReach(!this.spellTargeting && this.itemTargeting === null && st && st.side === 'enemy' && st.count > 0 ? st : null);
    }
    if (this.deploying) { this.deployHover(x, y); return; }
    if (this.spellTargeting) { this.spellHover(x, y); return; }
    if (this.itemTargeting !== null) {
      const h = pixelToHex(x, y);
      const st = h ? this.battle.stackAt(h) : undefined;
      const ok = !!st && this.battle.itemTargets('player', this.itemTargeting).includes(st.uid);
      this.input.setDefaultCursor(ok ? 'pointer' : 'default');
      if (ok) {
        const id = this.battle.belt('player')[this.itemTargeting];
        const area = CONSUMABLES[id].target === 'area' ? this.battle.areaOf('player', st!) : [st!];
        for (const v of area) this.polyStack(this.hoverG, v, 0, 0, 0xffffff, 1, 4);
        this.infoText.setText(`${consumableName(id)} → ${unitName(st!.def)}`);
      }
      return;
    }
    const h = pixelToHex(x, y);
    const occ = h ? this.battle.stackAt(h) : undefined;
    const a = this.actionAt(x, y);
    const s = this.battle.active;
    if (a && s && a.action.type === 'ability' && a.target) {
      this.polyStack(this.hoverG, a.target, 0, 0, 0xffffff, 1, 4);
      this.input.setDefaultCursor('pointer');
      const ab = this.battle.ability(s)!;
      this.infoText.setText(`${t(`ability.${ab.id}.name`)} → ${unitName(a.target.def)}`);
      return;
    }
    if (this.targeting) { this.input.setDefaultCursor('default'); return; }
    if (a && s) {
      const g = this.hoverG;
      if (a.action.type === 'move') {
        for (const step of this.reach.get(key(a.action.to)) ?? []) g.fillStyle(0xffffff, 0.22).fillPoints(hexPoly(step, 10), true);
        for (const c of this.battle.cells(s, a.action.to)) g.lineStyle(3, 0xffffff, 0.9).strokePoints(hexPoly(c, 4), true, true);
        this.input.setDefaultCursor('pointer');
        this.hideAttackCursor(false);
      } else if (a.target) {
        const ranged = a.action.type === 'shoot';
        if (a.from && !eq(a.from, s.pos)) {
          for (const step of this.reach.get(key(a.from)) ?? []) g.fillStyle(0xffffff, 0.22).fillPoints(hexPoly(step, 10), true);
          g.lineStyle(3, 0xffffff, 0.9).strokePoints(hexPoly(a.from, 4), true, true);
        }
        this.polyStack(g, a.target, 0, 0, 0xffd27a, 1, 4);
        const pv = this.battle.preview(s, a.target, ranged, a.from ?? s.pos);
        this.infoText.setText(t(ranged ? 'battle.preview.shoot' : 'battle.preview.melee', {
          b: unitName(a.target.def), min: pv.minDmg, max: pv.maxDmg, kmin: pv.minKills, kmax: pv.maxKills, shots: s.shots - 1,
        }));
        this.showAttackCursor(x, y, ranged ? null : (a.from ?? s.pos), a.target.pos);
        return;
      }
    } else {
      this.hideAttackCursor();
    }
    if (occ) this.infoText.setText(this.stackInfo(occ));
    else if (s && this.inputOpen) this.infoText.setText(t('battle.yourTurn', { unit: unitName(s.def) }));
  }

  /** Movement range of an enemy stack in red (null clears it). Redrawn only when the stack changes. */
  private enemyReachUid: number | null = null;
  private showEnemyReach(st: Stack | null): void {
    const uid = st ? st.uid : null;
    if (uid === this.enemyReachUid && !st) return;
    this.enemyReachUid = uid;
    const g = this.enemyReachG;
    g.clear();
    if (!st) return;
    for (const [, path] of this.battle.reachable(st)) {
      const h = path[path.length - 1];
      for (const c of this.battle.cells(st, h)) {
        g.fillStyle(0xe8160c, 0.3).fillPoints(hexPoly(c, 8), true);
        g.lineStyle(2, 0xff4030, 0.8).strokePoints(hexPoly(c, 8), true, true);
      }
    }
    this.polyStack(g, st, 0xff3a2a, 0.18, 0xff8a7a, 0.9, 3);
  }

  /** Sword at the mouse pointer, tip on the pointer, blade pointing from the attack hex to the target. */
  private showAttackCursor(x: number, y: number, from: Hex | null, target: Hex): void {
    const c = this.cursorIcon;
    if (from) {
      const a = hexCenter(from), b = hexCenter(target);
      const angle = Math.atan2(b.y - a.y, b.x - a.x); // on-screen direction
      // the icon's blade points up-right (-45°); its tip sits near the top-right corner
      c.setTexture('cursor_sword').setOrigin(0.88, 0.12).setDisplaySize(84, 84);
      c.setRotation(angle + Math.PI / 4);
    } else {
      c.setTexture('cursor_shoot').setOrigin(0.5, 0.5).setDisplaySize(76, 76).setRotation(0);
    }
    c.setPosition(x, y).setVisible(true);
    this.input.setDefaultCursor('none');
  }

  private hideAttackCursor(resetCursor = true): void {
    this.cursorIcon?.setVisible(false);
    if (resetCursor) this.input.setDefaultCursor('default');
  }

  private stackInfo(s: Stack): string {
    const d = s.def;
    const tags: string[] = [];
    if (d.ranged) tags.push(t('passive.ranged', { n: s.shots }));
    if (d.flying) tags.push(t('passive.flying'));
    const race = racePassive(d);
    if (race) tags.push(t(`race.${race}.name`));
    for (const p of d.passives ?? []) tags.push(t(`passiveName.${p}`));
    if (d.active) tags.push(`${t(`ability.${d.active}.name`)}${s.cooldown > 0 ? ` (${s.cooldown})` : ''}`);
    return t('battle.info', {
      name: unitName(d), count: s.count, top: s.topHp, hp: d.hp,
      atk: d.atk + this.battle.heroes[s.side].atk, def: d.def + this.battle.heroes[s.side].def,
      dmin: d.dmg[0], dmax: d.dmg[1], ini: d.ini, spd: d.speed,
    }) + (tags.length ? `\n${tags.join('  ·  ')}` : '');
  }

  private onClick(x: number, y: number): void {
    if (this.bookOpen) return;
    if (this.deploying) { this.deployClick(x, y); return; }
    if (this.itemTargeting !== null) {
      const h = pixelToHex(x, y);
      const st = h ? this.battle.stackAt(h) : undefined;
      if (st && this.battle.itemTargets('player', this.itemTargeting).includes(st.uid)) void this.useItem(this.itemTargeting, st.uid);
      return;
    }
    if (this.spellTargeting) {
      const h = pixelToHex(x, y);
      const st = h ? this.battle.stackAt(h) : undefined;
      if (st && this.battle.spellTargets('player', this.spellTargeting).includes(st.uid)) void this.castSpell(this.spellTargeting, st.uid);
      return;
    }
    const a = this.actionAt(x, y);
    if (a) { void this.playerAction(a.action); return; }
    if (this.targeting) return;
    const h = pixelToHex(x, y);
    const st = h ? this.battle.stackAt(h) : undefined;
    if (st) this.inspect(st);
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
        items.push(line, fitWidth(this.add.text(x + 16, 0, t('battle.round', { n: this.battle.round + 1 }).replace(' ', '\n'), {
          fontFamily: FONT_TITLE, fontSize: '17px', fontStyle: '700', color: COLOR.gold, stroke: '#000', strokeThickness: 4,
          align: 'center',
        }).setOrigin(0, 0.5), 72));
        x += 92;
      }
      const size = i === 0 ? 104 : 80;
      const frame = this.add.graphics();
      const col = s.side === 'player' ? 0x3a78d8 : 0xd84a3a;
      frame.fillStyle(0x140d08, 0.9).fillRoundedRect(x, -size / 2, size, size, 10);
      const img = this.add.image(x + size / 2, 0, portraitKey(s.def));
      img.setDisplaySize(size - 8, size - 8);
      img.setInteractive({ useHandCursor: true }).on('pointerup', () => this.inspect(s));
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
    let spell: string | null = null;   // statuses after a cast come from that spell
    for (const e of events) {
      switch (e.type) {
        case 'cast': spell = e.spell; await this.animCast(e); break;
        case 'useItem': spell = e.item; await this.animItem(e); break;
        case 'spellHit': await this.animSpellHit(e); break;
        case 'resist':
          this.floatText(e.uid, t('battle.resist'), '#d0d0d0', -60);
          this.log(t('battle.log.resist', { a: unitName(this.battle.stack(e.uid).def) }));
          await this.wait(300);
          break;
        case 'ward':
          this.floatText(e.uid, t('battle.absorbed', { n: e.absorbed }), '#9fe0ff', -100);
          this.refreshStatus(e.uid);
          break;
        case 'round':
          if (e.round > 1) await this.roundBanner(e.round);
          break;
        case 'turn':
          if (this.battle.stack(e.uid).side === 'player' && !this.auto) playSfx(this, 'cb_turn_start', 0.45);
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
        case 'morale': {
          const v = this.views.get(e.uid);
          if (v) {
            this.log(t('battle.log.morale', { a: unitName(v.stack.def) }));
            this.floatText(e.uid, t('battle.morale'), '#ffe08a', -60);
            playSfx(this, 'cb_buff', 0.8);
            this.tweens.add({ targets: v.sprite, scaleX: v.sprite.scaleX * 1.08, scaleY: v.sprite.scaleY * 1.08, duration: 160, yoyo: true });
          }
          await this.wait(450);
          break;
        }
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
        case 'ability': await this.animAbility(e.uid, e.ability); break;
        case 'status':
          this.refreshStatus(e.uid);
          if (spell && e.on) {
            const good = BUFFS.has(e.status);
            this.floatText(e.uid, t(`statusShort.${e.status}`), good ? '#9fe39f' : '#d8a0ff', -60);
            const v = this.views.get(e.uid);
            if (v) {
              const k = good ? 'vfx_fx_buff_up' : 'vfx_fx_debuff_down';
              if (this.textures.exists(k)) {
                const fx = this.add.image(v.box.x, v.box.y - 90, k).setDepth(3000);
                fx.setScale(120 / fx.width);
                this.tweens.add({ targets: fx, y: fx.y + (good ? -40 : 30), alpha: 0, duration: 700, onComplete: () => fx.destroy() });
              }
              if (!good) playSfx(this, 'cb_debuff', 0.6);
            }
            await this.wait(250);
          }
          break;
        case 'dot': {
          const v = this.views.get(e.uid);
          if (v) {
            const burn = e.source === 'burn';
            const col = burn ? 0xffa060 : e.source === 'trap' || e.source === 'thorns' ? 0xff8a70 : e.source === 'skill' ? 0x9fd0ff
              : e.source === 'decay' ? 0xc9a8ff : e.source === 'hellfire' ? 0xff7a3a : 0x80ff80;
            const hitFx = e.source === 'decay' ? 'vfx_hit_death_smoke' : e.source === 'hellfire' ? 'vfx_hit_fire_explosion' : '';
            if (hitFx && this.textures.exists(hitFx)) {
              const fx = this.add.image(v.box.x, v.box.y - 70, hitFx).setDepth(3000);
              fx.setScale(160 / fx.width);
              this.tweens.add({ targets: fx, scale: fx.scale * 1.3, alpha: 0, duration: 550, onComplete: () => fx.destroy() });
              playSfx(this, e.source === 'decay' ? 'sp_death_impact' : 'sp_fire_impact', 0.6);
            }
            this.floatText(e.uid, `-${e.damage}`, `#${col.toString(16).padStart(6, '0')}`);
            v.sprite.setTint(col);
            this.time.delayedCall(200, () => v.sprite.clearTint());
            this.setCount(e.uid, e.left);
            const lk = e.source === 'thorns' ? 'battle.log.thorns' : burn ? 'battle.log.burn' : e.source === 'trap' ? 'battle.log.trapDmg'
              : e.source === 'skill' || e.source === 'decay' || e.source === 'hellfire' ? 'battle.log.skillDmg' : 'battle.log.poison';
            this.log(t(lk, { a: unitName(v.stack.def), dmg: e.damage, kills: e.kills }));
            await this.wait(350);
          }
          break;
        }
        case 'summon': {
          const st = this.battle.stack(e.uid);
          this.createView(st);
          const v = this.views.get(e.uid)!;
          v.box.setAlpha(0).setScale(0.6);
          this.log(t('battle.log.summon', { a: unitName(st.def) }));
          await this.tween({ targets: v.box, alpha: 1, scale: 1, duration: 400 });
          break;
        }
        case 'vanish': {
          const v = this.views.get(e.uid);
          if (v) {
            this.log(t('battle.log.vanish', { a: unitName(v.stack.def) }));
            await this.tween({ targets: v.box, alpha: 0, duration: 400 });
            v.box.destroy(); v.over.destroy(); this.views.delete(e.uid);
          }
          break;
        }
        case 'teleport': {
          const v = this.views.get(e.uid)!;
          const to = this.stackCenter(v.stack, e.to);
          playSfx(this, 'cb_fly', 0.7);
          this.tweens.add({ targets: v.sprite, y: v.sprite.y - 50, duration: 160, yoyo: true });
          await this.tween({ targets: v.box, x: to.x, y: to.y, duration: 320, ease: 'Sine.inOut' });
          v.box.setDepth(to.y + 10);
          break;
        }
        case 'skip': {
          const v = this.views.get(e.uid);
          if (v) { this.floatText(e.uid, t('battle.fear'), '#c9a8ff'); this.log(t('battle.log.fear', { a: unitName(v.stack.def) })); }
          await this.wait(500);
          break;
        }
        case 'skill': {
          const name = t(e.name);
          const who = e.uid !== undefined ? unitName(this.battle.stack(e.uid).def) : t(`hero.${e.side === 'player' ? this.cfg.playerHero : this.cfg.enemyHero ?? ''}`);
          this.log(t('battle.log.skill', { a: who, skill: name }));
          playSfx(this, 'cb_buff', 0.8);
          if (e.uid !== undefined) {
            this.floatText(e.uid, name, '#ffb347', -110);
            const v = this.views.get(e.uid);
            if (v) this.tweens.add({ targets: v.sprite, scaleX: v.sprite.scaleX * 1.08, scaleY: v.sprite.scaleY * 1.08, duration: 180, yoyo: true });
          } else {
            this.floatTextAt(e.side === 'player' ? 125 : this.scale.width - 125, 400, name, '#ffb347');
          }
          await this.wait(650);
          break;
        }
        case 'trap':
          if (e.on) {
            this.addTrapView(e.hex, e.side);
            playSfx(this, 'cb_block', 0.5);
            await this.wait(220);
          } else {
            const tv = this.trapViews.get(key(e.hex));
            if (tv) { this.trapViews.delete(key(e.hex)); this.tweens.add({ targets: tv, scale: 1.4, alpha: 0, duration: 350, onComplete: () => tv.destroy() }); }
            if (e.uid !== undefined) {
              playSfx(this, 'cb_hit_blunt');
              this.floatText(e.uid, t('battle.trapped'), '#ff8a70', -60);
              this.log(t('battle.log.trapped', { a: unitName(this.battle.stack(e.uid).def) }));
            }
            await this.wait(300);
          }
          break;
        case 'flee': {
          const v = this.views.get(e.uid);
          if (v) {
            this.floatText(e.uid, t('battle.fled'), '#ffe08a', -60);
            this.log(t('battle.log.fled', { a: unitName(v.stack.def) }));
            playSfx(this, 'ui_coins', 0.7);
            await this.tween({ targets: v.box, x: v.box.x + (v.stack.side === 'enemy' ? 260 : -260), alpha: 0, duration: 650, ease: 'Sine.in' });
            v.box.destroy(); v.over.destroy(); this.views.delete(e.uid);
          }
          break;
        }
        case 'end': break;
      }
    }
  }

  /** A trap on the board (bear trap with a ring in the owner's colour). */
  private addTrapView(h: Hex, side: Side): void {
    const p = hexCenter(h);
    const c = this.add.container(p.x, p.y + 6).setDepth(1);
    const ring = this.add.graphics();
    ring.lineStyle(3, side === 'enemy' ? 0xff5040 : 0x6fb6ff, 0.8).strokeEllipse(0, 4, HEX_W * 0.62, HEX_W * 0.32);
    c.add(ring);
    if (this.textures.exists('trap_bear')) {
      const im = this.add.image(0, 0, 'trap_bear');
      im.setScale(HEX_W * 0.58 / im.width);
      c.add(im);
    }
    c.setScale(0.3).setAlpha(0);
    this.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.out' });
    this.trapViews.get(key(h))?.destroy();
    this.trapViews.set(key(h), c);
  }

  private async animAbility(uid: number, ability: string): Promise<void> {
    const v = this.views.get(uid);
    if (!v) return;
    this.log(t('battle.log.ability', { a: unitName(v.stack.def), ability: t(`ability.${ability}.name`) }));
    playSfx(this, 'cb_buff', 0.7);
    const k = ABILITY_ICON[ability];
    if (k && this.textures.exists(k)) {
      const ic = this.add.image(v.box.x, v.box.y - 150, k).setDepth(3500);
      ic.setScale(90 / ic.width).setAlpha(0);
      this.tweens.chain({ targets: ic, tweens: [{ alpha: 1, y: ic.y - 20, duration: 200 }, { alpha: 0, y: ic.y - 50, duration: 500, delay: 300 }], onComplete: () => ic.destroy() });
    }
    this.floatText(uid, t(`ability.${ability}.name`), '#d8b0ff', -60);
    await this.wait(450);
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
      const to = this.stackCenter(v.stack, path[path.length - 1]);
      const dur = 220 + 70 * Math.hypot(to.x - v.box.x, to.y - v.box.y) / HEX_W;
      const sy = v.sprite.y;
      this.tweens.add({ targets: v.sprite, y: sy - 60, duration: dur / 2, yoyo: true, ease: 'Sine.out' });
      await this.tween({ targets: v.box, x: to.x, y: to.y, duration: dur, ease: 'Sine.inOut',
        onUpdate: () => v.box.setDepth(v.box.y + 10) } as Phaser.Types.Tweens.TweenBuilderConfig);
    } else {
      playSfx(this, 'cb_move', 0.7);
      for (const step of path) {
        const to = this.stackCenter(v.stack, step);
        if (to.x !== v.box.x) this.face(v.sprite, to.x < v.box.x);
        await this.tween({ targets: v.box, x: to.x, y: to.y, duration: 140, onUpdate: () => v.box.setDepth(v.box.y + 10) } as Phaser.Types.Tweens.TweenBuilderConfig);
      }
    }
    this.face(v.sprite, v.stack.side === 'enemy');
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
    this.face(av.sprite, facing);

    if (e.counter) this.floatText(e.uid, t('battle.counter'), '#ffd27a', -150);

    if (e.ranged) {
      const f = att.def.faction;
      const proj = f === 'undead' ? 'vfx_proj_shadow_bolt' : f === 'demon' ? 'vfx_proj_fire_spark' : f === 'elf' || f === 'orc' ? 'vfx_proj_arrow'
        : att.def.passives?.includes('curseHit') ? 'vfx_proj_rune_bolt' : 'vfx_proj_crossbow_bolt';
      const sx = av.box.x + (facing ? -40 : 40), sy = av.box.y - 70;
      const tx = tv.box.x, ty = tv.box.y - 60;
      const p = this.add.image(sx, sy, proj).setDepth(3000);
      p.setScale(110 / p.width).setRotation(Math.atan2(ty - sy, tx - sx));
      playSfx(this, f === 'undead' ? 'sp_death_cast' : f === 'demon' ? 'sp_fire_cast' : f === 'elf' || f === 'orc' ? 'cb_hit_arrow' : 'cb_counter', 0.5);
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
    if (e.crit) { this.floatText(e.target, t('battle.crit'), '#ffb347', -80); playSfx(this, 'cb_crit', 0.8); }
    if (e.kills > 0) this.floatText(e.target, `☠ ${e.kills}`, '#ffffff', -40, 120);
    this.setCount(e.target, e.left);

    const key = e.counter ? 'battle.log.counter' : e.ranged ? 'battle.log.shoot' : 'battle.log.melee';
    this.log(t(key, { a: name, b: tname, dmg: e.damage, kills: e.kills }));
    await this.wait(380);
    this.face(av.sprite, att.side === 'enemy');
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
    const fa = v.stack.def.faction;
    playSfx(this, v.stack.def.undead ? 'cb_death_undead' : fa === 'demon' ? 'cb_death_demon' : fa === 'neutral' && !v.stack.def.id.includes('bandit') ? 'cb_death_beast' : 'cb_death_human');
    this.log(t('battle.log.death', { a: unitName(v.stack.def) }));
    const smoke = this.add.image(v.box.x, v.box.y - 50, 'vfx_hit_death_smoke').setDepth(3000);
    smoke.setScale(170 / smoke.width).setAlpha(0.9);
    this.tweens.add({ targets: smoke, alpha: 0, scale: smoke.scale * 1.4, duration: 700, onComplete: () => smoke.destroy() });
    await this.tween({ targets: v.box, alpha: 0, y: v.box.y + 20, duration: 500 });
    v.box.destroy(); v.over.destroy();
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
    if (this.logText) {
      // keep the log left of the turn text (large text setting)
      this.logText.setScale(1).setText(this.logLines.join('\n'));
      if (this.logText.height > 140) this.logText.setScale(140 / this.logText.height);
    }
  }

  // ---------- result ----------

  private showResult(winner: Side): void {
    const { width: w, height: h } = this.scale;
    if (this.cfg.mode === 'run' && this.battle.usedItems.player.length) {
      try {
        const r = currentRun();
        for (const i of this.battle.usedItems.player) if (r.belt) r.belt[i] = null;
        saveRun();
      } catch { /* no run */ }
    }
    const won = winner === 'player';
    playSfx(this, won ? 'ev_victory_crowd' : 'cb_death_human');
    playStinger(this, won ? 'stinger_victory' : 'stinger_defeat');
    if (won) this.time.delayedCall(1300, () => playVoice(this, this.cfg.playerHero, 'victory'));
    this.closeBook();
    this.beltBar?.setVisible(false);
    for (const o of [this.initBar, this.infoText, this.logText, this.btnWait, this.btnDefend, this.btnAuto, this.btnAbility, this.btnSpell, this.manaText, this.castNote]) {
      this.tweens.add({ targets: o, alpha: 0, duration: 300 });
    }
    this.hideAttackCursor();
    const layer = this.add.container(0, 0).setDepth(5000).setAlpha(0);
    const img = this.add.image(w / 2, h / 2, won ? 'ui_victory_screen' : 'ui_defeat_screen').setDisplaySize(w, h);
    const title = this.add.text(w / 2, 170, t(won ? 'battle.victory' : 'battle.defeat'), {
      fontFamily: FONT_TITLE, fontSize: '110px', fontStyle: '900', color: won ? COLOR.gold : '#e8c8c0', stroke: '#2a1608', strokeThickness: 14,
    }).setOrigin(0.5);
    const losses = this.battle.stacks
      .filter((s) => s.side === 'player' && s.summonRounds === undefined && s.startCount > s.count)
      .map((s) => t('battle.lossItem', { name: unitName(s.def), lost: s.startCount - s.count, total: s.startCount }));
    // battle rating (run fights only): fewer losses = rank S..D, better ranks give more city resources
    const rated = won && this.cfg.mode === 'run';
    const rk = rankFor(this.battle.lossShare('player'));
    const sum = this.add.text(w / 2, rated ? 455 : 290, losses.length ? t('battle.losses', { list: losses.join(', ') }) : t('battle.noLosses'), {
      fontFamily: FONT_BODY, fontSize: '34px', color: COLOR.light, stroke: '#000', strokeThickness: 6, align: 'center',
      wordWrap: { width: 1400 },
    }).setOrigin(0.5);
    layer.add([img, title, sum]);
    if (rated) {
      const badge = this.add.text(w / 2, 300, rk.rank, {
        fontFamily: FONT_TITLE, fontSize: '150px', fontStyle: '900', color: rk.color, stroke: '#2a1608', strokeThickness: 14,
      }).setOrigin(0.5);
      const label = this.add.text(w / 2, 385, t('rating.line', { rank: rk.rank }) + (rk.mult > 1 ? '  ·  ' + t('rating.bonus', { x: fmtMult(rk.mult, settings.lang) }) : ''), {
        fontFamily: FONT_BODY, fontSize: '32px', color: rk.color, stroke: '#000', strokeThickness: 6,
      }).setOrigin(0.5);
      layer.add([badge, label]);
      badge.setScale(0.2);
      this.tweens.add({ targets: badge, scale: 1, delay: 450, duration: 450, ease: 'Back.Out' });
    }
    this.tweens.add({ targets: layer, alpha: 1, duration: 700 });
    const buttons: Button[] = [];
    if (this.cfg.mode === 'run') {
      const cfg = this.cfg;
      buttons.push(new Button(this, w / 2, h - 120, t('common.continue'), { style: 'red', width: 400, fontSize: 30,
        onClick: () => (won ? this.scene.start('Reward', { config: cfg, treasure: this.battle.treasureKilled(), rank: rk.rank }) : this.scene.start('RunEnd', { won: false })) }));
    } else {
      buttons.push(new Button(this, w / 2 - 230, h - 120, t('battle.again'), { style: 'red', width: 400, fontSize: 30,
        onClick: () => this.scene.restart({ config: testBattleConfig() }) }));
      buttons.push(new Button(this, w / 2 + 230, h - 120, t('battle.toTitle'), { width: 400, fontSize: 30,
        onClick: () => this.scene.start('Title') }));
    }
    for (const b of buttons) { b.setDepth(5001).setAlpha(0); this.tweens.add({ targets: b, alpha: 1, delay: 500, duration: 400 }); }
  }
}
