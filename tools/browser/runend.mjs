// Run end after a defeat in act 1 with lumber mill / ore mine: no production, hint line (v0.18.3).
// Usage: node tools/browser/runend.mjs "http://localhost:4174/?test" [act]  → /tmp/shots/runend_act<act>.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const act = Number(process.argv[3] ?? 1);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' }));
  localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { townHall: 3, lumberMill: 2, oreMine: 1 }, runs: 2, wins: 0, bestFloor: 3 })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await page.evaluate(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await page.evaluate((act) => { const r = hexRun(); for (let a = 1; a < act; a++) hexDebug.advanceAct(); r.currentNode = r.map.find((n) => n.floor === 2).id; r.loot = { wood: 20, stone: 10 }; game.scene.getScenes(true)[0].scene.start('RunEnd', { won: false }); }, act);
await sleep(2500);
await page.screenshot({ path: `/tmp/shots/runend_act${act}.png` });
console.log('city res', await page.evaluate(() => localStorage.getItem('hexlegacy.meta.v1').match(/"res":\{[^}]*\}/)[0]));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
