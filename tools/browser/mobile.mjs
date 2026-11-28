// v0.21 phones: rotate hint (portrait), canvas fits the visible screen (landscape, browser bars), full screen button,
// touch in battle (tap = preview, tap again = attack, hold = unit card), map (hold on node / drag do not travel).
// Usage: node tools/browser/mobile.mjs "http://localhost:4174/?test"  → /tmp/shots/mob_*.png
import puppeteer from 'puppeteer-core';
const url = process.argv[2] ?? 'http://localhost:4174/?test';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
const phone = (w, h) => page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2, isLandscape: w > h });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (f, a) => page.evaluate(f, a);
const toPage = ([x, y]) => ev(([x, y]) => { const c = game.canvas.getBoundingClientRect(); return [c.left + x * c.width / 1920, c.top + y * c.height / 1080]; }, [x, y]);
const fit = () => ev(() => { const c = game.canvas.getBoundingClientRect(); return { l: Math.round(c.left), t: Math.round(c.top), w: Math.round(c.width), h: Math.round(c.height), iw: innerWidth, ih: innerHeight, ok: c.bottom <= innerHeight + 1 && c.right <= innerWidth + 1 && c.top >= -1 }; });
const hold = async (x, y, ms = 800) => { await page.touchscreen.touchStart(x, y); await sleep(ms); await page.touchscreen.touchEnd(); };

await phone(390, 844);
await page.goto(url, { waitUntil: 'load' }); await sleep(2500);
await ev(() => { localStorage.clear(); localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false })); });
await page.reload({ waitUntil: 'load' }); await sleep(3500);
console.log('coarse pointer', await ev(() => matchMedia('(pointer: coarse)').matches));
console.log('portrait: rotate hint', await ev(() => document.getElementById('hex-rotate')?.style.display));
await page.screenshot({ path: '/tmp/shots/mob_portrait.png' });
await phone(844, 390); await sleep(1500);
console.log('landscape: rotate hint', await ev(() => document.getElementById('hex-rotate')?.style.display), 'fit', JSON.stringify(await fit()));
await page.screenshot({ path: '/tmp/shots/mob_title.png' });
await phone(844, 330); await sleep(1500); // browser bars visible: less height
console.log('bars shown: fit', JSON.stringify(await fit()));
await phone(844, 390); await sleep(1000);
console.log('fullscreen button on title', await ev(() => game.scene.getScene('Title').children.list.some((o) => o.type === 'Container' && o.list?.some((c) => c.type === 'Graphics'))));
// default text size for a fresh phone save: "very large"
await ev(() => localStorage.removeItem('hexlegacy.settings.v1')); await page.reload({ waitUntil: 'load' }); await sleep(3000);
console.log('fresh phone: version text size (22px normal, ~31px very large)', await ev(() => game.scene.getScene('Title').versionText.style.fontSize));
await ev(() => { localStorage.setItem('hexlegacy.settings.v1', JSON.stringify({ lang: 'de', tactics: false, textSize: 2 })); }); await page.reload({ waitUntil: 'load' }); await sleep(3000);

// run → map
await ev(() => game.scene.getScene('Title').scene.start('HeroSelect')); await sleep(2000);
await ev(() => { const s = game.scene.getScene('HeroSelect'); s.selected = 'human_hero_knight_commander'; s.start(); }); await sleep(2500);
for (let i = 0; i < 20; i++) { const k = await ev(() => game.scene.getScenes(true).map((s) => s.scene.key).join(',')); if (k.includes('Map') && !k.includes('Talent')) break; if (k.includes('Talent')) await ev(() => { const sc = game.scene.getScene('Talent'); sc.children.list.find((o) => o.type === 'Container' && o.listenerCount('pointerup') > 0)?.emit('pointerup'); }); await sleep(1500); }
await sleep(1500);
await page.screenshot({ path: '/tmp/shots/mob_map.png' });
// hold a reachable node: label shows, no travel
const node = await ev(() => { const sc = game.scene.getScene('Map'); const cam = sc.cameras.main; const r = hexRun(); const n = r.map.find((m) => m.floor === 0); const ic = sc.children.list.find((o) => o.type === 'Image' && o.input?.enabled && o.listenerCount('pointerup') > 0 && Math.abs(o.x - (o.x)) < 1 && o.scrollFactorY !== 0); return [ic.x - cam.scrollX, ic.y - cam.scrollY]; });
const [nx, ny] = await toPage(node);
await page.touchscreen.touchStart(nx, ny); await sleep(800);
await page.screenshot({ path: '/tmp/shots/mob_map_hold.png' });
await page.touchscreen.touchEnd(); await sleep(1200);
console.log('hold node: travelled?', await ev(() => hexRun().visited.length > 0 || game.scene.getScene('Map').busy));
// drag starting on the node: scrolls, no travel
const sy0 = await ev(() => game.scene.getScene('Map').cameras.main.scrollY);
await page.touchscreen.touchStart(nx, ny); for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(nx, ny + i * 12); await sleep(30); } await page.touchscreen.touchEnd(); await sleep(1200);
console.log('drag from node: scroll', sy0, '→', await ev(() => game.scene.getScene('Map').cameras.main.scrollY), 'travelled?', await ev(() => hexRun().visited.length > 0 || game.scene.getScene('Map').busy));
// short tap travels
await ev(() => { const cam = game.scene.getScene('Map').cameras.main; cam.scrollY = cam.getBounds ? cam.scrollY : cam.scrollY; });
const node2 = await ev(() => { const sc = game.scene.getScene('Map'); const cam = sc.cameras.main; const ic = sc.children.list.find((o) => o.type === 'Image' && o.input?.enabled && o.listenerCount('pointerup') > 0 && o.scrollFactorY !== 0); return [ic.x - cam.scrollX, ic.y - cam.scrollY]; });
const [tx, ty] = await toPage(node2); await page.touchscreen.tap(tx, ty);
for (let i = 0; i < 60 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
console.log('tap node → battle', await ev(() => game.scene.isActive('Battle')));
await sleep(500);
await page.screenshot({ path: '/tmp/shots/mob_battle.png' });

// battle: tap enemy once = preview only, again = attack
const st = await ev(() => { const b = game.scene.getScene('Battle').battle; const a = b.active; const sc = game.scene.getScene('Battle'); const e = b.stacks.find((s) => s.side === 'enemy' && s.count > 0 && sc.actionAt(...window.__stackXY(s.uid))) ?? b.stacks.find((s) => s.side === 'enemy' && s.count > 0); return { active: a.def.id, ranged: !!a.def.ranged, enemy: e.uid, count: e.count, round: b.round }; });
console.log('active', JSON.stringify(st), 'action at enemy', await ev((u) => { const sc = game.scene.getScene('Battle'); const [x, y] = window.__stackXY(u); const s = sc.battle.stack(u); return JSON.stringify([sc.actionAt(x, y)?.action ?? null, s.pos, sc.battle.active.pos, s.def.wide ?? false]); }, st.enemy));
const [ex, ey] = await toPage(await ev((u) => window.__stackXY(u), st.enemy));
await page.touchscreen.tap(ex, ey); await sleep(700);
const hint1 = await ev(() => game.scene.getScene('Battle').tapHint?.text);
const after1 = await ev((u) => ({ count: game.scene.getScene('Battle').battle.stack(u).count, active: game.scene.getScene('Battle').battle.active?.def.id, info: game.scene.getScene('Battle').infoText.text }), st.enemy);
console.log('after 1st tap', JSON.stringify(after1), 'label', hint1);
await page.screenshot({ path: '/tmp/shots/mob_battle_tap1.png' });
await page.touchscreen.tap(ex, ey); await sleep(3500);
console.log('after 2nd tap: enemy count', st.count, '→', await ev((u) => game.scene.getScene('Battle').battle.stack(u).count, st.enemy));
for (let i = 0; i < 40 && !(await ev(() => game.scene.getScene('Battle')?.inputOpen)); i++) await sleep(500);
// hold an own stack = unit card
const own = await ev(() => game.scene.getScene('Battle').battle.stacks.find((s) => s.side === 'player' && s.count > 0).uid);
const [ox, oy] = await toPage(await ev((u) => window.__stackXY(u), own));
await page.touchscreen.touchStart(ox, oy); await sleep(800);
console.log('hold own stack: card open (finger still down)', await ev(() => !!game.scene.getScene('Battle').infoOpen?.active));
await page.touchscreen.touchEnd(); await sleep(500);
console.log('after release: card still open', await ev(() => !!game.scene.getScene('Battle').infoOpen?.active));
await page.screenshot({ path: '/tmp/shots/mob_battle_card.png' });
await page.touchscreen.tap(400, 200); await sleep(700);
console.log('tap closes card', !(await ev(() => !!game.scene.getScene('Battle').infoOpen?.active)));
console.log('errors', errors.join('\n') || 'none');
await browser.close();
