// Usage: node tools/screenshot.mjs <url> <out.png> [steps.json]
// steps: [{"wait":ms} | {"click":[x,y]} (game coords 1920x1080) | {"shot":"name.png"} | {"eval":"js"}]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [url, out = 'shots/shot.png', stepsFile] = process.argv.slice(2);
const steps = stepsFile ? JSON.parse(fs.readFileSync(stepsFile, 'utf8')) : [{ wait: 3000 }, { shot: out }];
fs.mkdirSync('shots', { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
await page.goto(url, { waitUntil: 'load' });

const toPage = async (x, y) => page.evaluate((x, y) => {
  const c = document.querySelector('canvas').getBoundingClientRect();
  return [c.left + x * c.width / 1920, c.top + y * c.height / 1080];
}, x, y);

for (const s of steps) {
  if (s.wait) await new Promise((r) => setTimeout(r, s.wait));
  if (s.click) { const [x, y] = await toPage(...s.click); await page.mouse.click(x, y); }
  if (s.move) { const [x, y] = await toPage(...s.move); await page.mouse.move(x, y); }
  if (s.eval) logs.push('[eval] ' + JSON.stringify(await page.evaluate(s.eval)));
  if (s.shot) await page.screenshot({ path: s.shot.includes('/') ? s.shot : `shots/${s.shot}` });
}
console.log(logs.join('\n'));
await browser.close();
