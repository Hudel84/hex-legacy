// Hero talents (v0.16, GDD 17.5): talent THEMES with three ranks. Gaining a rank gives its base effect and a
// choice of upgrades (rank 1 and 2: one of three, rank 3: one of two legendary ones). A hero starts with the
// rank 1 of his own theme and can hold at most MAX_THEMES themes per run.
//
// Every base effect and every upgrade is an ordinary PerkDef (kind 'talent') in PERKS, so battle modifiers,
// one-time stats and run factors work like before; RunState.themes remembers the ranks.
import type { PerkDef, Rarity } from './perks';
import type { ModPatch } from '../battle/mods';
import type { School } from '../battle/spells';

export const MAX_THEMES = 3;
export const MAX_RANK = 3;

type Eff = Pick<PerkDef, 'mods' | 'once' | 'run'>;
interface RankSpec { base: Eff; ups: [string, string, Eff][] }   // upgrades: [id suffix, icon, effects]
export interface ThemeDef { id: string; icon: string; magic?: School; ranks: [RankSpec, RankSpec, RankSpec] }

const m = (mods: ModPatch): Eff => ({ mods });
const o = (once: NonNullable<PerkDef['once']>): Eff => ({ once });
const r = (run: NonNullable<PerkDef['run']>): Eff => ({ run });
const both = (...e: Eff[]): Eff => e.reduce((a, b) => ({
  mods: { ...a.mods, ...b.mods }, once: { ...a.once, ...b.once }, run: { ...a.run, ...b.run },
}), {} as Eff);

/** The six magic themes share one pattern (Ben's example "light magic", GDD 17.5). */
function magic(id: string, school: School, icon: string, r1: [string, string, Eff], r2: [string, string, Eff], r3alt?: [string, string, Eff]): ThemeDef {
  const k = (x: string) => `${school}${x}` as keyof ModPatch;
  return {
    id, icon, magic: school,
    ranks: [
      { base: {}, ups: [['a', 'channeling', m({ [k('Dmg')]: 0.2 })], r1, ['c', 'mana_split', m({ [k('Cost')]: 0.2 })]] },
      { base: {}, ups: [r2, ['b', 'spell_focus', m({ [k('Dmg')]: 0.5 })], ['c', 'quick_cast', m({ [k('Free')]: 1 })]] },
      { base: {}, ups: [r3alt ?? ['a', 'cosmic_hands', m({ [k('MassAlly')]: 1 })], ['b', 'whirlwind', m({ [k('MassEnemy')]: 1 })]] },
    ],
  };
}

export const THEMES: ThemeDef[] = [
  { id: 'leader', icon: 'command_tent', ranks: [
    { base: o({ lead: 10 }), ups: [['a', 'larger_army', r({ leadPct: 0.05 })], ['b', 'recruitment', r({ leadWin: 5 })], ['c', 'herald', m({ hp: 0.08 })]] },
    { base: o({ lead: 15 }), ups: [['a', 'crossed_swords_banner', m({ morale: 0.1 })], ['b', 'war_drum', o({ lead: 10, atk: 1 })], ['c', 'counter_strike', m({ counters: 1 })]] },
    { base: o({ lead: 20 }), ups: [['a', 'generals_baton', r({ leadPct: 0.1 })], ['b', 'glory', m({ dmg: 0.12, taken: 0.08 })]] },
  ] },
  { id: 'morale', icon: 'lion_roar', ranks: [
    { base: m({ morale: 0.1 }), ups: [['a', 'marching_drum', m({ morale: 0.05, ini: 1 })], ['b', 'war_paint', m({ moraleDmg: 0.3 })], ['c', 'advance', m({ firstStrike: 0.2 })]] },
    { base: m({ morale: 0.1 }), ups: [['a', 'herald', m({ morale: 0.1 })], ['b', 'field_medic', m({ regen: 0.03 })], ['c', 'iron_grip', m({ melee: 0.1 })]] },
    { base: m({ morale: 0.15 }), ups: [['a', 'glory', m({ moraleDmg: 0.6, dmg: 0.08 })], ['b', 'steadfast', m({ taken: 0.12, morale: 0.1 })]] },
  ] },
  magic('lightMagic', 'light', 'sun_and_moon', ['b', 'holy_bell', m({ spellHeal: 0.3 })], ['a', 'new_dawn', m({ autoHeal: 1 })]),
  { id: 'deathDecay', icon: 'death_hourglass', ranks: [
    { base: m({ decay: 1 }), ups: [['a', 'soul_grasp', m({ decayWeak: 1 })], ['b', 'armor_crusher', m({ decayArmor: 1 })], ['c', 'thorn_club', m({ decayPoison: 0.4 })]] },
    { base: m({ decay: 1 }), ups: [['a', 'soul_chain', m({ decaySlow: 1 })], ['b', 'dark_candle', m({ decay: 0.6 })], ['c', 'bone_horn', m({ decayFear: 0.15 })]] },
    { base: m({ decay: 1 }), ups: [['a', 'stitched_heart', m({ decayWeak: 2, decayArmor: 2, decay: 0.3 })], ['b', 'restless_dead', m({ raise: 1, decay: 0.3 })]] },
  ] },
  magic('darkMagic', 'dark', 'spectral_hand', ['b', 'soul_jar', m({ lifesteal: 0.08 })], ['a', 'reaper', m({ executioner: 0.2 })]),
  { id: 'plunder', icon: 'plunder', ranks: [
    { base: r({ item: 0.15 }), ups: [['a', 'torchbearer', r({ cons: 0.15 })], ['b', 'treasure_hunter', r({ gold: 0.15 })], ['c', 'winged_coin', o({ gold: 80 })]] },
    { base: r({ item: 0.15 }), ups: [['a', 'cracked_coffin', r({ artifact: 0.1 })], ['b', 'boar_trophy', r({ item: 0.15 })], ['c', 'soul_grasp', m({ executioner: 0.2 })]] },
    { base: r({ item: 0.2 }), ups: [['a', 'bone_raven', r({ artifact: 0.25 })], ['b', 'lucky_horseshoe', r({ itemRare: 1, item: 0.1 })]] },
  ] },
  { id: 'archery', icon: 'arrow_rain', ranks: [
    { base: m({ ranged: 0.1 }), ups: [['a', 'endless_quiver', m({ shots: 3 })], ['b', 'armor_piercing', m({ pierceDef: 0.2 })], ['c', 'eagle_eye', m({ firstStrike: 0.2 })]] },
    { base: m({ ranged: 0.1 }), ups: [['a', 'split_arrow', m({ splitShot: 0.5 })], ['b', 'sniper', m({ markShots: 1 })], ['c', 'poison_arrows', m({ poison: 0.15 })]] },
    { base: m({ ranged: 0.15 }), ups: [['a', 'triple_shot', m({ splitShot: 0.75, ranged: 0.1 })], ['b', 'hawk_eye_aim', m({ crit: 0.15, critDmg: 0.5 })]] },
  ] },
  magic('natureMagic', 'nature', 'mighty_acorn', ['b', 'herbalism', m({ regen: 0.03 })], ['a', 'thorn_club', m({ poison: 0.15 })]),
  { id: 'crit', icon: 'blood_eye', ranks: [
    { base: m({ crit: 0.08 }), ups: [['a', 'sharpened_blades', m({ critDmg: 0.3 })], ['b', 'foresight', m({ firstStrike: 0.2 })], ['c', 'adrenaline', m({ ini: 1 })]] },
    { base: m({ crit: 0.08 }), ups: [['a', 'double_strike', m({ critDmg: 0.5 })], ['b', 'reaper', m({ executioner: 0.2 })], ['c', 'blood_chalice', m({ lifesteal: 0.08 })]] },
    { base: m({ crit: 0.1 }), ups: [['a', 'last_shot', m({ critDmg: 1 })], ['b', 'chaos_dice', m({ crit: 0.15, morale: 0.1 })]] },
  ] },
  { id: 'defense', icon: 'fortress', ranks: [
    { base: m({ taken: 0.06 }), ups: [['a', 'turtle_shell', m({ thorns: 0.15 })], ['b', 'feather_shield', m({ startShield: 3 })], ['c', 'shield_wall', o({ def: 2 })]] },
    { base: m({ taken: 0.06 }), ups: [['a', 'spell_mirror', m({ thorns: 0.2 })], ['b', 'storm_anvil', m({ counters: 1, counterDmg: 0.15 })], ['c', 'rune_armor', m({ hp: 0.08 })]] },
    { base: m({ taken: 0.08 }), ups: [['a', 'spear_wall', m({ thorns: 0.5 })], ['b', 'stone_fist', m({ startShield: 6, regen: 0.03 })]] },
  ] },
  magic('earthMagic', 'earth', 'rune_smithing', ['b', 'rune_armor', m({ taken: 0.06 })], ['a', 'rune_circle', m({ startShield: 3 })]),
  { id: 'traps', icon: 'explosive_bolts', ranks: [
    { base: m({ traps: 1 }), ups: [['a', 'iron_grip', m({ trapDmg: 0.5 })], ['b', 'thorn_club', m({ trapPoison: 1 })], ['c', 'route_planning', m({ trapSlow: 1 })]] },
    { base: m({ traps: 1 }), ups: [['a', 'rune_gear', m({ trapDmg: 0.5 })], ['b', 'scout_ahead', m({ round1Ini: 4 })], ['c', 'stone_fist', o({ def: 2 })]] },
    { base: m({ traps: 1 }), ups: [['a', 'eruption', m({ trapDmg: 1 })], ['b', 'bear_claws', m({ trapStun: 1 })]] },
  ] },
  { id: 'attack', icon: 'berserker_axe', ranks: [
    { base: o({ atk: 2 }), ups: [['a', 'iron_fist', m({ melee: 0.1 })], ['b', 'cavalry_charge', m({ firstStrike: 0.25 })], ['c', 'shield_breaker', m({ vsBig: 0.25 })]] },
    { base: o({ atk: 3 }), ups: [['a', 'cleave', m({ melee: 0.15 })], ['b', 'reaper', m({ executioner: 0.2 })], ['c', 'armor_crusher', m({ pierceDef: 0.25 })]] },
    { base: o({ atk: 4 }), ups: [['a', 'unchained', m({ dmg: 0.2 })], ['b', 'horned_rage', m({ lifesteal: 0.15, melee: 0.15 })]] },
  ] },
  magic('stormMagic', 'storm', 'bottled_lightning', ['b', 'marching_drum', m({ ini: 1 })], ['a', 'pathfinder', m({ speed: 1 })]),
  { id: 'gold', icon: 'merchant', ranks: [
    { base: r({ gold: 0.2 }), ups: [['a', 'winged_coin', r({ goldWin: 10 })], ['b', 'merchant', r({ discount: 0.1 })], ['c', 'treasure_hunter', o({ gold: 100 })]] },
    { base: r({ gold: 0.2 }), ups: [['a', 'lucky_horseshoe', r({ goldWin: 15 })], ['b', 'scroll_mastery', r({ discount: 0.1 })], ['c', 'recruitment', o({ lead: 30 })]] },
    { base: r({ gold: 0.3 }), ups: [['a', 'rune_charm', r({ gold: 0.5 })], ['b', 'generals_baton', both(m({ dmg: 0.1 }), r({ discount: 0.15 }))]] },
  ] },
  { id: 'burning', icon: 'flaming_skull', ranks: [
    { base: m({ hellfire: 1 }), ups: [['a', 'burning_trail', m({ hellBurn: 0.3 })], ['b', 'five_flames', m({ hellCrit: 0.25 })], ['c', 'lava_heart', m({ hellfire: 0.3 })]] },
    { base: m({ hellfire: 1 }), ups: [['a', 'fire_burst', m({ hellSplash: 0.5 })], ['b', 'ring_of_fire', m({ hellTargets: 1 })], ['c', 'burning_blade', m({ burn: 0.15 })]] },
    { base: m({ hellfire: 1 }), ups: [['a', 'fire_totem', m({ hellTargets: 1, hellBurn: 0.3 })], ['b', 'flaming_skull', m({ hellfire: 1, hellCrit: 0.2 })]] },
  ] },
  magic('fireMagic', 'fire', 'fire_totem', ['b', 'fire_arrows', m({ burn: 0.1 })], ['a', 'burning_blade', m({ dmg: 0.08 })], ['a', 'chaos_vortex', m({ extraCast: 1 })]),
  { id: 'summoning', icon: 'summoning_circle', ranks: [
    { base: m({ summon: 0.3 }), ups: [['a', 'pain_for_power', m({ summonTier: 1 })], ['b', 'summoning_circle', m({ summon: 0.1 })], ['c', 'recruitment', o({ lead: 15 })]] },
    { base: m({ summon: 0.1, summonTier: 1 }), ups: [['a', 'chaos_vortex', m({ summonTier: 1 })], ['b', 'soul_chain', m({ summon: 0.15 })], ['c', 'eternal_candle', m({ summonTwice: 1 })]] },
    { base: m({ summon: 0.1, summonTier: 1 }), ups: [['a', 'cosmic_hands', m({ summonTier: 2 })], ['b', 'wolf_pack', m({ summon: 0.3 })]] },
  ] },
  // three extra themes without a start hero (Ben 26.11.: "a few additional talents")
  { id: 'tactics', icon: 'tactician', ranks: [
    { base: m({ ini: 1 }), ups: [['a', 'scout_ahead', m({ round1Ini: 4 })], ['b', 'route_planning', m({ speed: 1 })], ['c', 'quick_cast', m({ cooldown: 1 })]] },
    { base: m({ ini: 1 }), ups: [['a', 'cavalry_charge', m({ firstStrike: 0.3 })], ['b', 'war_drum', m({ morale: 0.1 })], ['c', 'counter_strike', m({ counters: 1 })]] },
    { base: m({ ini: 2 }), ups: [['a', 'advance', m({ round1Ini: 6, firstStrike: 0.3 })], ['b', 'foresight', m({ cooldown: 1, dmg: 0.1 })]] },
  ] },
  { id: 'wisdom', icon: 'wizard_hat', ranks: [
    { base: o({ power: 1, knowledge: 1 }), ups: [['a', 'mana_chalice', m({ mana: 10 })], ['b', 'channeling', m({ spellDmg: 0.15 })], ['c', 'herbalism', m({ spellHeal: 0.25 })]] },
    { base: o({ power: 1, knowledge: 1 }), ups: [['a', 'spell_focus', o({ power: 2 })], ['b', 'spellwriting', o({ knowledge: 3 })], ['c', 'arcane_key', m({ mana: 15 })]] },
    { base: o({ power: 2, knowledge: 2 }), ups: [['a', 'scroll_mastery', m({ extraCast: 1 })], ['b', 'rune_tome', m({ spellDmg: 0.4 })]] },
  ] },
  { id: 'bloodlust', icon: 'blood_chalice', ranks: [
    { base: m({ lifesteal: 0.08 }), ups: [['a', 'regeneration', m({ regen: 0.03 })], ['b', 'bloody_tusk', m({ melee: 0.08 })], ['c', 'stitched_heart', m({ hp: 0.06 })]] },
    { base: m({ lifesteal: 0.08 }), ups: [['a', 'reaper', m({ executioner: 0.2 })], ['b', 'blood_crystal', m({ dmg: 0.06 })], ['c', 'field_medic', m({ regen: 0.03 })]] },
    { base: m({ lifesteal: 0.1 }), ups: [['a', 'phoenix_feather', m({ lifesteal: 0.2 })], ['b', 'soul_jar', m({ regen: 0.08 })]] },
  ] },
];

/** Start theme of every hero (GDD 17.5, Ben 26.11. for death lord and pit lord). */
export const START_THEME: Record<string, string> = {
  human_hero_knight_commander: 'leader', human_hero_guard_captain: 'morale', human_hero_priestess_of_light: 'lightMagic',
  undead_hero_death_lord: 'deathDecay', undead_hero_necromancer: 'darkMagic', undead_hero_grave_robber: 'plunder',
  elf_hero_ranger_leader: 'archery', elf_hero_druid: 'natureMagic', elf_hero_shadow_pathfinder: 'crit',
  dwarf_hero_thane: 'defense', dwarf_hero_runesmith: 'earthMagic', dwarf_hero_sapper_master: 'traps',
  orc_hero_warchief: 'attack', orc_hero_shaman: 'stormMagic', orc_hero_raid_master: 'gold',
  demon_hero_pit_lord: 'burning', demon_hero_warlock: 'fireMagic', demon_hero_pact_maker: 'summoning',
};

export const themeById = (id: string): ThemeDef | undefined => THEMES.find((t) => t.id === id);
export const basePerkId = (theme: string, rank: number): string => `${theme}_r${rank}`;
export const upgradePerkId = (theme: string, rank: number, suffix: string): string => `${theme}_r${rank}${suffix}`;
/** Which theme a talent perk id belongs to ('' for old talents). */
export const themeOfPerk = (id: string): string => { const x = /^(\w+?)_r[123][abc]?$/.exec(id); return x && themeById(x[1]) ? x[1] : ''; };

const RAR: Rarity[] = ['common', 'rare', 'legendary'];

/** All talent perks (base of every rank + every upgrade) for the PERKS list. */
export const TALENT_PERKS: PerkDef[] = THEMES.flatMap((th) => th.ranks.flatMap((rk, i) => [
  { id: basePerkId(th.id, i + 1), kind: 'talent' as const, icon: th.icon, rarity: RAR[i], theme: th.id, ...rk.base },
  ...rk.ups.map(([sfx, icon, eff]) => ({ id: upgradePerkId(th.id, i + 1, sfx), kind: 'talent' as const, icon, rarity: RAR[i], theme: th.id, upgrade: true, ...eff })),
]));
