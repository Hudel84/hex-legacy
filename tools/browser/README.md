# Browser tests (puppeteer-core + Chrome, headless)

Run from a folder whose node_modules has `puppeteer-core`; Chrome at `/usr/bin/google-chrome`.
Serve the build first: `npm run build && python3 -m http.server 4174 --directory dist`.

- `ap2.mjs` – full autoplay run: `HERO=<heroId> node ap2.mjs "http://localhost:4174/?test" <minutes> strong`
- `vt.mjs` – boss battle (bandit king, traps), reward with treasure goblin, boss relic choice, rest upgrade choice, unit info → screenshots in /tmp/shots
- `evtest.mjs` – opens every event and node type (`TS=2` for the largest text size)
- `oldsave.mjs` – plays with an old build under /old/ and continues the save in the current build
- `tactics.mjs` – tactics set-up with real mouse clicks (select, move, swap, Enter), battle rating and reward (`LANG_DE=1`, `CITY=1` = War Council 1, `STRONG=1`) → /tmp/shots
- `fixtest2.mjs` – battle against chosen enemy units (check facing of sprites)

`?test` exposes `game`, `hexRun()` and `hexDebug.battleConfig(node, enemy)` on `window`.
