import Phaser from 'phaser';
import { settings } from './settings';

let currentMusic: Phaser.Sound.BaseSound | null = null;
let currentKey = '';

/** Play a looping music track with a short fade. Waits for the browser audio unlock. */
export function playMusic(scene: Phaser.Scene, key: string, fadeMs = 1200): void {
  if (currentKey === key && currentMusic?.isPlaying) return;
  const start = () => {
    const old = currentMusic;
    if (old) {
      scene.tweens.add({ targets: old, volume: 0, duration: fadeMs, onComplete: () => old.destroy() });
    }
    const m = scene.sound.add(key, { loop: true, volume: 0 });
    m.play();
    scene.tweens.add({ targets: m, volume: settings.musicVolume, duration: fadeMs });
    currentMusic = m;
    currentKey = key;
  };
  if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, start);
  else start();
}

export function applyMusicVolume(): void {
  if (currentMusic && 'setVolume' in currentMusic) {
    (currentMusic as Phaser.Sound.WebAudioSound).setVolume(settings.musicVolume);
  }
}

export function playSfx(scene: Phaser.Scene, key: string, volume = 1): void {
  if (scene.sound.locked || !scene.cache.audio.exists(key)) return;
  scene.sound.play(key, { volume: settings.sfxVolume * volume });
}

/** Fade out the current music (e.g. before a stinger). The next playMusic starts fresh. */
export function stopMusic(scene: Phaser.Scene, fadeMs = 600): void {
  const old = currentMusic;
  currentMusic = null;
  currentKey = '';
  if (old) scene.tweens.add({ targets: old, volume: 0, duration: fadeMs, onComplete: () => old.destroy() });
}

/** Short non-looping music cue (victory, defeat, act cleared) at music volume. */
export function playStinger(scene: Phaser.Scene, key: string, fadeMs = 500): void {
  stopMusic(scene, fadeMs);
  if (scene.sound.locked || !scene.cache.audio.exists(key)) return;
  scene.sound.play(key, { volume: settings.musicVolume });
}

/** Map music per act (1..3). */
export const mapMusic = (act: number): string => `mus_map_act${Math.max(1, Math.min(3, act || 1))}`;
