// Phones and tablets (v0.21): fit the visible screen, ask to rotate in portrait, full screen.
// Everything here is plain DOM, so it works the same on every scene.
import type Phaser from 'phaser';
import { settings } from './settings';

const params = new URLSearchParams(location.search);

/** Touch device (finger is the main pointer). `?touch` forces it for tests. */
export const IS_TOUCH: boolean = params.has('touch')
  || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);

/** Started from the home screen (iPhone "Add to Home Screen", installed web app). */
export function isStandalone(): boolean {
  return (typeof matchMedia === 'function' && (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches))
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type FsDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => void };

/** Browser allows full screen (Android, iPad; not iPhone Safari). */
export function canFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** Enter or leave full screen; on phones also lock landscape (Android). Call from a click/tap. */
export function toggleFullscreen(): void {
  const d = document as FsDoc;
  try {
    if (isFullscreen()) {
      if (d.exitFullscreen) void d.exitFullscreen().catch(() => undefined);
      else d.webkitExitFullscreen?.();
      return;
    }
    const el = document.documentElement as FsEl;
    const lock = () => {
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      o?.lock?.('landscape').catch(() => undefined);
    };
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).then(lock).catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  } catch { /* not allowed here */ }
}

const ROTATE_TEXT = {
  de: { title: 'Bitte das Gerät drehen', body: 'Hex Legacy wird im Querformat gespielt.', skip: 'Trotzdem spielen' },
  en: { title: 'Please rotate your device', body: 'Hex Legacy is played in landscape.', skip: 'Play anyway' },
};

/** Set up the page for phones/tablets: keep the canvas fitted to the visible screen and show the rotate hint. */
export function installMobile(game: Phaser.Game): void {
  // the browser bars come and go while scrolling/rotating: re-fit the canvas each time
  const refit = () => { try { game.scale.refresh(); } catch { /* not ready yet */ } };
  window.addEventListener('orientationchange', () => setTimeout(refit, 250));
  window.visualViewport?.addEventListener('resize', refit);
  document.addEventListener('fullscreenchange', () => setTimeout(refit, 100));
  document.addEventListener('webkitfullscreenchange', () => setTimeout(refit, 100));

  if (!IS_TOUCH) return;
  // iOS: no long-press menu, no double-tap zoom, no text selection on the game
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  let skipped = false;
  const box = document.createElement('div');
  box.id = 'hex-rotate';
  box.style.cssText = 'position:fixed;inset:0;z-index:9000;display:none;flex-direction:column;align-items:center;justify-content:center;'
    + 'gap:18px;padding:24px;background:#0d0a08;color:#f3d48a;font:600 20px/1.35 Georgia,serif;text-align:center';
  const build = () => {
    const tx = ROTATE_TEXT[settings.lang] ?? ROTATE_TEXT.en;
    box.innerHTML = `
      <svg width="110" height="110" viewBox="0 0 110 110" aria-hidden="true">
        <g fill="none" stroke="#f3d48a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
          <rect x="40" y="14" width="30" height="52" rx="5"/>
          <rect x="22" y="62" width="66" height="34" rx="5" stroke-opacity="0.45"/>
          <path d="M84 30 a26 26 0 0 1 4 26" /><path d="M82 52 l6 5 4 -7"/>
        </g>
      </svg>
      <div style="font-size:24px">${tx.title}</div>
      <div style="font-weight:400;color:#e8dcc0;font-size:17px">${tx.body}</div>
      <button id="hex-rotate-skip" style="margin-top:10px;padding:10px 22px;border-radius:8px;border:1px solid #8a6a2b;background:#2a1a0e;color:#e8dcc0;font:16px Georgia,serif">${tx.skip}</button>`;
    box.querySelector('#hex-rotate-skip')?.addEventListener('click', () => { skipped = true; update(); });
  };
  const update = () => {
    const portrait = window.innerHeight > window.innerWidth * 1.05;
    if (portrait && !skipped && box.style.display !== 'flex') build();
    box.style.display = portrait && !skipped ? 'flex' : 'none';
    if (!portrait) skipped = false; // ask again next time it is turned upright
  };
  document.body.appendChild(box);
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 250));
}
