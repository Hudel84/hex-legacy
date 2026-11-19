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
