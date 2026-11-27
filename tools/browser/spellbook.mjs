// Spellbook: clicking the lower half of a spell row selects the spell (v0.18.2); count plates above units.
// Usage: node tools/browser/spellbook.mjs "http://localhost:4174/?test"  → /tmp/shots/sb_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const toPage = ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false })); localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { tavern: 2 }, runs: 1, wins: 0, bestFloor: 1 })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_priestess_of_light'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
// crowded set-up: all own stacks in one column next to each other, so plates would be hidden by the unit in front
await ev(() => { const r = hexRun(); r.leadership = 300; r.formation = { human_t2_crossbowman: { col: 0, row: 2 }, human_t4_cleric: { col: 0, row: 3 } }; game.scene.getScene('Map').travel(r.map.find((n) => n.floor === 0)); });
for (let i = 0; i < 60 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
await page.screenshot({ path: '/tmp/shots/sb_plates.png' });
const results = [];
for (const where of [[60, 120], [450, 125], [250, 20]]) {   // lower half of the icon, lower right, top
  await ev(() => game.scene.getScene('Battle').openBook()); await sleep(500);
  const z = await ev(() => { const sc = game.scene.getScene('Battle'); const zs = []; sc.bookOpen.each((o) => { if (o.type === 'Container') o.each((k) => { if (k.type === 'Zone') { const m = k.getWorldTransformMatrix(); zs.push([m.tx, m.ty]); } }); }); return zs; });
  if (!z.length) { results.push('no zone (no castable spell?)'); break; }
  if (results.length === 0) await page.screenshot({ path: '/tmp/shots/sb_book.png' });
  const [px, py] = await toPage([z[0][0] + where[0], z[0][1] + where[1]]);
  await page.mouse.move(px, py); await sleep(150); await page.mouse.click(px, py); await sleep(500);
  const st = await ev(() => { const sc = game.scene.getScene('Battle'); return { bookOpen: !!sc.bookOpen, targeting: sc.spellTargeting, cast: sc.battle.castThisRound.player }; });
  results.push(`${where} -> ${JSON.stringify(st)}`);
  await ev(() => { const sc = game.scene.getScene('Battle'); sc.cancelSpell(); sc.closeBook(); });
  await sleep(300);
}
console.log(results.join('\n'));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
