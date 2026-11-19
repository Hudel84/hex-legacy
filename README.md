# Hex Legacy

A turn-based tactics roguelite in the spirit of *Heroes of Might and Magic*, played in the browser.
Free, non-commercial fan project by Ben. Code by Claude (Anthropic).

**Play:** https://hudel84.github.io/hex-legacy/

## Tech
- [Phaser 4](https://phaser.io) + TypeScript, bundled with Vite
- Game resolution 1920×1080, scaled to the window
- All texts via localization keys: `src/i18n/en.json` (main language) and `de.json`

## Structure
- `src/scenes/` – Boot, Preload, Title, Modal (settings/credits)
- `src/core/` – settings (localStorage), i18n, audio, theme
- `src/ui/` – reusable UI (buttons, toasts)
- `public/assets/` – web versions of the art and audio (generated, see below)
- `tools/build_web_assets.py` – builds `web_assets/` from the original files in Ben's project folder
  (WebP in game size, OGG, re-encoded loops). The originals are never changed.
- `tools/screenshot.mjs` – headless-Chrome test runner used for automated checks

## Commands
```
npm install
npm run dev      # local dev server
npm run build    # production build into dist/
```
Every push to `main` is deployed to GitHub Pages by `.github/workflows/deploy.yml`.

## Credits
Sound effects & hero voices: elevenlabs.io · Music: Made with ElevenMusic ·
Art: Higgsfield, Freebeat · Fonts: Cinzel, Alegreya (SIL OFL)
