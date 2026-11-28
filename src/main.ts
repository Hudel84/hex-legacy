import Phaser from 'phaser';
import { GAME_W, GAME_H, VERSION } from './core/theme';
import { installTextScale } from './core/textScale';
import { installTouch } from './core/touch';
import { installMobile } from './core/mobile';
import { run as currentRun, advanceAct } from './run/state';
import { finalConfig, buildEnemy, battleConfig } from './run/encounters';
import { UNITS } from './data/units';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { ModalScene } from './scenes/ModalScene';
import { BattleScene } from './scenes/BattleScene';
import { HeroSelectScene } from './scenes/HeroSelectScene';
import { MapScene } from './scenes/MapScene';
import { NodeScene } from './scenes/NodeScene';
import { RewardScene } from './scenes/RewardScene';
import { RunEndScene } from './scenes/RunEndScene';
import { CityScene } from './scenes/CityScene';
import { HeroScene } from './scenes/HeroScene';
import { TalentScene } from './scenes/TalentScene';
import { ActScene } from './scenes/ActScene';

// ?test: real-time deltas so slow headless test browsers run the game at normal speed
const params = new URLSearchParams(location.search);
const testMode = params.has('test');

installTextScale();
installTouch();
const game = new Phaser.Game({
  fps: testMode ? { smoothStep: false, min: 4 } : undefined,
  type: params.has('canvas') ? Phaser.CANVAS : Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0d0a08',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, PreloadScene, TitleScene, ModalScene, BattleScene, HeroSelectScene, MapScene, NodeScene, RewardScene, RunEndScene, CityScene, HeroScene, ActScene, TalentScene],
});

installMobile(game);

// handy for automated tests and debugging in the browser console
(window as unknown as { game: Phaser.Game }).game = game;
(window as unknown as { hexRun: typeof currentRun }).hexRun = currentRun;
(window as unknown as { hexUnits: typeof UNITS }).hexUnits = UNITS;
(window as unknown as { hexDebug: object }).hexDebug = { advanceAct, finalConfig, buildEnemy, battleConfig };

// Errors become visible for testers (a small box with the message, click to close),
// so a bug report can include a screenshot instead of "the window was missing".
function showError(msg: string): void {
  let box = document.getElementById('hex-error');
  if (!box) {
    box = document.createElement('div');
    box.id = 'hex-error';
    box.style.cssText = 'position:fixed;left:12px;bottom:12px;max-width:520px;z-index:9999;background:#5a1410ee;color:#fff;'
      + 'font:13px/1.4 sans-serif;padding:10px 14px;border:1px solid #ff8a70;border-radius:6px;cursor:pointer;white-space:pre-wrap';
    box.title = 'click to close';
    box.onclick = () => box?.remove();
    document.body.appendChild(box);
  }
  const scenes = game.scene.getScenes(true).map((s) => s.scene.key).join(', ');
  box.textContent = `Fehler / Error (v${VERSION}) – ${scenes}\n${msg}`.slice(0, 900);
}
window.addEventListener('error', (e) => showError(`${e.message}\n${(e.error as Error | undefined)?.stack?.split('\n').slice(1, 4).join('\n') ?? ''}`));
window.addEventListener('unhandledrejection', (e) => showError(String((e.reason as Error)?.stack ?? e.reason)));
