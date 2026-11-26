import Phaser from 'phaser';
import { settings } from './settings';
import { audioUrls } from './assets';

/*
 * Music/SFX helpers (v0.12.7: crash-safe).
 * - Fades run on the game's STEP event instead of scene tweens. Scene tweens could outlive a scene
 *   and later write `volume` on a destroyed sound ("null is not an object (evaluating 'this.volumeNode.gain')").
 * - While audio is locked (iPad before the first touch) only the LAST requested track starts on unlock.
 * - A track that is not in the cache (not loaded yet, or the format could not be decoded) is loaded on
 *   demand or skipped quietly instead of throwing "Audio key ... not found in cache".
 */
type Snd = Phaser.Sound.BaseSound & { volume: number };
interface Fade { s: Snd; from: number; to: number; dur: number; t: number; done?: () => void }

let fades: Fade[] = [];
let tickGame: Phaser.Game | null = null;
let currentMusic: Snd | null = null;
let currentKey = '';
let wantedKey = '';
let wantedFade = 1200;
let unlockHooked = false;
const loadTried = new Set<string>();

const alive = (s: Snd | null | undefined): s is Snd => !!s && !s.pendingRemove;

function step(_time: number, delta: number): void {
  if (!fades.length) return;
  const list = fades;
  fades = [];
  for (const f of list) {
    if (!alive(f.s)) continue;
    f.t = Math.min(f.dur, f.t + delta);
    const v = f.from + (f.to - f.from) * (f.dur > 0 ? f.t / f.dur : 1);
    try { f.s.volume = v; } catch { continue; }
    if (f.t >= f.dur) f.done?.();
    else fades.push(f);
  }
}

function ensureTicker(game: Phaser.Game): void {
  if (tickGame === game) return;
  tickGame?.events.off(Phaser.Core.Events.STEP, step);
  tickGame = game;
  game.events.on(Phaser.Core.Events.STEP, step);
}

/** Fade a sound to a volume (replaces any running fade of that sound). */
function fade(s: Snd, to: number, dur: number, done?: () => void): void {
  fades = fades.filter(f => f.s !== s);
  if (!alive(s)) return;
  fades.push({ s, from: s.volume, to, dur: Math.max(0, dur), t: 0, done });
}

function kill(s: Snd | null): void {
  fades = fades.filter(f => f.s !== s);
  if (!alive(s)) return;
  try { s.stop(); s.destroy(); } catch { /* already gone */ }
}

/** Load a music track on demand with any scene that is running. */
function loadMusic(game: Phaser.Game, key: string, onDone: () => void): void {
  if (loadTried.has(key)) return; // already loading or failed (e.g. format not playable) -> stay silent
  const scene = game.scene.getScenes(true).find(s => s.sys.settings.key !== 'Boot');
  if (!scene) return;
  loadTried.add(key);
  const ld = scene.load;
  ld.once(`filecomplete-audio-${key}`, () => { loadTried.delete(key); onDone(); });
  ld.audio(key, audioUrls(`audio/music/${key}.ogg`));
  if (!ld.isLoading()) ld.start();
}

function startWanted(game: Phaser.Game): void {
  const key = wantedKey;
  if (!key || (currentKey === key && alive(currentMusic))) return;
  if (!game.cache.audio.exists(key)) {
    loadMusic(game, key, () => { if (wantedKey === key && !game.sound.locked) startWanted(game); });
    return;
  }
  const old = currentMusic;
  if (alive(old)) fade(old, 0, wantedFade, () => kill(old));
  currentMusic = null;
  currentKey = '';
  try {
    const m = game.sound.add(key, { loop: true, volume: 0 }) as Snd;
    m.play();
    currentMusic = m;
    currentKey = key;
    fade(m, settings.musicVolume, wantedFade);
  } catch (e) {
    console.warn('music', key, e);
  }
}

/** Play a looping music track with a short fade. Waits for the browser audio unlock. */
export function playMusic(scene: Phaser.Scene, key: string, fadeMs = 1200): void {
  const game = scene.game;
  ensureTicker(game);
  wantedKey = key;
  wantedFade = fadeMs;
  if (currentKey === key && alive(currentMusic)) {
    fade(currentMusic, settings.musicVolume, fadeMs); // in case it was fading out
    return;
  }
  if (game.sound.locked) {
    if (!unlockHooked) {
      unlockHooked = true;
      game.sound.once(Phaser.Sound.Events.UNLOCKED, () => { unlockHooked = false; startWanted(game); });
    }
    return;
  }
  startWanted(game);
}

export function applyMusicVolume(): void {
  if (!alive(currentMusic)) return;
  fades = fades.filter(f => f.s !== currentMusic);
  try { currentMusic.volume = settings.musicVolume; } catch { /* ignore */ }
}

export function playSfx(scene: Phaser.Scene, key: string, volume = 1): void {
  if (scene.sound.locked || !scene.cache.audio.exists(key)) return;
  try { scene.sound.play(key, { volume: settings.sfxVolume * volume }); } catch { /* ignore */ }
}

/** Fade out the current music (e.g. before a stinger). The next playMusic starts fresh. */
export function stopMusic(scene: Phaser.Scene, fadeMs = 600): void {
  ensureTicker(scene.game);
  const old = currentMusic;
  currentMusic = null;
  currentKey = '';
  wantedKey = '';
  if (alive(old)) fade(old, 0, fadeMs, () => kill(old));
}

/** Short non-looping music cue (victory, defeat, act cleared) at music volume. */
export function playStinger(scene: Phaser.Scene, key: string, fadeMs = 500): void {
  stopMusic(scene, fadeMs);
  if (scene.sound.locked || !scene.cache.audio.exists(key)) return;
  try { scene.sound.play(key, { volume: settings.musicVolume }); } catch { /* ignore */ }
}

/** Map music per act (1..3). */
export const mapMusic = (act: number): string => `mus_map_act${Math.max(1, Math.min(3, act || 1))}`;
