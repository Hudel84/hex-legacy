// Persistent player settings (per browser). Storage can be unavailable
// (private mode, sandboxed iframes), so every access is guarded.
export type Lang = 'en' | 'de';

export interface Settings {
  lang: Lang;
  musicVolume: number; // 0..1
  sfxVolume: number;   // 0..1
  textSize: number;    // 0 normal, 1 large, 2 very large
  tactics: boolean;    // set up the army before each battle (v0.18)
}

const KEY = 'hexlegacy.settings.v1';

const defaults: Settings = {
  lang: navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en',
  musicVolume: 0.6,
  sfxVolume: 0.8,
  textSize: 0,
  tactics: true,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaults };
}

export const settings: Settings = load();

export function saveSettings(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* ignore */ }
}
