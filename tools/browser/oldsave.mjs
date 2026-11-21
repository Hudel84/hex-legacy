import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' | ' + (e.stack || '').split('\n').slice(1, 4).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4174/old/?test', { waitUntil: 'load' }); await sleep(3000);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' })); game.scene.getScene('Title').scene.start('HeroSelect'); }); await sleep(2000);
await page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.start(); }); await sleep(2500);
// one battle in the old version
await page.evaluate(() => { const r = hexRun(); r.leadership = 600; const n = r.map.find((x) => x.floor === 0); n.type = 'battle'; game.scene.getScene('Map').travel(n); }); await sleep(6000);
for (let i = 0; i < 40; i++) { const w = await page.evaluate(() => { const sc = game.scene.getScene('Battle'); if (sc.battle && !sc.auto) sc.toggleAuto(); return sc.battle?.winner ?? ''; }); if (w) break; await sleep(1500); }
await page.evaluate(() => { const sc = game.scene.getScene('Battle'); sc.scene.start('Reward', { config: sc.cfg }); }); await sleep(3000);
await page.evaluate(() => { const sc = game.scene.getScene('Reward'); sc.levelUps = 0; sc.finish(); }); await sleep(3000);
console.log('old save:', await page.evaluate(() => localStorage.getItem('hexlegacy.run.v1').slice(0, 400)));
console.log('old errors:', errors.splice(0).join(' ; ') || 'none');
// new version
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' }); await sleep(3500);
await page.evaluate(() => { const ts = game.scene.getScene('Title'); const all = []; const walk = (o) => { if (o.listenerCount?.('pointerup') > 0) all.push(o); (o.list ?? []).forEach(walk); }; ts.children.list.forEach(walk); all[0]?.emit('pointerup'); });
await sleep(3500);
console.log('scenes:', await page.evaluate(() => game.scene.getScenes(true).map((s) => s.scene.key).join(',')));
for (const kind of ['event', 'rest', 'shop']) {
  await page.evaluate((kind) => { const r = hexRun(); const cur = r.map.find((n) => n.id === r.currentNode); const n = r.map.find((x) => x.id === cur.next[0]); n.type = kind; game.scene.getScene('Map').travel(n); }, kind);
  await sleep(5000);
  console.log(kind, await page.evaluate(() => { const sc = game.scene.getScene('Node'); return 'box=' + sc.box?.list?.length; }), errors.splice(0).join(' ; ') || 'ok');
  await page.screenshot({ path: `/tmp/shots/old_${kind}.png` });
  await page.evaluate(() => { const r = hexRun(); delete r.pendingNode; game.scene.getScenes(true).forEach((s) => s.scene.stop()); }); await sleep(500);
  await page.evaluate(() => game.scene.start('Map')); await sleep(2500);
}
await browser.close();
