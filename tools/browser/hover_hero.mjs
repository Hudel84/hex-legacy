// v0.20.1: hovering an enemy shows its movement range in red; clicking the hero opens the hero screen (read-only).
// Usage: node tools/browser/hover_hero.mjs "http://localhost:4174/?test"  → /tmp/shots/hh_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const toPage = ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
await ev(() => { const r = hexRun(); r.bag = []; game.scene.getScene('Map').travel(r.map.find((n) => n.floor === 0)); });
for (let i = 0; i < 60 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
// hover the first enemy stack
const en = await ev(() => game.scene.getScene('Battle').battle.stacks.filter((s) => s.side === 'enemy').map((s) => [s.uid, s.def.id, s.def.flying ? 'fly' : 'walk', game.scene.getScene('Battle').battle.reachable(s).size]));
console.log('enemies', JSON.stringify(en));
const [ex, ey] = await toPage(await ev((u) => window.__stackXY(u), en[0][0])); await page.mouse.move(ex, ey); await sleep(500);
console.log('red uid', await ev(() => game.scene.getScene('Battle').enemyReachUid));
await page.screenshot({ path: '/tmp/shots/hh_enemy_reach.png' });
// away from the enemy: cleared
const [fx, fy] = await toPage([960, 1000]); await page.mouse.move(fx, fy); await sleep(300);
console.log('red after leaving', await ev(() => game.scene.getScene('Battle').enemyReachUid));
// click the hero on the left
const [hx, hy] = await toPage([125, 500]); await page.mouse.move(hx, hy); await sleep(300); await page.mouse.click(hx, hy); await sleep(2000);
console.log('hero screen', await ev(() => game.scene.isActive('Hero')), 'battle paused', await ev(() => game.scene.isPaused('Battle')));
await page.screenshot({ path: '/tmp/shots/hh_hero.png' });
// try to unequip the weapon by clicking it: must not change anything (read-only)
const before = await ev(() => JSON.stringify(hexRun().equip));
const [wx, wy] = await toPage(await ev(() => { const sc = game.scene.getScene('Hero'); const p = sc.place('weapon'); return [p.x, p.y]; })); await page.mouse.click(wx, wy); await sleep(400);
console.log('equip unchanged', before === await ev(() => JSON.stringify(hexRun().equip)));
await page.keyboard.press('Escape'); await sleep(800);
console.log('after ESC: hero', await ev(() => game.scene.isActive('Hero')), 'battle running', await ev(() => game.scene.isActive('Battle') && !game.scene.isPaused('Battle')));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
