// Shop (v0.19): main page, hiring a neutral creature (with a full army: replace screen), equipment page.
// Usage: node tools/browser/shop.mjs "http://localhost:4174/?test" [act]  → /tmp/shots/shop_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const act = Number(process.argv[3] ?? 1);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const rows = () => ev(() => { const sc = game.scene.getScene('Node'); const out = []; sc.box.each((o) => { if (o.type === 'Container' && o.listenerCount('pointerup') > 0) out.push(o.list.filter((k) => k.type === 'Text').map((k) => k.text).join(' | ')); }); return out; });
const clickRow = (i) => ev((i) => { const sc = game.scene.getScene('Node'); const rs = []; sc.box.each((o) => { if (o.type === 'Container' && o.listenerCount('pointerup') > 0) rs.push(o); }); rs[i].emit('pointerup'); }, i);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev((act) => { const r = hexRun(); for (let a = 1; a < act; a++) hexDebug.advanceAct(); r.gold = 900; r.army.push({ unitId: 'human_t3_swordsman', alloc: 0, level: 2, ups: [] }); r.currentNode = r.map.find((n) => n.floor === 7).id; game.scene.getScenes(true)[0].scene.start('Node', { kind: 'shop' }); }, act);
await sleep(2500);
console.log('main:', JSON.stringify(await rows(), null, 1));
await page.screenshot({ path: `/tmp/shots/shop_main_act${act}.png` });
await clickRow(1); await sleep(800);   // first neutral -> army full -> replace screen
console.log('replace:', JSON.stringify(await rows(), null, 1));
await page.screenshot({ path: '/tmp/shots/shop_replace.png' });
await clickRow(2); await sleep(800);   // replace the third unit (swordsmen)
console.log('army:', await ev(() => JSON.stringify(hexRun().army.map((s) => [s.unitId, s.level])) + ' gold ' + hexRun().gold));
console.log('after:', JSON.stringify(await rows(), null, 1));
await page.screenshot({ path: '/tmp/shots/shop_after.png' });
await clickRow(0); await sleep(800);   // equipment page
console.log('gear:', JSON.stringify(await rows(), null, 1));
await page.screenshot({ path: '/tmp/shots/shop_gear.png' });
console.log('errors', errors.join('\n') || 'none');
await browser.close();
