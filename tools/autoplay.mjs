// Plays a whole run in headless Chrome by calling scene methods; reports errors and the outcome.
// Usage: node tools/autoplay.mjs [url]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4173/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 960, height: 540 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('error', (e) => { errors.push('CRASH ' + e.message); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { localStorage.clear(); game.scene.getScene('Title').scene.start('HeroSelect'); });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => game.scene.getScene('HeroSelect').start());
// optional: a very strong hero to walk through all acts quickly (tests act changes and the final battle)
if (process.argv[4] === 'strong') { await new Promise((r) => setTimeout(r, 1500)); await page.evaluate(() => { const r = hexRun(); r.leadership = 900; r.atk = 25; r.def = 25; }); }
const log = [];
const t0 = Date.now();
let last = '';
const LIMIT = Number(process.argv[3] ?? 25) * 60 * 1000;
while (Date.now() - t0 < LIMIT) {
  await new Promise((r) => setTimeout(r, 700));
  const res = await Promise.race([new Promise((r) => setTimeout(() => r('EVAL-TIMEOUT'), 20000)), page.evaluate(() => {
    const active = game.scene.getScenes(true).map((s) => s.scene.key).filter((k) => k !== 'Modal');
    const key = active[active.length - 1];
    const sc = game.scene.getScene(key);
    try {
      if (key === 'Map') {
        if (sc.busy) { sc._busyN = (sc._busyN || 0) + 1; if (sc._busyN > 30 && sc._busyN < 33) return 'map-stuck tweens=' + sc.tweens.getTweens().length + ' token=' + Math.round(sc.token.x) + ',' + Math.round(sc.token.y) + ' timers=' + sc.time._active.length + ' camfx=' + sc.cameras.main.panEffect.isRunning + ' now=' + Math.round(sc.time.now) + ' tw=' + sc.tweens.getTweens().map(t => t.state + ':' + t.progress?.toFixed?.(2)).join('|'); return 'map-busy'; }
        const r = hexRun();
        const cur = r.currentNode === null ? null : r.map.find((n) => n.id === r.currentNode);
        const opts = cur ? cur.next.map((id) => r.map.find((n) => n.id === id)) : r.map.filter((n) => n.floor === 0);
        const n = opts[0];
        // look at the hero screen once in a while
        if (!sc._hero && r.visited.length % 4 === 3) { sc._hero = 1; game.scene.getScene('Map').input.keyboard.emit('keydown-I'); return 'hero-open'; }
        sc._hero = 0;
        sc.travel(n);
        return `map->${n.type}@${n.floor} busy=${sc.busy} lead=${r.leadership} army=${JSON.stringify(r.army)}`;
      }
      if (key === 'Hero') { sc.close(); return 'hero-close'; }
      if (key === 'Act') {
        if (sc._go) return 'act-wait';
        sc._go = 1; setTimeout(() => { sc._go = 0; }, 5000);
        const b = sc.children.list.find((o) => typeof o.setEnabled === 'function');
        b?.emit('pointerup');
        return 'act ' + (sc.final ? 'final' : hexRun().act);
      }
      if (key === 'Battle') {
        if (!sc.battle) { const L = sc.load; return 'battle-loading ' + L.totalComplete + '/' + L.totalToLoad + ' inflight:' + [...L.inflight.entries ?? L.inflight].map((f) => (f.key || f[0]?.key) + '(' + (f.type || f[0]?.type) + ')').join(','); }
        if (sc.battle.winner) {
          if (sc._done === sc.battle) return 'battle-wait';
          sc._done = sc.battle;
          if (sc.cfg.mode === 'run') sc.scene.start(sc.battle.winner === 'player' ? 'Reward' : 'RunEnd', sc.battle.winner === 'player' ? { config: sc.cfg } : { won: false });
          return `battle-${sc.battle.winner}`;
        }
        if (!sc.auto) sc.toggleAuto();
        return 'battle';
      }
      if (key === 'Reward') {
        if (sc.levelUps > 0) { sc.levelUps = 0; return 'reward-levelup-skip'; }
        // item and consumable finds: press the first button (put on / into the belt)
        if ((sc.itemFind || sc.consFind) && sc._find !== (sc.itemFind || sc.consFind)) {
          sc._find = sc.itemFind || sc.consFind;
          if (sc.itemFind) sc.showItemFind(); else sc.showConsFind();
          const b = sc.layer.list.find((o) => typeof o.setEnabled === 'function');
          b?.emit('pointerup');
          return 'reward-find ' + JSON.stringify(sc._find);
        }
        if (sc._done === sc.layer) return 'reward-wait';
        sc._done = sc.layer;
        if (sc.cfg.reward.draft && sc.draft.length && hexRun().army.length < 3) sc.pick(sc.draft[0]); else sc.finish();
        return 'reward';
      }
      if (key === 'Node') {
        if (sc._done === sc.box) return 'node-wait';
        sc._done = sc.box;
        if (sc.kind === 'event') {
          const evs = sc.box; void evs;
          sc.leave(); return `event ${sc.eventId}`;
        }
        if (sc.kind === 'shop' && hexRun().gold >= 60) { hexRun().gold -= 45; hexRun().atk += 1; }
        if (sc.kind === 'shop') { sc.gearShop(); sc.magicShop(); sc.training(); }
        sc.leave(); return `node ${sc.kind}`;
      }
      if (key === 'RunEnd') return `END won=${sc.won}`;
      return `other ${key} ` + game.scene.scenes.filter((s) => s.sys.settings.status > 0).map((s) => s.scene.key + ':' + s.sys.settings.status).join(',');
    } catch (e) { return 'ERR ' + e.message; }
  })]);
  if (res === 'EVAL-TIMEOUT') { log.push('EVAL-TIMEOUT (page hung?) ' + JSON.stringify(await page.metrics().catch(() => ({})))); break; }
  if (res !== last && !['battle', 'map-busy', 'battle-wait', 'reward-wait', 'node-wait', 'act-wait'].includes(res) && !res.startsWith('other')) log.push(Math.round((Date.now() - t0) / 1000) + 's ' + res.replace(/ army=.*/, ''));
  last = res;
  if (res.startsWith('END') || res.startsWith('ERR')) break;
}
console.log(log.join('\n'));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
