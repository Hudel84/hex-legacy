// v0.20.2: hobgoblin facing on both sides, and enemies walking into hidden player traps (Sappeur start talent: traps).
// Usage: node tools/browser/traps.mjs "http://localhost:4174/?test"  → /tmp/shots/trap_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false })); localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { tavern: 2 }, runs: 1, wins: 0, bestFloor: 1 })); });
await page.reload({ waitUntil: 'load' }); await sleep(3000);
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'dwarf_hero_sapper_master'; s.start(); }); await sleep(2500);
await ev(() => { const sc = game.scene.getScene('Talent'); if (sc?.sys.isActive()) sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2500);
// player: hobgoblins added; enemy: hobgoblins + goblins
await ev(() => {
  const r = hexRun(); r.army.push({ unitId: 'neutral_hobgoblin_captain', alloc: 0, level: 0, ups: [] });
  const n = r.map.find((x) => x.floor === 0); r.currentNode = n.id;
  const cfg = hexDebug.battleConfig(n, { army: [{ id: 'neutral_hobgoblin_captain', count: 6 }, { id: 'neutral_goblin_raider', count: 14 }], hero: { atk: 0, def: 0 } });
  window.__traps = cfg.setup.player.mods.traps;
  game.scene.getScenes(true)[0].scene.start('Battle', { config: cfg });
});
for (let i = 0; i < 60 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
await page.screenshot({ path: '/tmp/shots/trap_start.png' });
console.log('player trap mod', await ev(() => window.__traps));
console.log('traps on the field', await ev(() => [...game.scene.getScene('Battle').battle.traps.entries()].map(([k, v]) => k + ':' + v.side).join(' ')));
// auto battle, count sprung enemy traps
await ev(() => { const sc = game.scene.getScene('Battle'); window.__sprung = 0; const orig = sc.battle.act.bind(sc.battle); sc.battle.act = (a) => { const evs = orig(a); for (const e of evs) if (e.type === 'trap' && e.on === false && e.uid !== undefined && sc.battle.stack(e.uid)?.side === 'enemy') window.__sprung++; return evs; }; if (!sc.auto) sc.toggleAuto(); });
const t0 = Date.now(); let shot = false;
while (!(await ev(() => !!game.scene.getScene('Battle').battle.winner)) && Date.now() - t0 < 200000) { await sleep(700); if (!shot && await ev(() => window.__sprung > 0)) { shot = true; await sleep(300); await page.screenshot({ path: '/tmp/shots/trap_sprung.png' }); } }
console.log('winner', await ev(() => game.scene.getScene('Battle').battle.winner), 'enemy stacks caught', await ev(() => window.__sprung));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
