import Phaser from 'phaser';
import { audioUrls } from './assets';
import { settings } from './settings';

/** Hero voice lines (ElevenLabs, EN + DE): audio/voice/vo_<lang>_<heroId>_<line>.ogg */
export type VoiceLine = 'select' | 'battle' | 'victory' | 'spell';

let current: Phaser.Sound.BaseSound | null = null;

export function voiceKey(heroId: string, line: VoiceLine): string {
  return `vo_${settings.lang === 'de' ? 'de' : 'en'}_${heroId}_${line}`;
}

/** Queue voice lines of one hero in the scene's preload. */
export function loadVoices(scene: Phaser.Scene, heroId: string, lines: VoiceLine[]): void {
  for (const l of lines) {
    const k = voiceKey(heroId, l);
    if (!scene.cache.audio.exists(k)) scene.load.audio(k, audioUrls(`audio/voice/${k}.ogg`));
  }
}

/** Play a hero line (stops the previous one). Loads it on demand if it is not cached yet. */
export function playVoice(scene: Phaser.Scene, heroId: string, line: VoiceLine, volume = 1): void {
  if (!heroId || settings.sfxVolume <= 0) return;
  const k = voiceKey(heroId, line);
  const play = () => {
    if (!scene.sys.isActive() || !scene.cache.audio.exists(k)) return;
    try { current?.stop(); current?.destroy(); } catch { /* already gone */ }
    current = scene.sound.add(k, { volume: Math.min(1, settings.sfxVolume * 1.15 * volume) });
    current.once(Phaser.Sound.Events.COMPLETE, () => { current?.destroy(); current = null; });
    current.play();
  };
  const go = () => {
    if (scene.cache.audio.exists(k)) { play(); return; }
    scene.load.audio(k, audioUrls(`audio/voice/${k}.ogg`));
    scene.load.once(`filecomplete-audio-${k}`, play);
    if (!scene.load.isLoading()) scene.load.start();
  };
  if (scene.sound.locked) scene.sound.once(Phaser.Sound.Events.UNLOCKED, go);
  else go();
}
