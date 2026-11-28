// Item found after a battle (v0.20.4): worn item with stats and "if equipped" changes; also the ring case.
// Usage: node tools/browser/itemfind.mjs [url]  → /tmp/shots/find_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev((ts) => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', textSize: ts })); }, Number(process.env.TS ?? 0));
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
const cases = [['weapon', { weapon: { uid: 901, id: 'weapon_rusty_short_sword' } }, { uid: 902, id: 'weapon_steel_longsword', bonus: { key: 'atk', v: 1 } }],
  ['rings', { ring1: { uid: 903, id: 'ring_copper_band' }, ring2: { uid: 904, id: 'ring_silver_band' } }, { uid: 905, id: 'ring_iron_signet' }],
  ['free', {}, { uid: 906, id: 'weapon_war_hammer' }]];
for (const [name, equip, found] of cases) {
  // back to the map first, so every case starts from the same place
  await ev(() => { for (const sc of game.scene.getScenes(true)) if (sc.scene.key !== 'Map') sc.scene.stop(); if (!game.scene.isActive('Map')) game.scene.start('Map'); });
  await sleep(2500);
  await ev(([equip, found]) => {
    const r = hexRun(); r.equip = equip; const n = r.map.find((x) => x.floor === 0); r.currentNode = n.id;
    const cfg = hexDebug.battleConfig(n, hexDebug.buildEnemy(n)); cfg.reward.xp = 0; cfg.reward.draft = false;
    game.scene.getScene('Map').scene.start('Reward', { config: cfg });
    setTimeout(() => { const rs = game.scene.getScene('Reward'); rs.itemFind = found; rs.showItemFind(); }, 500);
  }, [equip, found]);
  await sleep(4000);
  await page.screenshot({ path: `/tmp/shots/find_${name}.png` });
  console.log(name, await ev(() => game.scene.getScenes(true).map((s) => s.scene.key).join(',')));
}
console.log('errors', errors.join('\n') || 'none');
await browser.close();
