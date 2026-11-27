// Tactics set-up (v0.18) and battle rating: first battle of a fresh run with real mouse clicks.
// Usage: node tools/browser/tactics.mjs "http://localhost:4174/?test"  → screenshots in /tmp/shots
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, ...a) => page.evaluate(f, ...a);
const scene = (k) => ev((k) => !!game.scene.getScene(k)?.sys.isActive(), k);
const waitFor = async (k, ms = 30000) => { const t0 = Date.now(); while (!(await scene(k))) { if (Date.now() - t0 > ms) throw new Error('timeout ' + k); await sleep(300); } };
// game -> page coordinates (canvas is scaled to fit 1280x720)
const toPage = async ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
const click = async (xy) => { const [px, py] = await toPage(xy); await page.mouse.move(px, py); await sleep(150); await page.mouse.click(px, py); await sleep(400); };

await page.goto(url, { waitUntil: 'load' });
await sleep(3000);
const lang = process.env.LANG_DE ? 'de' : 'en';
await ev((lang) => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang })); }, lang);
await page.reload({ waitUntil: 'load' }); await sleep(3000);
// city: War Council level 1 when CITY=1 (3 columns)
if (process.env.CITY) await ev(() => localStorage.setItem('hexlegacy.meta.v1', JSON.stringify({ version: 2, res: {}, buildings: { townHall: 1, warCouncil: 1 }, runs: 0, wins: 0, bestFloor: 0 })));
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect'));
await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); });
await sleep(2500);
if (await scene('Talent')) { await ev(() => { const sc = game.scene.getScene('Talent'); sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0).emit('pointerup'); }); await sleep(2000); }
await waitFor('Map');
await sleep(1500);
if (process.env.STRONG) await ev(() => { const r = hexRun(); r.atk = 30; r.def = 30; r.leadership = 400; });
await ev(() => { const sc = game.scene.getScene('Map'); const r = hexRun(); sc.travel(r.map.find((n) => n.floor === 0)); });
await waitFor('Battle', 60000);
await sleep(3500);
const info = await ev(() => { const sc = game.scene.getScene('Battle'); return { deploying: sc.deploying, cols: sc.deployCols, own: sc.battle.stacks.filter((s) => s.side === 'player').map((s) => [s.uid, s.def.id, s.pos.col, s.pos.row]) }; });
console.log('deploy phase', JSON.stringify(info));
await page.screenshot({ path: '/tmp/shots/t1_deploy.png' });
// select first stack, hover a target hex, move it
const [uid0] = info.own[0];
await click(await ev((u) => window.__stackXY(u), uid0));
const target = [info.cols - 1, 3];
const [tx, ty] = await toPage(await ev(([c, r]) => window.__hexXY(c, r), target));
await page.mouse.move(tx, ty); await sleep(300);
await page.screenshot({ path: '/tmp/shots/t2_selected.png' });
await page.mouse.click(tx, ty); await sleep(600);
// swap: click the second stack, then the first one's hex
if (info.own[1]) { await click(await ev((u) => window.__stackXY(u), info.own[1][0])); await click(await ev((u) => window.__stackXY(u), uid0)); }
await sleep(400);
const after = await ev(() => game.scene.getScene('Battle').battle.stacks.filter((s) => s.side === 'player').map((s) => [s.uid, s.pos.col, s.pos.row]));
console.log('after moves', JSON.stringify(after));
await page.screenshot({ path: '/tmp/shots/t3_moved.png' });
// start with the button (Enter)
await page.keyboard.press('Enter'); await sleep(800);
console.log('started', await ev(() => { const sc = game.scene.getScene('Battle'); return { deploying: sc.deploying, round: sc.battle.round, formation: hexRun().formation }; }));
// let auto fight finish
await ev(() => { const sc = game.scene.getScene('Battle'); if (!sc.auto) sc.toggleAuto(); });
const t0 = Date.now();
while (!(await ev(() => !!game.scene.getScene('Battle').battle.winner)) && Date.now() - t0 < 240000) await sleep(1000);
await sleep(2500);
const res = await ev(() => { const b = game.scene.getScene('Battle').battle; return { winner: b.winner, loss: b.lossShare('player'), stacks: b.stacks.filter((s) => s.side === 'player').map((s) => [s.def.id, s.count, s.startCount, s.def.cost, s.summonRounds]) }; });
console.log('result', JSON.stringify(res));
await page.screenshot({ path: '/tmp/shots/t4_result.png' });
if (res.winner === 'player') {
  const btn = await ev(() => { const sc = game.scene.getScene('Battle'); const b = sc.children.list.filter((o) => typeof o.setEnabled === 'function' && o.visible && o.alpha > 0.5).pop(); return b ? [b.x, b.y] : null; });
  await ev(() => { const sc = game.scene.getScene('Battle'); const st = sc.scene.start.bind(sc.scene); sc.scene.start = (k, d) => { window.__startData = JSON.stringify({ k, rank: d?.rank }); return st(k, d); }; });
  if (btn) await click(btn);
  console.log('start data', await ev(() => window.__startData));
  await waitFor('Reward');
  await sleep(600);
  await page.screenshot({ path: '/tmp/shots/t5_reward.png' });
  console.log('reward loot', await ev(() => JSON.stringify(game.scene.getScene('Reward').loot)), 'rank', await ev(() => game.scene.getScene('Reward').rank?.rank));
}
// next battle: formation remembered?
console.log('formation saved', await ev(() => JSON.stringify(hexRun().formation)));
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await browser.close();
