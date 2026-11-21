import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
let errors = [];
page.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 3).join(' | ')));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await page.evaluateOnNewDocument((ts) => localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', textSize: ts })), Number(process.env.TS ?? 0));
await page.goto('http://localhost:4174/?test', { waitUntil: 'load' }); await sleep(3000);
await page.evaluate(() => { localStorage.removeItem('hexlegacy.run.v1'); game.scene.getScene('Title').scene.start('HeroSelect'); }); await sleep(2000);
await page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.selected = process?.x ?? 'elf_hero_ranger_leader'; s.start(); }).catch(async () => page.evaluate(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'elf_hero_ranger_leader'; s.start(); }));
await sleep(2500);
const ids = ['wounded_soldier','wishing_well','bandit_ambush','cave_treasure','mercenary_camp','forest_shrine','knight_tournament','dormant_forge'];
const kinds = [...ids.map((e) => ({ kind: 'event', eventId: e })), { kind: 'shop' }, { kind: 'rest' }, { kind: 'treasure' }, { kind: 'shrine' }];
for (const d of kinds) {
  errors = [];
  await page.evaluate(() => { game.scene.getScenes(true).forEach((s) => s.scene.key !== 'Modal' && s.scene.stop()); }); await sleep(600);
  await page.evaluate((d) => { game.scene.start('Node', d); }, d);
  await sleep(2200);
  const info = await page.evaluate(() => { const sc = game.scene.getScene('Node'); return 'box=' + (sc.box?.list?.length ?? 'none'); });
  console.log(d.kind, d.eventId ?? '', info, errors.join(' ; ') || 'ok');
  if (d.eventId) await page.screenshot({ path: `/tmp/shots/ev_${d.eventId}.png` });
}
await browser.close();
