import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' }); await sleep(2500);
for (const [lang, ts, fac] of [['de', 0, 'human'], ['de', 2, 'undead'], ['en', 0, 'dwarf'], ['de', 0, 'demon']]) {
  await page.evaluate(([lang, ts]) => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang, textSize: ts }));
    localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { tavern: 2 }, runs: 1, wins: 0, bestFloor: 1 })); }, [lang, ts]);
  await page.reload({ waitUntil: 'load' }); await sleep(3000);
  await page.evaluate((f) => game.scene.getScene('Title').scene.start('HeroSelect', { selected: { human: 'human_hero_knight_commander', undead: 'undead_hero_death_lord', dwarf: 'dwarf_hero_thane', demon: 'demon_hero_pit_lord' }[f] }), fac); await sleep(3000);
  await page.screenshot({ path: `/tmp/shots/h_${lang}_${ts}_${fac}.png` });
}
// elite reward: 2 artifacts + 1 item
await page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(3000);
await page.evaluate(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
await page.evaluate(() => { const r = hexRun(); const n = r.map.find((x) => x.floor === 5); n.type = 'elite'; r.currentNode = n.id; const cfg = hexDebug.battleConfig(n, hexDebug.buildEnemy(n)); cfg.reward.xp = 0; game.scene.getScenes(true)[0].scene.start('Reward', { config: cfg, rank: 'S' }); });
await sleep(5000);
await page.screenshot({ path: '/tmp/shots/r_elite.png' });
console.log('errors', errors.join('\n') || 'none');
await browser.close();
