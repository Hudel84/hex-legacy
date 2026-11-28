// v0.20.7: hero cards without type line, smithy start levels and the forge event with an upgrade choice
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('init')) { sessionStorage.setItem('init', '1'); localStorage.clear();
  localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false }));
  localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { tavern: 2, smithy: 2 }, runs: 3, wins: 0, bestFloor: 5 })); } });
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.faction = 'orc'; s.drawCards(); }); await sleep(800);
await page.screenshot({ path: '/tmp/shots/sm_heroselect_orc.png' });
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'orc_hero_shaman'; s.start(); }); await sleep(2500);
console.log('army after start', await ev(() => JSON.stringify([hexRun().army, hexRun().pendingUps])));
// start talent first
for (let i = 0; i < 10; i++) {
  const k = await ev(() => game.scene.getScenes(true).map((s) => s.scene.key).join(','));
  if (k.includes('Talent')) { await ev(() => { const sc = game.scene.getScene('Talent'); const c = sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0); c?.emit('pointerup'); }); await sleep(1500); }
  else if (k.includes('Map')) break; else await sleep(700);
}
await sleep(1200);
await page.screenshot({ path: '/tmp/shots/sm_map_choice1.png' });
const pickUp = (scene) => ev((scene) => { const sc = game.scene.getScene(scene);
  const root = sc.children.list.filter((o) => o.depth === 8500).pop(); if (!root) return 'no overlay';
  const c = root.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0); if (!c) return 'no card';
  c.emit('pointerup'); return 'picked'; }, scene);
console.log('pick 1', await pickUp('Map')); await sleep(1800);
await page.screenshot({ path: '/tmp/shots/sm_map_choice2.png' });
console.log('pick 2', await pickUp('Map')); await sleep(1800);
console.log('after picks', await ev(() => JSON.stringify([hexRun().army, hexRun().pendingUps])));
console.log('third overlay?', await ev(() => game.scene.getScene('Map').children.list.filter((o) => o.depth === 8500).length));
await page.screenshot({ path: '/tmp/shots/sm_map_done.png' });
// forge event: option 1 then the upgrade choice
await ev(() => { game.scene.getScene('Map').scene.start('Node', { kind: 'event', eventId: 'dormant_forge' }); }); await sleep(2200);
await ev(() => { const sc = game.scene.getScene('Node'); const b = sc.box.list.find((o) => o.listenerCount?.('pointerup') > 0 || o.listenerCount?.('pointerdown') > 0); return b; });
const before = await ev(() => JSON.stringify(hexRun().army.map((s) => [s.unitId, s.level, s.ups])));
await ev(() => { const sc = game.scene.getScene('Node'); sc.outcome({ text: 'event.dormant_forge.worked', vars: { unit: 'unit.' + hexRun().army[1].unitId }, upgrade: hexRun().army[1].unitId }); }); await sleep(1200);
await page.screenshot({ path: '/tmp/shots/sm_forge_choice.png' });
console.log('forge pick', await pickUp('Node')); await sleep(1500);
await page.screenshot({ path: '/tmp/shots/sm_forge_done.png' });
console.log('forge before', before, 'after', await ev(() => JSON.stringify(hexRun().army.map((s) => [s.unitId, s.level, s.ups]))));
console.log('errors', errors.join(' ; ') || 'none');
await browser.close();
