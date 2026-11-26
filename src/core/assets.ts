import Phaser from 'phaser';
import { UNITS } from '../data/units';
import { RES, RES_ICON } from '../meta/meta';

export const A = 'assets/';

/** Queue an image if it is not loaded yet. */
export function img(scene: Phaser.Scene, key: string, path: string): void {
  if (!scene.textures.exists(key)) scene.load.image(key, `${A}${path}`);
}
/**
 * Audio URLs for a path like `audio/sfx/x.ogg`: OGG plus an M4A (AAC) twin.
 * iOS/iPadOS (every browser there) and Safari get M4A first: older versions cannot play OGG at all
 * (Phaser then skips the file and the key is missing), 17.4–18.3 only partly.
 */
const PREFER_M4A = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/Chrome|Chromium|Edg|OPR|Firefox|Android/.test(ua);
  return ios || safari;
})();
export function audioUrls(path: string): string[] {
  const ogg = `${A}${path}`;
  const m4a = ogg.replace(/\.ogg$/, '.m4a');
  return PREFER_M4A ? [m4a, ogg] : [ogg, m4a];
}
/** Queue an audio file (OGG/M4A) if it is not loaded yet. */
export function loadAudio(scene: Phaser.Scene, key: string, path: string): void {
  if (!scene.cache.audio.exists(key)) scene.load.audio(key, audioUrls(path));
}
export function sfx(scene: Phaser.Scene, key: string, path = `audio/sfx/${key}.ogg`): void {
  loadAudio(scene, key, path);
}

/** UI pieces, icons and sounds used by the run screens. */
export function loadRunUi(scene: Phaser.Scene): void {
  for (const k of ['ui_panel_dark_wood', 'ui_panel_parchment', 'ui_panel_stone', 'ui_panel_blue_velvet', 'ui_frame_unit_card',
    'ui_frame_portrait_round', 'ui_plaque_title', 'ui_banner_ribbon_red', 'ui_divider_gold', 'ui_button_plus', 'ui_button_minus',
    'ui_icon_lock', 'ui_bar_health_frame']) img(scene, k, `ui/${k}.webp`);
  img(scene, 'icon_gold', 'icons/resources/icon_res_gold.webp');
  img(scene, 'icon_lead', 'icons/resources/icon_stat_leadership.webp');
  img(scene, 'icon_atk', 'icons/stats/icon_stat_attack.webp');
  img(scene, 'icon_def', 'icons/stats/icon_stat_defense.webp');
  img(scene, 'icon_hp', 'icons/stats/icon_stat_health.webp');
  img(scene, 'icon_dmg', 'icons/stats/icon_stat_damage.webp');
  img(scene, 'icon_ini', 'icons/stats/icon_stat_initiative.webp');
  img(scene, 'icon_spd', 'icons/stats/icon_stat_speed.webp');
  img(scene, 'icon_crit', 'icons/stats/icon_stat_luck.webp');
  img(scene, 'icon_morale', 'icons/stats/icon_stat_morale.webp');
  for (const r of RES) img(scene, `res_${r}`, RES_ICON[r]);
  for (const k of ['ui_coins', 'ui_buy', 'ui_card_draft', 'ui_levelup', 'ui_reward', 'ui_error', 'ui_node_select', 'ui_equip', 'ui_talent_pick']) sfx(scene, k);
}

export function loadPortrait(scene: Phaser.Scene, unitId: string): string {
  const k = `portrait_${unitId}`;
  img(scene, k, UNITS[unitId].portrait);
  return k;
}

export function loadHeroPortrait(scene: Phaser.Scene, heroId: string): string {
  const k = `heroportrait_${heroId}`;
  img(scene, k, `ui/portraits/heroes/portrait_${heroId}.webp`);
  return k;
}
