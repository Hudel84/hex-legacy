// Map screenshots per biome (contrast check, v0.20.4): node tools/browser/mapview.mjs [url] [biome,biome,...]
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const biomes = (process.argv[3] ?? 'meadows,autumn_forest,rocky_coast').split(',');
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
for (const b of biomes) {
  await ev((b) => { const r = hexRun(); r.biome = b; game.scene.getScene('Map').scene.restart(); }, b); await sleep(3500);
  await page.screenshot({ path: `/tmp/shots/map_${b}.png` });
}
if (process.env.GEAR) {
  await ev(() => game.scene.getScene('Map').children.list.forEach(() => 0));
  const [gx, gy] = await ev(() => { const c = game.canvas.getBoundingClientRect(); return [c.left + (1510 + 46) * c.width / 1920, c.top + (20 + 50) * c.height / 1080]; });
  await page.mouse.click(gx, gy); await sleep(1500);
  console.log('modal', await ev(() => game.scene.isActive('Modal')), 'map paused', await ev(() => game.scene.isPaused('Map')));
  await page.screenshot({ path: '/tmp/shots/map_settings.png' });
  await page.keyboard.press('Escape'); await sleep(800);
  console.log('after ESC map running', await ev(() => game.scene.isActive('Map') && !game.scene.isPaused('Map')));
}
console.log('errors', errors.join('\n') || 'none');
await browser.close();
