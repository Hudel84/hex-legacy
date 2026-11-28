// v0.20.4: settings from the battle (gear top right, battle paused, ESC resumes, music volume change),
// and a treasure goblin keeps the battle going after the last real enemy.
// Usage: node tools/browser/battle_qol.mjs [url]  → /tmp/shots/bq_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const toPage = ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false, musicVolume: 0.5 })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
await ev(() => {
  const r = hexRun(); const n = r.map.find((x) => x.floor === 0); r.currentNode = n.id;
  const cfg = hexDebug.battleConfig(n, { army: [{ id: 'neutral_giant_rat', count: 1 }, { id: 'neutral_treasure_goblin', count: 6, act: 1 }], hero: { atk: 0, def: 0 } });
  game.scene.getScene('Map').scene.start('Battle', { config: cfg });
});
for (let i = 0; i < 60 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
// gear
const [gx, gy] = await toPage([1920 - 60, 58]); await page.mouse.click(gx, gy); await sleep(1500);
console.log('modal', await ev(() => game.scene.isActive('Modal')), 'battle paused', await ev(() => game.scene.isPaused('Battle')));
await page.screenshot({ path: '/tmp/shots/bq_settings.png' });
// music volume + (row 2 is music at y = 540 - 135 = 405 in the panel... use the scene objects)
const plus = await ev(() => { const m = game.scene.getScene('Modal'); const imgs = []; m.panel.each((o) => { if (o.texture?.key === 'ui_button_plus') { const t = o.getWorldTransformMatrix(); imgs.push([t.tx, t.ty]); } }); return imgs[0]; });
const [px, py] = await toPage(plus); await page.mouse.click(px, py); await sleep(400);
console.log('music volume now', await ev(() => JSON.parse(localStorage.getItem('hexlegacy.settings.v1')).musicVolume));
await page.keyboard.press('Escape'); await sleep(900);
console.log('after ESC battle running', await ev(() => game.scene.isActive('Battle') && !game.scene.isPaused('Battle')));
// auto battle: the rat dies first, the goblin keeps the battle going
await ev(() => { const sc = game.scene.getScene('Battle'); if (!sc.auto) sc.toggleAuto(); });
let afterRat = false; const t0 = Date.now();
while (!(await ev(() => !!game.scene.getScene('Battle').battle.winner)) && Date.now() - t0 < 120000) {
  await sleep(500);
  if (await ev(() => { const b = game.scene.getScene('Battle').battle; const rat = b.stacks.find((s) => s.def.id === 'neutral_giant_rat'); const gob = b.stacks.find((s) => s.def.id === 'neutral_treasure_goblin'); return rat.count <= 0 && gob.count > 0 && !b.winner; })) afterRat = true;
}
console.log('battle went on after the rat', afterRat, 'winner', await ev(() => game.scene.getScene('Battle').battle.winner), 'goblin killed', await ev(() => game.scene.getScene('Battle').battle.treasureKilled()));
await sleep(2500);
await page.screenshot({ path: '/tmp/shots/bq_end.png' });
console.log('errors', errors.join('\n') || 'none');
await browser.close();
