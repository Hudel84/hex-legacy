import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (n) => page.screenshot({ path: `/tmp/shots/${n}.png` });
const ev = (f, a) => page.evaluate(f, a);
await page.evaluateOnNewDocument(() => localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de' })));
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' });
await sleep(3000);
await ev((lang) => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang })); game.scene.getScene('Title').scene.start('HeroSelect'); }, 'de');
await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'elf_hero_ranger_leader'; s.start(); });
await sleep(2500);
console.log(await ev(() => JSON.stringify(hexRun().army) + ' biome=' + hexRun().biome));
// 1) boss battle: turn a floor-0 node into the boss
await ev(() => { const r = hexRun(); r.biome = 'meadows'; r.leadership = 400; r.army.forEach((s, i) => { s.level = 3; s.ups = []; }); const n = r.map.find((x) => x.floor === 0); n.type = 'boss'; game.scene.getScene('Map').travel(n); });
await sleep(7000);
await shot('01_boss_start');
for (let i = 0; i < 12; i++) {
  await ev(() => { const sc = game.scene.getScene('Battle'); if (sc.battle && !sc.auto) sc.toggleAuto(); });
  await sleep(2500);
  if (i === 2 || i === 6) await shot('02_boss_' + i);
}

for (let i = 0; i < 30; i++) { const w = await ev(() => game.scene.getScene('Battle').battle?.winner ?? ''); if (w) break; await ev(() => { const sc = game.scene.getScene('Battle'); if (sc.battle && !sc.auto) sc.toggleAuto(); }); await sleep(2000); }
console.log('winner', await ev(() => game.scene.getScene('Battle').battle.winner));
await ev(() => { const sc = game.scene.getScene('Battle'); sc.scene.start('Reward', { config: sc.cfg, treasure: true }); });
await sleep(1200); await shot('03_reward_summary');
await sleep(2500); await ev(() => { const sc = game.scene.getScene('Reward'); sc.levelUps = 0; sc.next(); }); await sleep(800); await shot('04_relic_choice');
await ev(() => { const sc = game.scene.getScene('Reward'); sc.levelUps = 0; });
// rest: upgrade choice through the real buttons
await ev(() => { game.scene.getScenes(true).forEach((s) => s.scene.key !== 'Modal' && s.scene.stop()); const r = hexRun(); const s = r.army[0]; s.level = 4; s.ups = ['f_edge','f_crit','f_swift','f_glass']; r.army[1].level = 3; r.army[1].ups = ['r_quiver','r_mark','r_fire']; game.scene.start('Node', { kind: 'rest' }); });
await sleep(2500);
const clickBtn = (i) => ev((i) => { const sc = game.scene.getScene('Node'); const all = []; const walk = (o) => { if ((o.listenerCount?.('pointerup') > 0 && o.input?.enabled)) all.push(o); (o.list ?? []).forEach(walk); }; sc.children.list.forEach(walk); const lab = (x) => x.label?.text ?? x.list?.find?.((y) => y.text)?.text ?? ''; const b = typeof i === 'string' ? all.find((x) => lab(x).includes(i)) : all[i]; b?.emit('pointerup'); return all.length + ':' + all.map((x) => x.label?.text ?? x.list?.find?.((y) => y.text)?.text).join('|'); }, i);
console.log(await clickBtn('trainieren')); await sleep(800); await shot('05_rest_slots');
console.log(await clickBtn('Späher')); await sleep(1200); await shot('06_upgrade_choice_cap');
await ev(() => { const sc = game.scene.getScene('Node'); const all = []; const walk = (o) => { if (o.listenerCount?.('pointerup') > 0 && o.input?.enabled) all.push(o); (o.list ?? []).forEach(walk); }; sc.children.list.forEach(walk); const c = all.filter((x) => x.depth === 0 && x.parentContainer?.depth === 8500)[0]; c?.emit('pointerup'); });
await sleep(1500); await shot('07_after_pick');
console.log(await clickBtn(2)); await sleep(1000); await shot('08_unitinfo');
console.log('army', await ev(() => JSON.stringify(hexRun().army)));
console.log(await ev(() => { const sc = game.scene.getScene('Battle'); return 'traps=' + sc.battle.traps.size + ' round=' + sc.battle.round + ' log=' + (sc.logLines ?? []).slice(-8).join(' | '); }));
console.log('errors:', errors.join('\n') || 'none');
await browser.close();
