import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.evaluateOnNewDocument(() => { if (!localStorage.getItem('hexlegacy.settings.v1')) localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' })); });
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' }); await sleep(3000);
await page.evaluate(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'elf_hero_ranger_leader'; s.start(); }); await sleep(2500);
// lizardmen battle
await page.evaluate(() => { const r = hexRun(); const n = r.map.find((x) => x.floor === 0); const cfg = hexDebug.battleConfig(n, { army: [{ id: 'neutral_lizardman_warrior', count: 5 }, { id: 'neutral_harpy', count: 4 }, { id: 'neutral_harpy_v2', count: 4 }], hero: { atk: 1, def: 1 } }); game.scene.getScenes(true).forEach((s) => s.scene.stop()); game.scene.start('Battle', { config: cfg }); });
await sleep(6000); await page.screenshot({ path: '/tmp/shots/fix_lizard.png' });
console.log('errors:', errors.join(' ; ') || 'none');
await browser.close();
