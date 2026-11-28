# Browser tests (puppeteer-core + Chrome, headless)

Run from a folder whose node_modules has `puppeteer-core`; Chrome at `/usr/bin/google-chrome`.
Serve the build first: `npm run build && python3 -m http.server 4174 --directory dist`.

- `ap2.mjs` – full autoplay run: `HERO=<heroId> node ap2.mjs "http://localhost:4174/?test" <minutes> strong`
- `vt.mjs` – boss battle (bandit king, traps), reward with treasure goblin, boss relic choice, rest upgrade choice, unit info → screenshots in /tmp/shots
- `evtest.mjs` – opens every event and node type (`TS=2` for the largest text size)
- `oldsave.mjs` – plays with an old build under /old/ and continues the save in the current build
- `tactics.mjs` – tactics set-up with real mouse clicks (select, move, swap, Enter), battle rating and reward (`LANG_DE=1`, `CITY=1` = War Council 1, `STRONG=1`, `NEUTRAL=<unit id>` = hired neutral in the army) → /tmp/shots
- `ui_cards.mjs` – hero selection (start talents; DE/EN, very large text) and elite reward with kind labels (Artifact / Equipment) → /tmp/shots
- `spellbook.mjs` – clicks the lower half / right side / top of a spell row in the spellbook (must select the spell) and a crowded set-up for the count plates → /tmp/shots
- `runend.mjs` – run end after a defeat in act 1 (or act 2 with argument 2) with lumber mill / ore mine: production only after the act-1 boss → /tmp/shots
- `shop.mjs` – shop (v0.19): main page, hiring a neutral with a full army (replace screen), equipment page; argument = act → /tmp/shots
- `ascension.mjs` – ascension (v0.20): selector in the hero selection (real click + tooltip), map badge, enemy mods/gold of the first fight, unlock on the run end screen → /tmp/shots
- `hover_hero.mjs` – v0.20.1: hovering an enemy shows its movement range in red; clicking the hero opens the hero screen (read-only, battle paused, ESC resumes) → /tmp/shots
- `traps.mjs` – v0.20.2: hobgoblin facing on both sides; enemies walk into the hidden traps of the Sappeur → /tmp/shots
- `battle_qol.mjs` – v0.20.4: settings from the battle (gear, paused, ESC, volume) and a treasure goblin battle
- `mapview.mjs` – map screenshots per biome (contrast), `GEAR=1` also opens the settings from the map
- `itemfind.mjs` – item found after a battle: worn item with stats and changes if equipped (weapon, two rings, free slot; `TS=2`)
- `mobile.mjs` – v0.21 phones (touch emulation): rotate hint in portrait, canvas fits landscape also with browser bars, full screen button, very large text by default, map (hold a node / drag from a node: no travel), battle (tap = preview + "tap again", second tap attacks, hold = unit card) → /tmp/shots/mob_*.png. `?touch` forces touch texts/buttons on a desktop browser
- `fixtest2.mjs` – battle against chosen enemy units (check facing of sprites)

`?test` exposes `game`, `hexRun()` and `hexDebug.battleConfig(node, enemy)` on `window`.
