import { defineConfig } from 'vite';

// base './' so the build works on GitHub Pages (/hex-legacy/) and on itch.io alike
export default defineConfig({
  base: './',
  build: { assetsDir: 'js', chunkSizeWarningLimit: 2000, assetsInlineLimit: 0 },
  server: { host: true },
});
