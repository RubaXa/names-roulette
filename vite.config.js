import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { cpSync, mkdirSync } from 'node:fs'

// @purpose Copy runtime data (names JSON + 253 card images) into the build output.
// @invariant data/ lives at repo ROOT, not public/, because the python generation pipeline
//   (generate_images.py, enrich_names.py, fetch_mos_names.py) writes there alongside source
//   CSVs/checkpoints we must NOT ship. publicDir can't cherry-pick, so this plugin copies only
//   the two things the app fetches at runtime: names_enriched.json and images/.
// @invariant Without this, `vite build`/`vite preview` produce a dist without data/ → cards lose
//   images and names fall back to ALL_NAMES (no origin/meaning). Dev works regardless (Vite serves
//   the repo root), which is why the regression was invisible until preview/deploy.
function copyDataPlugin() {
  return {
    name: 'copy-data',
    writeBundle() {
      mkdirSync('dist/data', { recursive: true })
      cpSync('data/names_enriched.json', 'dist/data/names_enriched.json')
      cpSync('data/images', 'dist/data/images', { recursive: true })
    },
  }
}

export default defineConfig({
  plugins: [vue(), copyDataPlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: parseInt(process.env.PORT || '4200'),
    strictPort: false,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  base: '/secret-stork/',
  build: {
    rollupOptions: {
      external: (id) => id.startsWith('https://'),
    },
  },
})
