// Ascension (v0.20): selector in the hero selection, badge on the map, unlock on the run end screen, shop prices.
// Usage: node tools/browser/ascension.mjs "http://localhost:4174/?test"  → /tmp/shots/asc_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const toPage = ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' }));
  localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { townHall: 3 }, runs: 5, wins: 2, bestFloor: 40, ascUnlocked: 6 })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2500);
await page.screenshot({ path: '/tmp/shots/asc_select6.png' });
// left arrow once (real click) -> level 5, then hover the label for the tooltip
const [ax, ay] = await toPage([255 - 185, 1080 - 58]); await page.mouse.click(ax, ay); await sleep(1500);
const [lx, ly] = await toPage([255, 1080 - 70]); await page.mouse.move(lx, ly); await sleep(500);
await page.screenshot({ path: '/tmp/shots/asc_select5_tip.png' });
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
const r0 = await ev(() => { const r = hexRun(); return { asc: r.asc, lead: r.leadership, gold: r.gold }; });
console.log('run', JSON.stringify(r0));
await page.screenshot({ path: '/tmp/shots/asc_map.png' });
// enemy of the first fight on asc 5 vs. its budget
console.log('enemy floor0', await ev(() => { const r = hexRun(); const n = r.map.find((x) => x.floor === 0); const cfg = hexDebug.battleConfig(n, hexDebug.buildEnemy(n)); return JSON.stringify({ army: cfg.setup.enemy.army.map((a) => [a.def.id, a.count, a.def.hp]), mods: { hp: cfg.setup.enemy.mods.hp, bossRage: cfg.setup.enemy.mods.bossRage, crit: cfg.setup.enemy.mods.crit }, gold: cfg.reward.gold, xp: cfg.reward.xp }); }));
// win: run end on asc 5 unlocks nothing new (6 already open); set asc 6 -> unlocks 7
await ev(() => { const r = hexRun(); r.asc = 6; r.loot = { wood: 50 }; game.scene.getScenes(true)[0].scene.start('RunEnd', { won: true }); }); await sleep(2500);
await page.screenshot({ path: '/tmp/shots/asc_runend.png' });
console.log('meta asc', await ev(() => JSON.parse(localStorage.getItem('hexlegacy.meta.v1')).ascUnlocked), 'wood', await ev(() => JSON.parse(localStorage.getItem('hexlegacy.meta.v1')).res.wood));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
