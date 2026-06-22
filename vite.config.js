import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
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
  base: '/names-roulette/',
  build: {
    rollupOptions: {
      external: (id) => id.startsWith('https://'),
    },
  },
})
